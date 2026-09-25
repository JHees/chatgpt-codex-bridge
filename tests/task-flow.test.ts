import { expect, it } from "vitest";
import { ChatConfiguration } from "../packages/renderer-plugin/src/chat-configuration.js";
import { BackgroundSession } from "../packages/renderer-plugin/src/background-session.js";
import type { BackgroundChatPort } from "../packages/renderer-plugin/src/background-session.js";
import { CooperationController } from "../packages/renderer-plugin/src/cooperation-controller.js";

function fixture(limits = {}) {
  const configuration=new ChatConfiguration();
  configuration.updateCatalog({options:[{slug:"planner",lane:"thinking",modelTitle:"Planner",selectedLabel:"High",thinkingEffort:"extended"}]});
  const task={hostId:"local",taskId:"task"};
  configuration.updateTask(task,{enabled:true,modelKey:configuration.models()[0]!.key,...limits});
  let text="Bridge status: continue\nInspect the source", now=0;
  const sent:string[]=[];
  const port:BackgroundChatPort={check:async()=>{},send:async(input:{text:string})=>{sent.push(input.text);return String(sent.length);},read:async()=>({state:"complete" as const,text}),finish:async()=>{}};
  const session=new BackgroundSession("session",configuration.freeze(task,"snapshot"),port,()=>now);
  const base={protocol:"codex-chat-bridge/v1",sessionId:"session",objective:"Finish task",state:{phase:"verify",summary:"Checking",completed:[],blockers:[]},message:"Evidence",actionResults:[]};
  const result={actionId:"plan",outcome:"succeeded",summary:"Checked",evidence:["Verified"]};
  const request=(i:number)=>({...base,turnId:`turn-${i}`,kind:i===1?"request":"result",actionResults:i===1?[]:[result]});
  return {configuration,task,session,port,sent,request,text:(value:string)=>{text=value;},advance:(ms:number)=>{now+=ms;}};
}

it("runs beyond old batch limits and can report final verification without asking for another batch",async()=>{
  const f=fixture();
  for(let i=1;i<=10;i++)expect(await f.session.exchange(f.request(i),i===1?undefined:`turn-${i-1}`)).toMatchObject({state:"response"});
  f.text("Bridge status: complete\nVerified");
  await f.session.exchange({...f.request(11),state:{phase:"complete",summary:"Done",completed:["Tests passed"],blockers:[]}},"turn-10");
  expect(f.session.hasCompletedReport()).toBe(true);
  expect(f.session.status()).toMatchObject({usedRequests:11,maxRequests:null,remainingRequests:null});
});

it("accepts a valid slow reply by default while retaining an explicitly chosen hard deadline",async()=>{
  const f=fixture();f.port.read=async()=>{f.advance(2*60*60_000);return {state:"complete",text:"Bridge status: continue\nCheck the result"};};
  expect(await f.session.exchange(f.request(1))).toMatchObject({state:"response"});
  const limited=fixture({replyTimeoutMinutes:1});limited.port.read=async()=>{limited.advance(60_001);return {state:"complete",text:"Bridge status: continue\nCheck"};};
  expect(await limited.session.exchange(limited.request(1))).toMatchObject({state:"paused"});
  expect(limited.sent).toHaveLength(1);
});

it("reports a long wait without pausing or resending the original request",async()=>{
  const f=fixture();f.port.read=async()=>{f.advance(16*60_000);return {state:"waiting"};};
  expect(await f.session.exchange(f.request(1))).toMatchObject({state:"waiting",longWait:true,allowedMs:null});
  expect(f.session.status()).toMatchObject({state:"waiting",longWait:true});
  f.port.read=async()=>({state:"complete",text:"Bridge status: continue\nVerify"});
  expect(await f.session.exchange(f.request(1))).toMatchObject({state:"response"});
  expect(f.sent).toHaveLength(1);
});

it("consumes the executor's accounted user answer without a second UI confirmation",async()=>{
  const f=fixture();f.text("Bridge status: needs_user\nWhich output format?");
  await f.session.exchange(f.request(1));expect(f.session.status().state).toBe("needs-user");
  f.text("Bridge status: continue\nWrite the requested format");
  expect(await f.session.exchange({...f.request(2),message:"The user requested Markdown in the current task."},"turn-1")).toMatchObject({state:"response"});
});

it("enforces an optional total request cap without silently granting a new batch",async()=>{
  const f=fixture({maxRequests:2});await f.session.exchange(f.request(1));await f.session.exchange(f.request(2),"turn-1");
  await expect(f.session.exchange(f.request(3),"turn-2")).rejects.toMatchObject({code:"BUDGET_EXHAUSTED"});
  expect(f.sent).toHaveLength(2);expect(f.session.status()).toMatchObject({usedRequests:2,remainingRequests:0});
});

it("keeps cleanup separate from completed work and allows a new task without losing the failed target",async()=>{
  const f=fixture();let receiptTask=f.task;
  const controller=new CooperationController(f.configuration,bindingId=>({state:"accepted",bindingId,...receiptTask,turnId:"native"}),()=>f.port);
  controller.register("binding",f.task,controller.prepare(f.task,"snapshot"));
  f.text("Bridge status: complete\nVerified");f.port.finish=async()=>{throw Error("delete failed");};
  const call={task:f.task,bindingId:"binding",snapshotId:"snapshot",request:{...f.request(1),state:{phase:"complete",summary:"Done",completed:["Verified"],blockers:[]}}};
  await controller.exchange(call);
  expect(controller.hasActiveSession()).toBe(false);
  expect(controller.status({task:f.task})).toMatchObject({active:null,pendingCleanup:[{sessionId:"session",policy:"delete"}]});
  await expect(controller.finish({task:f.task,sessionId:"session",policy:"retain"})).rejects.toMatchObject({code:"CLEANUP_FAILED"});
  expect(controller.status({task:f.task}).pendingCleanup[0]?.policy).toBe("delete");
  receiptTask={...f.task,taskId:"next"};f.configuration.updateTask(receiptTask,{enabled:true,modelKey:f.configuration.models()[0]!.key});
  controller.register("next",receiptTask,controller.prepare(receiptTask,"next-snapshot"));
  f.text("Bridge status: continue\nInspect");
  await controller.exchange({task:receiptTask,bindingId:"next",snapshotId:"next-snapshot",request:{...f.request(1),sessionId:"next-session"}});
  expect(controller.status({task:receiptTask}).pendingCleanup).toEqual([]);
  expect(controller.status({task:f.task,bindingId:"binding",read:{sessionId:"session",turnId:"turn-1"}}).turn).toMatchObject({state:"response",response:{status:"complete"}});
  f.port.finish=async()=>{};await controller.finish({task:f.task,sessionId:"session",policy:"delete"});
  expect(controller.status({task:f.task}).pendingCleanup).toEqual([]);
  expect(controller.status({task:receiptTask}).active?.sessionId).toBe("next-session");
  controller.stop();
});

it("migrates legacy default limits without losing model choices and preserves non-default limits",()=>{
  const old={enabled:true,modelKey:"chosen",maxRounds:3,readWindowSeconds:30,totalWaitMinutes:15,cleanup:"retain"};
  expect(new ChatConfiguration(old).defaults()).toEqual({enabled:true,modelKey:"chosen",maxRequests:null,replyTimeoutMinutes:null,cleanup:"retain"});
  expect(new ChatConfiguration({...old,maxRounds:5,totalWaitMinutes:30}).defaults()).toMatchObject({maxRequests:5,replyTimeoutMinutes:30});
});

it("writes migrated task preferences separately and leaves the old preference record intact",()=>{
  const old={version:1,origin:"chosen",settings:{enabled:true,modelKey:"chosen",maxRounds:3,readWindowSeconds:90,totalWaitMinutes:15,cleanup:"retain"}};
  const key='task-preferences-v1:["local","task"]';const values=new Map<string,unknown>([[key,structuredClone(old)]]);
  const store={get:(key:string)=>values.get(key),set:(key:string,value:unknown)=>{values.set(key,value);}};
  const config=new ChatConfiguration(undefined,store),task={hostId:"local",taskId:"task"};
  expect(config.task(task)).toMatchObject({enabled:true,modelKey:"chosen",maxRequests:null,replyTimeoutMinutes:null});
  config.updateTask(task,{maxRequests:10});
  expect(values.get(key)).toEqual(old);
  expect(new ChatConfiguration(undefined,store).task(task).maxRequests).toBe(10);
});

it("accepts an explained skipped action only after local verification and planner completion",async()=>{
  const f=fixture();await f.session.exchange(f.request(1));f.text("Bridge status: complete\nThe existing verification evidence is sufficient.");
  await f.session.exchange({...f.request(2),state:{phase:"complete",summary:"Verified",completed:["Existing test result checked"],blockers:[]},actionResults:[{actionId:"plan",outcome:"skipped",summary:"Redundant rerun not needed",evidence:["The unchanged code already passed this check"]}]},"turn-1");
  expect(f.session.hasCompletedReport()).toBe(true);
});

it("allows reviewed optional steps to be skipped before other approved actions",async()=>{
  const f=fixture();f.text(JSON.stringify({protocol:"codex-chat-bridge/v1",sessionId:"session",turnId:"turn-1",status:"continue",summary:"Review and verify",actions:[{id:"optional",type:"inspect",instruction:"Repeat an existing check",expectedResult:"Evidence"},{id:"verify",type:"verify",instruction:"Check the changed behavior",expectedResult:"Passed"}]}));
  await f.session.exchange(f.request(1));f.text("Bridge status: complete\nThe required verification passed.");
  await f.session.exchange({...f.request(2),state:{phase:"complete",summary:"Verified",completed:["Required check passed"],blockers:[]},actionResults:[{actionId:"optional",outcome:"skipped",summary:"Existing evidence already covers this",evidence:["Previous unchanged check passed"]},{actionId:"verify",outcome:"succeeded",summary:"Required check passed",evidence:["Exit 0"]}]},"turn-1");
  expect(f.session.hasCompletedReport()).toBe(true);
});

it("retains multiple exact cleanup targets and rejects reuse of an older pending session ID",async()=>{
  const f=fixture();f.text("Bridge status: complete\nVerified");f.port.finish=async()=>{throw Error("Cleanup unavailable");};
  const controller=new CooperationController(f.configuration,bindingId=>({state:"accepted",bindingId,...f.task,turnId:"native"}),()=>f.port);
  for(const id of ["one","two"]) {
    controller.register(id,f.task,controller.prepare(f.task,id));
    await controller.exchange({task:f.task,bindingId:id,snapshotId:id,request:{...f.request(1),sessionId:id,state:{phase:"complete",summary:"Done",completed:["Verified"],blockers:[]}}});
  }
  expect(controller.status({task:f.task}).pendingCleanup.map(x=>x.sessionId)).toEqual(["one","two"]);
  controller.register("three",f.task,controller.prepare(f.task,"three"));
  await expect(controller.exchange({task:f.task,bindingId:"three",snapshotId:"three",request:{...f.request(1),sessionId:"one"}})).rejects.toMatchObject({code:"SESSION_MISMATCH"});
  expect(f.sent).toHaveLength(2);controller.stop();
});
