import { afterEach, expect, it } from "vitest";
import { Window } from "happy-dom";
import { BridgeSession } from "../packages/renderer-plugin/src/session.js";
import { BridgeUi } from "../packages/renderer-plugin/src/bridge-ui.js";
import { ChatConfiguration, type ComposerIdentity } from "../packages/renderer-plugin/src/chat-configuration.js";
import type { ComposerHandle, LoaderApi } from "../packages/renderer-plugin/src/loader-interface.js";

const cleanup: Array<() => void> = [];
afterEach(() => { for (const stop of cleanup.splice(0)) stop(); });

function fixture(owner: ComposerIdentity = {hostId:"local",taskId:"task-a"}, failStorage = false) {
  const window=new Window({url:"app://-/index.html"});
  const document=window.document as unknown as Document;
  document.documentElement.lang="en";
  const settings=document.createElement("section"),composer=document.createElement("span");document.body.append(settings,composer);
  const values=new Map<string,unknown>();
  const configuration=new ChatConfiguration(undefined,{get:key=>values.get(key),set:(key,value)=>{if(failStorage)throw Error("storage");values.set(key,value);}});
  configuration.updateCatalog({options:[
    {slug:"reasoner",lane:"thinking",modelTitle:"Reasoner",selectedLabel:"Medium",thinkingEffort:"standard"},
    {slug:"planner-pro",lane:"pro",modelTitle:"Planner Pro",selectedLabel:"Pro"},
  ]});
  configuration.updateTask(owner,{modelKey:configuration.models()[0]!.key});
  const prepared: unknown[]=[];let contextState="idle";
  const api:LoaderApi={version:"test",storage:{get:()=>null,set:()=>{}},
    settings:{registerPage:page=>{expect(page.iconSvg).toContain('viewBox="0 0 24 24"');expect(page.iconSvg).toContain('aria-hidden="true"');page.render(settings);return{unregister(){settings.replaceChildren();}};}},
    composer:{registerAccessory:spec=>{spec.render(composer as unknown as HTMLElement,owner);const handle:ComposerHandle={
      getStatus:()=>({available:true,...("draftId" in owner?{draftId:owner.draftId}:owner),context:{state:contextState}}),
      prepareContext:input=>{prepared.push(input);contextState="prepared";},
      clearContext:()=>{contextState="idle";},unregister(){} };
      return handle;}
    },
  };
  const session=new BridgeSession(configuration,()=>{throw Error("No Chat used in UI tests");});
  const ui=new BridgeUi(document,api,session,async()=>{});ui.start();
  cleanup.push(()=>{ui.stop();session.stop();window.happyDOM.abort();});
  return {window,document,settings,composer,configuration,prepared,ui};
}

it("keeps global defaults off and never grants a draft task",async()=>{
  const f=fixture({draftId:"draft-a"});
  await Promise.resolve();
  expect(f.configuration.defaults().enabled).toBe(false);
  expect(f.settings.querySelector('input[type="checkbox"]')).toBeNull();
  expect(f.composer.querySelector(".bridge-compact")?.textContent).toContain("off");
  f.composer.querySelector<HTMLButtonElement>(".bridge-compact")!.click(); await Promise.resolve();
  expect(f.document.querySelector<HTMLInputElement>('.bridge-popover input[role="switch"]')?.disabled).toBe(true);
  expect(f.document.querySelector(".bridge-popover")?.textContent).toContain("Create the task first");
  expect(f.prepared).toHaveLength(0);
});

it("uses an explicit per-task switch and prepares plain skill instructions without a native receipt",async()=>{
  const f=fixture();
  await Promise.resolve();
  f.composer.querySelector<HTMLButtonElement>(".bridge-compact")!.click(); await Promise.resolve();
  const pro=[...f.document.querySelectorAll<HTMLButtonElement>("[data-bridge-model]")].find(row=>row.dataset.bridgeModel===JSON.stringify(["planner-pro","pro"]));
  expect(pro).toBeDefined(); pro!.click(); await Promise.resolve();
  expect(f.configuration.models().find(model=>model.key===f.configuration.task({hostId:"local",taskId:"task-a"}).modelKey)?.mode).toBe("pro");
  const toggle=f.document.querySelector<HTMLInputElement>('.bridge-popover input[role="switch"]')!;
  expect(toggle.disabled).toBe(false);expect(toggle.checked).toBe(false);
  toggle.click();
  expect(f.configuration.task({hostId:"local",taskId:"task-a"}).enabled).toBe(true);
  expect(f.prepared).toHaveLength(1);
  expect(f.prepared[0]).toMatchObject({hostId:"local",taskId:"task-a",revision:"bridge-enabled"});
  expect((f.prepared[0] as {text:string}).text).toContain("Use the bundled bridge-chat skill");
  expect(f.prepared[0]).not.toHaveProperty("bindingId");
  expect(f.prepared[0]).not.toHaveProperty("snapshotId");
  expect(f.configuration.models().find(model=>model.key===f.configuration.task({hostId:"local",taskId:"task-a"}).modelKey)?.mode).toBe("pro");
});

it("does not silently substitute an unavailable task model",async()=>{
  const f=fixture();
  await Promise.resolve();
  f.configuration.updateTask({hostId:"local",taskId:"task-a"},{modelKey:"stale-model"});
  f.composer.querySelector<HTMLButtonElement>(".bridge-compact")!.click(); await Promise.resolve();
  const toggle=f.document.querySelector<HTMLInputElement>('.bridge-popover input[role="switch"]')!;
  expect(toggle.disabled).toBe(true);
  expect(f.document.querySelector(".bridge-popover")?.textContent).toContain("Choose an available Chat model first");
  expect(f.prepared).toHaveLength(0);
});

it("shows a short next step and the original error code",()=>{
  const f=fixture();
  f.ui.backgroundChanged("SEND_UNCERTAIN");
  expect(f.document.querySelector("[data-bridge-background]")?.textContent).toContain("Check status first; do not resend");
  expect(f.document.querySelector("[data-bridge-background]")?.textContent).toContain("SEND_UNCERTAIN");
  f.ui.backgroundChanged("CHAT_READ_TIMEOUT",true);
  expect(f.document.querySelector("[data-bridge-background]")?.textContent).toContain("same requestId");
  expect(f.document.querySelector("[data-bridge-background]")?.textContent).toContain("Reconnecting automatically");
});
