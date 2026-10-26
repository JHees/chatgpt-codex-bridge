import { expect, it, vi } from "vitest";
import { BridgeError } from "../packages/renderer-plugin/src/errors.js";
import { ChatConfiguration } from "../packages/renderer-plugin/src/chat-configuration.js";
import { BridgeSession, type ChatPort } from "../packages/renderer-plugin/src/session.js";

const task = { hostId: "local", taskId: "task-a" };
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture(options: object[] = [{ slug: "gpt-pro", lane: "pro", modelTitle: "GPT Pro", selectedLabel: "Pro" }]) {
  const configuration = new ChatConfiguration();
  configuration.updateCatalog({ options });
  configuration.updateTask(task, { enabled: true, modelKey: configuration.models()[0]!.key });
  const reads: Array<ReturnType<typeof deferred<{ state: "waiting" } | { state: "complete"; text: string }>>> = [];
  const sent: Array<{ text: string; model: string }> = [];
  let messageNumber = 0;
  const chat: ChatPort = {
    check: vi.fn(async () => {}),
    send: vi.fn(async ({ text, model }) => { sent.push({ text, model: model.key }); return `message-${++messageNumber}`; }),
    read: vi.fn(async () => { const next = reads.shift(); if (next) return await next.promise; return { state: "waiting" as const }; }),
    finish: vi.fn(async () => {}),
    dispose: vi.fn(),
  };
  let uuid = 0;
  const bridge = new BridgeSession(configuration, () => chat, () => 0, () => `id-${++uuid}`);
  const exchange = (requestId: string, message: string, sessionId?: string) => bridge.exchange({ task, instanceId: bridge.instanceId, requestId, message, ...(sessionId ? { sessionId } : {}) });
  return { configuration, chat, bridge, exchange, sent, reads };
}

it("uses the current task opt-in and an available model before creating or sending a session", async () => {
  const f = fixture();
  f.configuration.updateTask(task, { enabled: false });
  await expect(f.exchange("request-1", "Review this design.")).rejects.toMatchObject({ code: "COLLABORATION_DISABLED" });
  f.configuration.updateTask(task, { enabled: true, modelKey: null });
  await expect(f.exchange("request-1", "Review this design.")).rejects.toMatchObject({ code: "CHAT_CONFIGURATION_REQUIRED" });
  expect(f.bridge.hasActiveSession()).toBe(false);
  expect(f.chat.send).not.toHaveBeenCalled();
});

it("retries an ownership check before send without spending the user's request budget", async () => {
  const f = fixture(); let checks = 0;
  f.configuration.updateTask(task, { maxRequests: 1 });
  f.chat.check = vi.fn(async () => { if (checks++ === 0) throw new BridgeError("CHAT_READ_TIMEOUT", "Native ownership is still loading."); });
  await expect(f.exchange("request-check", "Review the task.")).rejects.toMatchObject({ code: "CHAT_READ_TIMEOUT" });
  expect(f.bridge.status({ task, requestId: "request-check" }).active?.usedRequests).toBe(0);
  expect(f.bridge.status({ task, requestId: "request-check" }).retryableRead).toBe(true);
  f.chat.read = vi.fn(async () => ({ state: "complete" as const, text: "Reviewed." }));
  const retried = await f.exchange("request-check", "Review the task.");
  expect(retried.state).toBe("reply");
  expect(f.chat.send).toHaveBeenCalledOnce();
  expect(f.bridge.status({ task }).active?.usedRequests).toBe(1);
  await expect(f.exchange("request-next", "Continue.", retried.sessionId)).rejects.toMatchObject({ code: "BUDGET_EXHAUSTED" });
});

it("sends plain text once, shares an in-flight read, and returns the same cached reply for an exact retry", async () => {
  const f = fixture(), waiting = deferred<{ state: "waiting" } | { state: "complete"; text: string }>(), entered = deferred<void>();
  f.chat.read = vi.fn(async () => { entered.resolve(); return await waiting.promise; });
  const first = f.exchange("request-1", "Inspect the training runner.");
  await entered.promise;
  const duplicate = f.exchange("request-1", "Inspect the training runner.");
  expect(f.chat.send).toHaveBeenCalledOnce();
  waiting.resolve({ state: "complete", text: "The runner has one clear training entry point." });
  const reply = await first;
  expect(await duplicate).toEqual(reply);
  expect(reply.state).toBe("reply");
  expect(reply.text).toBe("The runner has one clear training entry point.");
  expect(f.sent[0]!.text).toContain("Reply in concise plain text.");
  expect(f.sent[0]!.text).toContain("Inspect the training runner.");
  await expect(f.exchange("request-1", "Inspect a different file.", reply.sessionId)).rejects.toMatchObject({ code: "REQUEST_CONFLICT" });
  expect(f.chat.send).toHaveBeenCalledOnce();
});

it("continues a timed-out request by reading its native message, never sending it again", async () => {
  const f = fixture();
  let time = 0;
  const bridge = new BridgeSession(f.configuration, () => f.chat, () => time, () => "session-fixed");
  f.configuration.updateTask(task, { replyTimeoutMinutes: 1 });
  f.chat.read = vi.fn(async () => { time = 60_000; return { state: "waiting" as const }; });
  const first = await bridge.exchange({ task, instanceId: bridge.instanceId, requestId: "request-a", message: "Assess module boundaries." });
  expect(first.state).toBe("paused");
  expect(f.chat.send).toHaveBeenCalledOnce();
  bridge.continueAfterTimeout(task, first.sessionId);
  f.chat.read = vi.fn(async () => ({ state: "complete" as const, text: "The data module is cohesive." }));
  const reply = await bridge.exchange({ task, instanceId: bridge.instanceId, sessionId: first.sessionId, requestId: "request-a", message: "Assess module boundaries." });
  expect(reply).toMatchObject({ state: "reply", text: "The data module is cohesive." });
  expect(f.chat.send).toHaveBeenCalledOnce();
});

it("withholds a late completion until the user continues the timed-out read", async () => {
  const f = fixture(); let time = 0;
  const bridge = new BridgeSession(f.configuration, () => f.chat, () => time, () => "session-late");
  f.configuration.updateTask(task, { replyTimeoutMinutes: 1 });
  f.chat.read = vi.fn(async () => { time = 60_000; return { state: "complete" as const, text: "Chat completed after the deadline." }; });
  const waiting = await bridge.exchange({ task, instanceId: bridge.instanceId, requestId: "request-late", message: "Wait for this review." });
  expect(waiting.state).toBe("paused");
  expect(bridge.status({ task, sessionId: waiting.sessionId }).reply).toBeNull();
  bridge.continueAfterTimeout(task, waiting.sessionId);
  const reply = await bridge.exchange({ task, instanceId: bridge.instanceId, sessionId: waiting.sessionId, requestId: "request-late", message: "Wait for this review." });
  expect(reply).toMatchObject({ state: "reply", text: "Chat completed after the deadline." });
  expect(f.chat.send).toHaveBeenCalledOnce();
});

it("requires the current Bridge instance ID and tombstones its finished first request", async () => {
  const f = fixture();
  await expect(f.bridge.exchange({ task, instanceId: "old-runtime", requestId: "request-1", message: "Do not send." })).rejects.toMatchObject({ code: "SESSION_LOST" });
  expect(f.chat.send).not.toHaveBeenCalled();
  const first = await f.exchange("request-1", "Keep this session.");
  const ended = await f.bridge.finish({ task, sessionId: first.sessionId, reason: "user-request" });
  expect(ended.nativeGenerationMayContinue).toBe(true);
  await expect(f.exchange("request-1", "Keep this session.")).rejects.toMatchObject({ code: "SESSION_ENDED" });
  expect(f.chat.send).toHaveBeenCalledOnce();
});

it("keeps the first selected model for all later turns and isolates another task", async () => {
  const f = fixture([
    { slug: "gpt-pro", lane: "pro", modelTitle: "GPT Pro", selectedLabel: "Pro" },
    { slug: "gpt-fast", lane: "instant", modelTitle: "GPT Fast", selectedLabel: "Instant" },
  ]);
  f.chat.read = vi.fn(async () => ({ state: "complete" as const, text: "First review." }));
  const first = await f.exchange("request-1", "Review the design.");
  expect(first.state).toBe("reply");
  f.configuration.updateTask(task, { modelKey: f.configuration.models()[1]!.key });
  await f.exchange("request-other", "Read this.", first.sessionId);
  expect(f.sent.map(item => item.model)).toEqual([f.configuration.models()[0]!.key, f.configuration.models()[0]!.key]);
  expect(f.bridge.status({ task: { hostId: "local", taskId: "task-b" } })).toMatchObject({ occupied: true, active: null });
  await expect(f.bridge.exchange({ task: { hostId: "local", taskId: "task-b" }, instanceId: f.bridge.instanceId, requestId: "request-b", message: "Do work." })).rejects.toMatchObject({ code: "SESSION_OCCUPIED" });
});

it("retries a failed pre-send ownership check on the same request without consuming its budget", async () => {
  const f = fixture();
  let readCount = 0;
  f.chat.check = vi.fn(async () => { if (readCount++ === 0) throw new BridgeError("CHAT_READ_TIMEOUT", "Metadata is still loading."); });
  f.configuration.updateTask(task, { maxRequests: 1 });
  await expect(f.exchange("request-1", "Check a plain-text reply.")).rejects.toMatchObject({ code: "CHAT_READ_TIMEOUT" });
  expect(f.chat.send).not.toHaveBeenCalled();
  expect(f.bridge.status({ task }).active?.usedRequests).toBe(0);
  f.chat.read = vi.fn(async () => ({ state: "complete" as const, text: "The native reply is now visible." }));
  const recovered = await f.exchange("request-1", "Check a plain-text reply.");
  expect(recovered).toMatchObject({ state: "reply" });
  expect(f.chat.send).toHaveBeenCalledOnce();
  expect(f.bridge.status({ task }).active?.usedRequests).toBe(1);
  await expect(f.exchange("request-2", "A second message.", recovered.sessionId)).rejects.toMatchObject({ code: "BUDGET_EXHAUSTED" });

  const metadata = fixture(); let readCountMetadata = 0;
  metadata.chat.read = vi.fn(async () => { if (readCountMetadata++ === 0) throw new BridgeError("CHAT_READ_TIMEOUT", "Chat metadata is still loading."); return { state: "complete" as const, text: "Recovered reply." }; });
  await expect(metadata.exchange("request-1", "Read my request.")).rejects.toMatchObject({ code: "CHAT_READ_TIMEOUT" });
  await expect(metadata.exchange("request-1", "Read my request.")).resolves.toMatchObject({ state: "reply", text: "Recovered reply." });
  expect(metadata.chat.send).toHaveBeenCalledOnce();

  const g = fixture();
  g.chat.send = vi.fn(async () => { throw new BridgeError("SEND_UNCERTAIN", "No delivery receipt."); });
  await expect(g.exchange("request-1", "Do not duplicate me.")).rejects.toMatchObject({ code: "SEND_UNCERTAIN" });
  await expect(g.exchange("request-1", "Do not duplicate me.")).resolves.toMatchObject({ state: "failed", errorCode: "SEND_UNCERTAIN" });
  expect(g.chat.send).toHaveBeenCalledOnce();
});

it("stops reads when the task is disabled, resumes the same message after re-enabling, and retains on user end", async () => {
  const f = fixture(), entered = deferred<void>(), release = deferred<{ state: "waiting" } | { state: "complete"; text: string }>();
  f.chat.read = vi.fn(async (_id, _window, signal) => {
    entered.resolve();
    return await new Promise<{ state: "waiting" } | { state: "complete"; text: string }>((resolve, reject) => {
      signal?.addEventListener("abort", () => reject(new BridgeError("SESSION_ENDING", "Local read interrupted.")), { once: true });
      release.promise.then(resolve, reject);
    });
  });
  const pending = f.exchange("request-1", "Review this result.");
  await entered.promise;
  f.bridge.restoreDefaults(task);
  const paused = await pending;
  expect(paused).toMatchObject({ state: "paused" });
  await expect(f.exchange("request-1", "Review this result.", paused.sessionId)).rejects.toMatchObject({ code: "COLLABORATION_DISABLED" });
  f.bridge.updateTask(task, { enabled: true, modelKey: f.configuration.models()[0]!.key });
  f.chat.read = vi.fn(async () => ({ state: "complete" as const, text: "Reviewed." }));
  const reply = await f.exchange("request-1", "Review this result.");
  expect(reply).toMatchObject({ state: "reply", text: "Reviewed." });
  expect(f.chat.send).toHaveBeenCalledOnce();
  await expect(f.bridge.finish({ task, sessionId: reply.sessionId, reason: "user-request" })).resolves.toEqual({ state: "ended", policy: "retain" });
  expect(f.chat.finish).toHaveBeenCalledOnce();
  expect(f.chat.finish).toHaveBeenCalledWith("retain");
  expect(f.bridge.status({ task, sessionId: reply.sessionId, requestId: "request-1" }).reply).toMatchObject({ text: "Reviewed." });
});

it("keeps cleanup failures on the same owned session and lets the same finish request retry", async () => {
  const f = fixture();
  f.configuration.updateTask(task, { cleanup: "delete" });
  f.chat.read = vi.fn(async () => ({ state: "complete" as const, text: "Done." }));
  const reply = await f.exchange("request-1", "Review this task.");
  let attempts = 0;
  f.chat.finish = vi.fn(async () => { if (attempts++ === 0) throw new BridgeError("CLEANUP_PENDING", "Still deleting."); });
  const finish = { task, sessionId: reply.sessionId, reason: "completed" as const };
  await expect(f.bridge.finish(finish)).rejects.toMatchObject({ code: "CLEANUP_FAILED" });
  expect(f.bridge.status({ task, sessionId: reply.sessionId }).active).toMatchObject({ state: "failed", cleanupReason: "CLEANUP_PENDING" });
  await expect(f.bridge.finish(finish)).resolves.toEqual({ state: "ended", policy: "delete" });
  expect(f.chat.finish).toHaveBeenCalledTimes(2);
});
