import { expect, it, vi } from "vitest";
import { AppChatBackgroundAdapter, type NativeCompletionInput } from "../packages/renderer-plugin/src/background-adapter.js";
import type { AppChatClient } from "../packages/renderer-plugin/src/app-chat-runtime.js";
import { ChatConfiguration } from "../packages/renderer-plugin/src/chat-configuration.js";
import { BridgeSession } from "../packages/renderer-plugin/src/session.js";

function fixture() {
  const task = { hostId: "local", taskId: "task" };
  const configuration = new ChatConfiguration();
  configuration.updateCatalog({ options: [{ slug: "planner-pro", lane: "pro", modelTitle: "Planner Pro", selectedLabel: "Pro" }] });
  configuration.updateTask(task, { enabled: true, modelKey: configuration.models()[0]!.key, cleanup: "retain" });
  const mapping: Record<string, unknown> = {};
  const sent: NativeCompletionInput[] = [];
  let current = "root";
  const client: AppChatClient = {
    models: async () => ({}), get: async () => ({ current_node: current, mapping }),
    getConversationStreamStatus: async () => ({ status: "COMPLETE" }), delete: vi.fn(),
    startCompletionStream: async input => {
      const native = input as NativeCompletionInput;
      sent.push(native);
      native.onRequestStart();
    },
  };
  const session = new BridgeSession(configuration, () => new AppChatBackgroundAdapter(client, () => true));
  const complete = (text: string) => {
    const native = sent.at(-1)!;
    const user = native.request.messages[0]!;
    mapping[user.id] = { parent: current, message: user };
    current = "reply-" + sent.length;
    mapping[current] = { parent: user.id, message: { id: current, author: { role: "assistant" }, end_turn: true, content: { parts: [text] } } };
    native.onUpdate({ conversationId: "owned-chat", type: "message", message: { id: current } });
    native.onComplete({ reason: "done" });
  };
  return { task, session, sent, client, complete };
}

it("exchanges ordinary plans and evidence through one native Pro chat without text protocol or handoff IDs", async () => {
  const f = fixture();
  try {
    const first = { task: f.task, instanceId: f.session.instanceId, requestId: "request-1", message: "Review the current design." };
    const waiting = f.session.exchange(first);
    await new Promise(resolve => setTimeout(resolve, 0));
    f.complete("The model and training loop are separate. Check the factory extension point.");
    const reply = await waiting;
    expect(reply).toMatchObject({ state: "reply", requestId: "request-1", text: expect.stringContaining("factory") });
    expect(f.sent[0]!.request).toMatchObject({ model: "planner-pro" });
    expect(f.sent[0]!.request).not.toHaveProperty("thinking_effort");
    expect(f.sent[0]!.request.messages[0]!.content.parts[0]).toContain("Reply in concise plain text.");
    expect(f.sent[0]!.request.messages[0]!.content.parts[0]).toMatch(/Review the current design\.$/);
    expect(await f.session.exchange(first)).toMatchObject({ state: "reply", text: reply.text });
    expect(f.sent).toHaveLength(1);
    const next = f.session.exchange({ task: f.task, instanceId: f.session.instanceId, sessionId: reply.sessionId, requestId: "request-2", message: "Verified: adding a model changes only the explicit factory registration. Tests passed." });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(f.sent[1]!.request).toMatchObject({ conversation_id: "owned-chat", parent_message_id: "reply-1" });
    f.complete("The evidence supports the review. The task is complete.");
    expect(await next).toMatchObject({ state: "reply", requestId: "request-2" });
    expect(await f.session.finish({ task: f.task, sessionId: reply.sessionId, reason: "completed" })).toMatchObject({ state: "ended", policy: "retain" });
    expect(f.client.delete).not.toHaveBeenCalled();
  } finally { f.session.stop(); }
});

it("keeps waiting on the original native request through slow startup without replay", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  const f = fixture();
  try {
    f.client.startCompletionStream = input => { f.sent.push(input as NativeCompletionInput); return new Promise(() => {}); };
    const payload = { task: f.task, instanceId: f.session.instanceId, requestId: "slow", message: "Review carefully." };
    const first = f.session.exchange(payload);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await first).toMatchObject({ state: "waiting", requestId: "slow" });
    const second = f.session.exchange(payload);
    await vi.advanceTimersByTimeAsync(0);
    f.sent[0]!.onRequestStart();
    f.complete("Reviewed.");
    expect(await second).toMatchObject({ state: "reply", text: "Reviewed." });
    expect(f.sent).toHaveLength(1);
  } finally { f.session.stop(); vi.useRealTimers(); }
});

it("shows a real native failure and never resends an uncertain request", async () => {
  const f = fixture();
  try {
    const payload = { task: f.task, instanceId: f.session.instanceId, requestId: "failed", message: "Inspect the source." };
    const first = f.session.exchange(payload);
    const rejected = expect(first).rejects.toMatchObject({ code: "CHAT_RATE_LIMITED" });
    await new Promise(resolve => setTimeout(resolve, 0));
    f.sent[0]!.onError({ responseStatus: 429 });
    await rejected;
    expect(f.session.status({ task: f.task }).error).toMatchObject({ code: "CHAT_RATE_LIMITED" });
    expect(await f.session.exchange(payload)).toMatchObject({ state: "failed", errorCode: "CHAT_RATE_LIMITED" });
    expect(f.sent).toHaveLength(1);
  } finally { f.session.stop(); }
});
