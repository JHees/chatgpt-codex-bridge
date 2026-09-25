import { expect, it, vi } from "vitest";
import { AppChatBackgroundAdapter, type NativeCompletionInput } from "../packages/renderer-plugin/src/background-adapter.js";
import type { AppChatClient } from "../packages/renderer-plugin/src/app-chat-runtime.js";

it.each(["success", "unconfirmed", "rejected", "unsupported", "generating", "intervened"])("archives only an owned completed Chat with native confirmation: %s", async mode => {
  let native!: NativeCompletionInput, archived = false, calls = 0, deletes = 0;
  const client: AppChatClient = {
    models: async () => ({}), startCompletionStream: async input => { native = input as NativeCompletionInput; native.onRequestStart(); },
    getConversationStreamStatus: async () => ({status:"COMPLETE"}),
    get: async () => ({is_archived:archived,current_node:"reply",mapping:{
      user:{message:{id:"user",author:{role:"user"},content:{parts:["Request"]}}},
      reply:{parent:"user",message:{id:"reply",author:{role:"assistant"},end_turn:true,content:{parts:["Response"]}}},
      ...(mode === "intervened" ? {other:{message:{id:"other",author:{role:"user"},content:{parts:["Manual"]}}}} : {}),
    }}),
    delete: async () => { deletes++; },
    ...(mode === "unsupported" ? {} : {setArchived:async (id:string, value:boolean) => {
      expect(id).toBe("owned"); expect(value).toBe(true); calls++;
      if (mode === "rejected") return {success:false};
      archived = mode !== "unconfirmed"; return {success:true};
    }}),
  };
  const adapter = new AppChatBackgroundAdapter(client, () => true, () => "user");
  await adapter.send({text:"Request",model:{key:"m",slug:"planner",mode:"thinking",title:"Planner",effort:"standard",effortLabel:"Medium"}});
  native.onUpdate({conversationId:"owned",type:"message",message:{id:"reply"}});
  if (mode !== "generating") native.onComplete({reason:"done"});
  if (mode === "success") await expect(adapter.finish("archive")).resolves.toBeUndefined();
  else {
    const codes = {unconfirmed:"ARCHIVE_UNCONFIRMED",rejected:"CHAT_REQUEST_FAILED",unsupported:"ARCHIVE_UNSUPPORTED",generating:"CLEANUP_UNSAFE",intervened:"USER_INTERVENED"};
    await expect(adapter.finish("archive")).rejects.toMatchObject({code:codes[mode as keyof typeof codes]});
    if (mode === "unconfirmed") { archived = true; await adapter.finish("archive"); expect(calls).toBe(1); }
    else await adapter.finish("retain");
  }
  expect(deletes).toBe(0);
  expect(calls).toBe(["success","unconfirmed","rejected"].includes(mode) ? 1 : 0);
});

it("interrupts only the local waiter and safely retains an ongoing native generation", async () => {
  let native!: NativeCompletionInput;
  const client: AppChatClient = {models:async()=>({}),get:async()=>({}),getConversationStreamStatus:async()=>({status:"IN_PROGRESS"}),delete:async()=>{throw Error("must not delete");},startCompletionStream:async input=>{native=input as NativeCompletionInput;native.onRequestStart();}};
  const adapter = new AppChatBackgroundAdapter(client, () => true, () => "user");
  await adapter.send({text:"Request",model:{key:"m",slug:"planner",mode:"thinking",title:"Planner",effort:"standard",effortLabel:"Medium"}});
  const abort = new AbortController();
  const reading = adapter.read("user",90_000,abort.signal);
  abort.abort();
  await expect(reading).rejects.toMatchObject({code:"SESSION_ENDING"});
  await expect(adapter.finish("delete")).rejects.toMatchObject({code:"CLEANUP_UNSAFE"});
  await adapter.finish("retain");
  native.onComplete({reason:"done"});
});

it("uses the explicitly selected native model without a fabricated Pro effort, and reads the correlated final reply", async () => {
  let invocation: NativeCompletionInput | undefined;
  let deleted = false;
  let title = "原始任务标题";
  const renamed: string[] = [];
  const client: AppChatClient = {
    models: async () => ({ options: [] }),
    startCompletionStream: async input => { invocation = input as NativeCompletionInput; invocation.onRequestStart(); },
    rename: async (id, next) => { expect(id).toBe("owned-chat"); renamed.push(next); title=next; },
    get: async () => ({ title, current_node: "assistant-1", mapping: {
      "user-1": { parent: "root", message: { id: "user-1", author: { role: "user" }, content: { parts: ["Request"] } } },
      "assistant-1": { parent: "user-1", message: { id: "assistant-1", author: { role: "assistant" }, end_turn: true, content: { parts: ["Reply"] } } },
    } }),
    getConversationStreamStatus: async () => ({ status: "COMPLETE" }),
    delete: async () => { deleted = true; },
  };
  const ids = ["user-1", "root"];
  const adapter = new AppChatBackgroundAdapter(client, () => true, () => ids.shift()!);
  const id = await adapter.send({ text: "Request", model: { key: "chosen", slug: "explicit-model", mode: "pro", title: "Planner", effort: null, effortLabel: "Pro" } });
  expect(invocation!.request.model).toBe("explicit-model");
  expect(invocation!.request).not.toHaveProperty("thinking_effort");
  invocation!.onUpdate({ type: "message", conversationId: "owned-chat", message: { id: "assistant-1" } });
  invocation!.onComplete({ reason: "done" });
  expect(await adapter.read(id, 30_000)).toEqual({ state: "complete", text: "Reply" });
  expect(renamed).toEqual(["[bridge] 原始任务标题"]);
  expect(await adapter.read(id, 30_000)).toEqual({ state: "complete", text: "Reply" });
  expect(renamed).toHaveLength(1);
  await adapter.finish("delete");
  expect(deleted).toBe(true);
});

it("bounds deletion and keeps one in-flight delete across explicit retries", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  try {
    let native!: NativeCompletionInput, deletes = 0;
    let completeDelete!: () => void;
    const client: AppChatClient = {
      models: async () => ({}), startCompletionStream: async input => { native = input as NativeCompletionInput; native.onRequestStart(); },
      getConversationStreamStatus: async () => ({ status: "COMPLETE" }),
      get: async () => ({ current_node: "reply", mapping: {
        user: { message: { id: "user", author: { role: "user" }, content: { parts: ["Request"] } } },
        reply: { parent: "user", message: { id: "reply", author: { role: "assistant" }, end_turn: true, content: { parts: ["Response"] } } },
      } }),
      delete: () => { deletes++; return new Promise<void>(resolve => { completeDelete = resolve; }); },
    };
    const adapter = new AppChatBackgroundAdapter(client, () => true, () => "user");
    await adapter.send({ text: "Request", model: { key: "m", slug: "planner", mode: "pro", title: "Planner", effort: null, effortLabel: "Pro" } });
    native.onUpdate({ type: "message", conversationId: "owned", message: { id: "reply" } }); native.onComplete({ reason: "done" });
    await adapter.read("user", 30_000);
    let error: unknown;
    const finish = adapter.finish("delete").catch(value => { error = value; });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(error).toMatchObject({ code: "CLEANUP_PENDING" });
    await finish;
    await expect(adapter.finish("retain")).rejects.toMatchObject({ code: "CLEANUP_PENDING" });
    const retry = adapter.finish("delete"); await vi.advanceTimersByTimeAsync(0);
    expect(deletes).toBe(1); completeDelete(); await retry;
    expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); }
});

it.each(["prefixed", "rename-failure", "manual-rename", "delete-rejected"])("keeps naming and cleanup safe: %s",async mode=>{
  let native!:NativeCompletionInput;
  let title=mode === "prefixed" ? "[bridge] Existing title" : "Original title";
  let renames=0, deletes=0;
  const client:AppChatClient={
    models:async()=>({}),getConversationStreamStatus:async()=>({status:"COMPLETE"}),
    startCompletionStream:async input=>{native=input as NativeCompletionInput;native.onRequestStart();},
    rename:async(_id,next)=>{renames++;if(mode === "rename-failure")throw Error("private");title=next;},
    delete:async()=>{deletes++;return mode === "delete-rejected" ? {success:false} : {};},
    get:async()=>({title,current_node:"reply",mapping:{
      user:{message:{id:"user",author:{role:"user"},content:{parts:["Request"]}}},
      reply:{parent:"user",message:{id:"reply",author:{role:"assistant"},end_turn:true,content:{parts:["Plan"]}}},
    }}),
  };
  const adapter=new AppChatBackgroundAdapter(client,()=>true,()=>"user");
  await adapter.send({text:"Request",model:{key:"m",slug:"planner",mode:"thinking",title:"Planner",effort:"standard",effortLabel:"Medium"}});
  native.onUpdate({conversationId:"owned",type:"message",message:{id:"reply"}});native.onComplete({reason:"done"});
  await expect(adapter.read("user",30000)).resolves.toMatchObject({state:"complete"});
  expect(renames).toBe(mode === "prefixed" ? 0 : 1);
  if(mode === "rename-failure")expect(adapter.diagnostics()).toEqual({titleError:"TITLE_UPDATE_FAILED"});
  if(mode === "manual-rename"){
    title="User's own title";
    await expect(adapter.finish("delete")).rejects.toMatchObject({code:"USER_INTERVENED"});
    expect(deletes).toBe(0);
  } else if(mode === "delete-rejected") {
    await expect(adapter.finish("delete")).rejects.toMatchObject({code:"CHAT_REQUEST_FAILED"});
  } else await adapter.finish("retain");
  adapter.dispose();
});

it("waits inside a bounded read window instead of making the caller busy-poll", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  try {
    const client: AppChatClient = { models: async () => ({}), get: async () => ({}), delete: async () => {}, getConversationStreamStatus: async () => ({}), startCompletionStream: async input => { (input as NativeCompletionInput).onRequestStart(); } };
    const adapter = new AppChatBackgroundAdapter(client, () => true);
    const id = await adapter.send({ text: "Request", model: { key: "chosen", slug: "planner", mode: "thinking", title: "Planner", effort: "standard", effortLabel: "Medium" } });
    let returned = false;
    const read = adapter.read(id, 30_000).then(value => { returned = true; return value; });
    await vi.advanceTimersByTimeAsync(29_999);
    expect(returned).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await read).toEqual({ state: "waiting" });
    adapter.dispose();
    expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); }
});

it("returns the native message identity after request start without waiting for a long generation Promise", async () => {
  const client: AppChatClient = { models: async () => ({}), get: async () => ({}), delete: async () => {}, getConversationStreamStatus: async () => ({}), startCompletionStream: input => { (input as NativeCompletionInput).onRequestStart(); return new Promise(() => {}); } };
  const adapter = new AppChatBackgroundAdapter(client, () => true);
  let sent = false;
  void adapter.send({ text: "Request", model: { key: "chosen", slug: "planner", mode: "pro", title: "Planner", effort: null, effortLabel: "Pro" } }).then(() => { sent = true; });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(sent).toBe(true);
  adapter.dispose();
});

it("does not busy-poll when the stream callback completes before native completion metadata", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  try {
    let native!: NativeCompletionInput;
    const client: AppChatClient = { models: async () => ({}), get: async () => ({}), delete: async () => {}, getConversationStreamStatus: async () => ({ status: "IN_PROGRESS" }), startCompletionStream: async input => { native = input as NativeCompletionInput; native.onRequestStart(); } };
    const adapter = new AppChatBackgroundAdapter(client, () => true);
    const id = await adapter.send({ text: "Request", model: { key: "chosen", slug: "planner", mode: "thinking", title: "Planner", effort: "standard", effortLabel: "Medium" } });
    native.onUpdate({ conversationId: "owned" }); native.onComplete({ reason: "done" });
    let returned = false;
    const read = adapter.read(id, 30_000).then(value => { returned = true; return value; });
    await vi.advanceTimersByTimeAsync(29_999);
    expect(returned).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await read).toEqual({ state: "waiting" });
    adapter.dispose(); expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); }
});

it("bounds final-state reads by the same window even if the App read is slow", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  try {
    let native!: NativeCompletionInput;
    const client: AppChatClient = { models: async () => ({}), get: () => new Promise(() => {}), delete: async () => {}, getConversationStreamStatus: async () => ({ status: "COMPLETE" }), startCompletionStream: async input => { native = input as NativeCompletionInput; native.onRequestStart(); } };
    const adapter = new AppChatBackgroundAdapter(client, () => true);
    const id = await adapter.send({ text: "Request", model: { key: "chosen", slug: "planner", mode: "thinking", title: "Planner", effort: "standard", effortLabel: "Medium" } });
    native.onUpdate({ conversationId: "owned-chat" });
    native.onComplete({ reason: "done" });
    let returned = false;
    const read = adapter.read(id, 30_000).then(result => { returned = true; return result; });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(returned).toBe(true);
    expect(await read).toEqual({ state: "waiting" });
    adapter.dispose();
  } finally { vi.useRealTimers(); }
});

it("reuses one owned Chat and refuses deletion after a user message disappears", async () => {
  const invocations: NativeCompletionInput[] = [];
  const mapping: Record<string, unknown> = {};
  let current = "root", deletes = 0;
  const client: AppChatClient = {
    models: async () => ({}),
    get: async () => ({ current_node: current, mapping }),
    getConversationStreamStatus: async () => ({ status: "COMPLETE" }),
    delete: async () => { deletes++; },
    startCompletionStream: async input => { invocations.push(input as NativeCompletionInput); (input as NativeCompletionInput).onRequestStart(); },
  };
  const ids = ["user-1", "root", "user-2", "unused-root"];
  const adapter = new AppChatBackgroundAdapter(client, () => true, () => ids.shift()!);
  const model = { key: "medium", slug: "planner", mode: "thinking", title: "Planner", effort: "standard", effortLabel: "Medium" };
  for (const number of [1, 2]) {
    const text = number === 1 ? "Plan" : "Evidence";
    const id = await adapter.send({ text, model });
    const native = invocations[number - 1]!;
    mapping[id] = { parent: current, message: { id, author: { role: "user" }, content: { parts: [text] } } };
    current = `assistant-${number}`;
    mapping[current] = { parent: id, message: { id: current, author: { role: "assistant" }, end_turn: true, content: { parts: ["Next"] } } };
    native.onUpdate({ type: "message", conversationId: "owned-chat", message: { id: current } });
    native.onComplete({ reason: "done" });
    expect(await adapter.read(id, 30_000)).toEqual({ state: "complete", text: "Next" });
  }
  expect(invocations[1]!.request).toMatchObject({ conversation_id: "owned-chat", parent_message_id: "assistant-1", thinking_effort: "standard" });
  delete mapping["user-1"];
  await expect(adapter.finish("delete")).rejects.toMatchObject({ code: "USER_INTERVENED" });
  expect(deletes).toBe(0);
  await adapter.finish("retain");
});

it("releases a slow final-state read and its timer when the plugin instance stops", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  try {
    let native!: NativeCompletionInput;
    let readStarted = false;
    const client: AppChatClient = { models: async () => ({}), get: () => { readStarted = true; return new Promise(() => {}); }, delete: async () => {}, getConversationStreamStatus: async () => ({ status: "COMPLETE" }), startCompletionStream: async input => { native = input as NativeCompletionInput; native.onRequestStart(); } };
    const adapter = new AppChatBackgroundAdapter(client, () => true);
    const id = await adapter.send({ text: "Request", model: { key: "chosen", slug: "planner", mode: "thinking", title: "Planner", effort: "standard", effortLabel: "Medium" } });
    native.onUpdate({ conversationId: "owned-chat" });
    native.onComplete({ reason: "done" });
    const read = adapter.read(id, 90_000);
    const rejected = expect(read).rejects.toMatchObject({ code: "SESSION_LOST" });
    await vi.advanceTimersByTimeAsync(0);
    expect(readStarted).toBe(true);
    adapter.dispose();
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
    await rejected;
  } finally { vi.useRealTimers(); }
});

it("keeps one native request alive past the startup window and reads its late completion", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  try {
    let native!: NativeCompletionInput, sends = 0;
    const client: AppChatClient = {
      models: async () => ({}), delete: async () => {},
      getConversationStreamStatus: async () => ({ status: "COMPLETE" }),
      get: async () => ({ current_node: "reply", mapping: {
        user: { message: { id: "user", author: { role: "user" }, content: { parts: ["Request"] } } },
        reply: { parent: "user", message: { id: "reply", author: { role: "assistant" }, end_turn: true, content: { parts: ["Response"] } } },
      } }),
      startCompletionStream: input => { sends++; native = input as NativeCompletionInput; return new Promise(() => {}); },
    };
    const adapter = new AppChatBackgroundAdapter(client, () => true, () => "user");
    const sending = adapter.send({ text: "Request", model: { key: "m", slug: "planner", mode: "thinking", title: "Planner", effort: "extended", effortLabel: "High" } });
    const sent = sending.then(id => ({ id }), error => ({ error }));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await sent).toEqual({ id: "user" });
    const first = adapter.read("user", 1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await first).toEqual({ state: "waiting" });
    const later = adapter.read("user", 90_000);
    native.onRequestStart();
    native.onUpdate({ conversationId: "owned", type: "message", message: { id: "reply" } });
    native.onComplete({ reason: "done" });
    expect(await later).toEqual({ state: "complete", text: "Response" });
    expect(sends).toBe(1);
    await adapter.finish("retain");
    expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); }
});

it.each(["reject", "error"])("keeps a real late native %s terminal without resending", async mode => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  try {
    let native!: NativeCompletionInput, reject!: (error: Error) => void, sends = 0;
    const client: AppChatClient = {
      models: async () => ({}), get: async () => ({}), delete: async () => {}, getConversationStreamStatus: async () => ({}),
      startCompletionStream: input => { sends++; native = input as NativeCompletionInput; return new Promise((_, fail) => { reject = fail; }); },
    };
    const adapter = new AppChatBackgroundAdapter(client, () => true, () => "user");
    const sending = adapter.send({ text: "Request", model: { key: "m", slug: "planner", mode: "thinking", title: "Planner", effort: "extended", effortLabel: "High" } });
    const sent = sending.then(id => ({ id }), error => ({ error }));
    await vi.advanceTimersByTimeAsync(10_000); expect(await sent).toEqual({ id: "user" });
    const reading = adapter.read("user", 90_000);
    const code = mode === "reject" ? "SEND_UNCERTAIN" : "CHAT_RATE_LIMITED";
    const failure = expect(reading).rejects.toMatchObject({ code });
    if (mode === "reject") reject(Error("Private native details must not be returned"));
    else native.onError({ responseStatus: 429 });
    await failure;
    await expect(adapter.send({ text: "No retry", model: { key: "m", slug: "planner", mode: "thinking", title: "Planner", effort: "extended", effortLabel: "High" } })).rejects.toMatchObject({ code });
    expect(sends).toBe(1);
    await adapter.finish("retain");
    expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); }
});
