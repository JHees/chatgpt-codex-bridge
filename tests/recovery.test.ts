import { afterEach, expect, it, vi } from "vitest";
import { Window } from "happy-dom";
import { start, stop, invokeHostCommand } from "../packages/renderer-plugin/src/index.js";
import { discoverAppChatRuntime } from "../packages/renderer-plugin/src/app-chat-runtime.js";
import { BridgeError } from "../packages/renderer-plugin/src/errors.js";
import type { LoaderApi } from "../packages/renderer-plugin/src/loader-interface.js";
import type { NativeCompletionInput } from "../packages/renderer-plugin/src/background-adapter.js";

vi.mock("../packages/renderer-plugin/src/app-chat-runtime.js", () => ({appChatEnvironment:vi.fn(),discoverAppChatRuntime:vi.fn()}));
const discover=vi.mocked(discoverAppChatRuntime);
const windows: Window[]=[];
const task={hostId:"local",taskId:"recovery-test"};
const status=()=>invokeHostCommand("status",{task});
afterEach(async()=>{stop();vi.useRealTimers();vi.unstubAllGlobals();vi.resetAllMocks();for(const window of windows.splice(0))await window.happyDOM.abort();});
function fixture() {
  vi.useFakeTimers(); const window=new Window({url:"app://-/index.html"});windows.push(window);
  window.document.documentElement.lang="en";vi.stubGlobal("document",window.document);vi.stubGlobal("location",window.location);
  const models=vi.fn(async()=>({options:[{slug:"planner",lane:"thinking",modelTitle:"Planner",selectedLabel:"High",thinkingEffort:"extended"}]}));
  const client={models,get:vi.fn(),getConversationStreamStatus:vi.fn(),startCompletionStream:vi.fn(),delete:vi.fn()};
  const runtime={client,isCurrent:vi.fn(()=>true)};
  discover.mockResolvedValue(runtime);
  const settings=window.document.createElement("section");window.document.body.append(settings);
  const api={version:"test",storage:{get:()=>null,set:()=>{}},settings:{registerPage:vi.fn((page:{render(root:HTMLElement):()=>void})=>{page.render(settings as unknown as HTMLElement);return {unregister:vi.fn(()=>{settings.replaceChildren();})};})}};
  return {runtime,client,api,settings};
}

it("recovers a cold start when App services appear later without reload or sending Chat",async()=>{
  const f=fixture(); discover.mockRejectedValueOnce(new BridgeError("APP_UNSUPPORTED","Not mounted yet"));
  start(f.api);await vi.advanceTimersByTimeAsync(0);
  expect(await status()).toMatchObject({compatibility:{background:false}});
  await vi.advanceTimersByTimeAsync(1000);
  expect(await status()).toMatchObject({compatibility:{background:true,backgroundError:null,backgroundRecovery:{state:"ready"}}});
  expect(discover).toHaveBeenCalledTimes(2);expect(f.api.settings.registerPage).toHaveBeenCalledTimes(1);
  expect(f.client.startCompletionStream).not.toHaveBeenCalled();
});

it("bounds discovery stalls, retries, and ignores a stale result after stop",async()=>{
  const f=fixture();let resolveOld!: (value:typeof f.runtime)=>void;
  discover.mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve;}));
  start(f.api);await vi.advanceTimersByTimeAsync(16000);
  expect(discover).toHaveBeenCalledTimes(2);
  expect(await status()).toMatchObject({compatibility:{background:true}});
  stop();resolveOld(f.runtime);await vi.advanceTimersByTimeAsync(60000);
  expect(vi.getTimerCount()).toBe(0);expect(discover).toHaveBeenCalledTimes(2);
  expect(f.client.models).toHaveBeenCalledTimes(1);
});

it("reconnects an invalid idle runtime without remounting UI",async()=>{
  const f=fixture();start(f.api);await vi.advanceTimersByTimeAsync(0);
  f.runtime.isCurrent.mockReturnValue(false);
  discover.mockResolvedValue({...f.runtime,isCurrent:()=>true});
  await vi.advanceTimersByTimeAsync(30000);
  expect(discover).toHaveBeenCalledTimes(2);
  expect(await status()).toMatchObject({compatibility:{background:true}});
  expect(f.api.settings.registerPage).toHaveBeenCalledTimes(1);
});

it("backs off repeated failures and manual Diagnose does not start parallel discovery",async()=>{
  const f=fixture(); discover.mockRejectedValue(new BridgeError("APP_UNSUPPORTED","Not ready"));
  start(f.api);await vi.advanceTimersByTimeAsync(18000);expect(discover).toHaveBeenCalledTimes(5);
  let resolve!: (value:typeof f.runtime)=>void;
  discover.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
  [...f.settings.querySelectorAll("button")].find(b=>b.textContent==="Diagnose")!.click();
  await vi.advanceTimersByTimeAsync(0);expect(discover).toHaveBeenCalledTimes(6);
  await vi.advanceTimersByTimeAsync(1000);expect(discover).toHaveBeenCalledTimes(6);
  resolve(f.runtime);await vi.advanceTimersByTimeAsync(0);
  expect(await status()).toMatchObject({compatibility:{background:true}});
  expect(f.client.startCompletionStream).not.toHaveBeenCalled();
});

it("does not remount or start network discovery if stopped before its startup microtask",async()=>{
  const f=fixture();start(f.api);stop();await vi.advanceTimersByTimeAsync(0);
  expect(discover).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
});

it("waits for a nonempty model catalog and releases a caller waiting on discovery when stopped",async()=>{
  const f=fixture();f.client.models.mockResolvedValueOnce({options:[]});
  start(f.api);await vi.advanceTimersByTimeAsync(0);
  expect(await status()).toMatchObject({compatibility:{background:false,backgroundError:"CHAT_MODELS_UNAVAILABLE"}});
  await vi.advanceTimersByTimeAsync(1000);expect(await status()).toMatchObject({compatibility:{background:true}});
  stop();discover.mockImplementation(()=>new Promise(()=>{}));start(f.api);await vi.advanceTimersByTimeAsync(0);
  const waiting=invokeHostCommand("exchange",{}).catch(error=>error);
  stop();await vi.advanceTimersByTimeAsync(0);
  expect(await waiting).toMatchObject({code:"SESSION_LOST"});expect(vi.getTimerCount()).toBe(0);
});

it("defers recovery while a real owned session is waiting and never resends its message",async()=>{
  const f=fixture();
  const settings={enabled:true,modelKey:'["planner","thinking","extended"]',maxRounds:3,readWindowSeconds:90,totalWaitMinutes:15,cleanup:"delete"};
  let snapshotId="",accept=false;
  const api:LoaderApi={...f.api,storage:{get:key=>key==="collaboration-defaults-v1"?settings:{version:1,origin:"chosen",settings},set:()=>{}},composer:{registerAccessory:spec=>{
    const root=document.createElement("span");document.body.append(root);spec.render(root,task);
    return {getStatus:()=>({available:true,...task}),getSubmission:bindingId=>({state:accept?"accepted":"prepared",bindingId,...task,turnId:"native-turn"}),
      prepareSubmission:input=>{snapshotId=input.revision;return {bindingId:"binding",state:"prepared"};},clearContext:()=>{},unregister:()=>{root.remove();}};
  }}};
  f.client.startCompletionStream.mockImplementation(async input=>{(input as NativeCompletionInput).onRequestStart();});
  start(api);await vi.advanceTimersByTimeAsync(1000);accept=true;
  const pending=invokeHostCommand("exchange",{task,bindingId:"binding",snapshotId,request:{protocol:"codex-chat-bridge/v1",sessionId:"session",turnId:"turn",kind:"request",objective:"Check",state:{phase:"verify",summary:"Ready",completed:[],blockers:[]},message:"Plan",actionResults:[]}}).catch(error=>error);
  await vi.advanceTimersByTimeAsync(0);
  expect(f.client.startCompletionStream).toHaveBeenCalledTimes(1);
  f.runtime.isCurrent.mockReturnValue(false);discover.mockResolvedValue({...f.runtime,isCurrent:()=>true});
  await vi.advanceTimersByTimeAsync(30000);
  expect(discover).toHaveBeenCalledTimes(1);
  expect(await status()).toMatchObject({active:{sessionId:"session"},compatibility:{backgroundRecovery:{state:"deferred"}}});
  await invokeHostCommand("finish",{task,sessionId:"session",policy:"retain",reason:"user-request"});
  expect(await pending).toMatchObject({code:"SESSION_ENDING"});
  await vi.advanceTimersByTimeAsync(30000);
  expect(discover).toHaveBeenCalledTimes(2);expect(f.client.startCompletionStream).toHaveBeenCalledTimes(1);
  expect(await status()).toMatchObject({active:null,compatibility:{background:true}});
});

it("retries partial UI startup after cleaning the failed registration",async()=>{
  const f=fixture();const unregister=vi.fn();f.api.settings.registerPage.mockReturnValue({unregister});
  let fail=true;
  const api={...f.api,composer:{registerAccessory:()=>{
    if(fail)throw new BridgeError("COMPOSER_UNAVAILABLE","Starting");
    return {getStatus:()=>({available:true}),getSubmission:()=>({state:"prepared"}),prepareSubmission:()=>({bindingId:"unused",state:"prepared"}),clearContext:()=>{},unregister:()=>{}};
  }}};
  start(api);await vi.advanceTimersByTimeAsync(0);expect(unregister).toHaveBeenCalledTimes(1);
  fail=false;await vi.advanceTimersByTimeAsync(1000);
  expect(await status()).toMatchObject({compatibility:{background:true,composer:true}});
  expect(f.api.settings.registerPage).toHaveBeenCalledTimes(2);
});
