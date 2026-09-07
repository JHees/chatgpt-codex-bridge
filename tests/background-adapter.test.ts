import { expect, it, vi } from "vitest";
import { AppChatBackgroundAdapter, type NativeCompletionInput } from "../packages/renderer-plugin/src/background-adapter.js";
import type { AppChatClient } from "../packages/renderer-plugin/src/app-chat-runtime.js";

it("uses the explicitly selected native model without a fabricated Pro effort, and reads the correlated final reply", async () => {
  let invocation: NativeCompletionInput | undefined;
  let deleted = false;
  const client: AppChatClient = {
    models: async () => ({ options: [] }),
    startCompletionStream: async input => { invocation = input as NativeCompletionInput; invocation.onRequestStart(); },
    get: async () => ({ current_node: "assistant-1", mapping: {
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
    const retry = adapter.finish("delete"); await vi.advanceTimersByTimeAsync(0);
    expect(deletes).toBe(1); completeDelete(); await retry;
    expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); }
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
