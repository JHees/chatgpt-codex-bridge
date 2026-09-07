import { expect, it } from "vitest";
import { CooperationController } from "../packages/renderer-plugin/src/cooperation-controller.js";
import { ChatConfiguration } from "../packages/renderer-plugin/src/chat-configuration.js";
import type { BackgroundChatPort } from "../packages/renderer-plugin/src/background-session.js";
import { PROTOCOL } from "../packages/renderer-plugin/src/protocol.js";

function fixture() {
  const config = new ChatConfiguration();
  config.updateCatalog({ options: [{ slug: "planner", lane: "thinking", modelTitle: "Planner", selectedLabel: "Medium", thinkingEffort: "standard" }] });
  const task = { hostId: "local", taskId: "task-a" };
  config.updateTask(task, { enabled: true, modelKey: config.models()[0]!.key });
  let receipt: Record<string, unknown> = { state: "prepared" };
  const sends: string[] = [];
  let made = 0;
  const port: BackgroundChatPort = {
    check: async () => {}, send: async input => { sends.push(input.text); return "message"; },
    read: async () => ({ state: "waiting" }), finish: async () => {},
  };
  const controller = new CooperationController(config, () => receipt, () => { made++; return port; });
  const snapshot = controller.prepare(task, "snapshot-a");
  controller.register("binding-a", task, snapshot);
  const request = { protocol: PROTOCOL, sessionId: "session-a", turnId: "turn-a", kind: "request", objective: "Make a document", state: { phase: "plan", summary: "Read requirements", completed: [], blockers: [] }, message: "Plan", actionResults: [] };
  const payload = { task, bindingId: "binding-a", snapshotId: snapshot.id, request };
  return { config, task, controller, payload, sends, port, made: () => made,
    accept() { receipt = { state: "accepted", bindingId: "binding-a", hostId: task.hostId, taskId: task.taskId, turnId: "native-turn" }; },
    receipt(value: Record<string, unknown>) { receipt = value; },
  };
}

it("recovers a lost reply through an owned read-only status query and marks feedback-accounted turns", async () => {
  const f = fixture(); f.accept();
  const read = { sessionId: "session-a", turnId: "turn-a" };
  const query = { task: f.task, bindingId: "binding-a", read };
  f.port.read = async () => ({ state: "complete", text: '```codex-bridge-response-v1\n' + JSON.stringify({ protocol: PROTOCOL, ...read, status: "complete", summary: "Check actual delivery", actions: [] }) + '\n```' });
  const original = await f.controller.exchange(f.payload); // Simulate transport losing this envelope.
  expect(f.controller.status(query).turn).toEqual(original);
  expect(f.controller.status(query).turn).toEqual(original);
  expect(f.sends).toHaveLength(1);
  expect(() => f.controller.status({ ...query, task: { hostId: "local", taskId: "other" } })).toThrow();
  expect(() => f.controller.status({ ...query, bindingId: "other" })).toThrow();
  expect(() => f.controller.status({ ...query, read: { ...read, sessionId: "other" } })).toThrow();
  expect(f.controller.status({ ...query, read: { ...read, turnId: "unknown" } }).turn).toEqual({state:"not-found",turnId:"unknown"});
  f.port.read = async () => ({state:"waiting"});
  await f.controller.exchange({ ...f.payload, replyToTurnId: "turn-a", request: { ...f.payload.request, turnId: "turn-b", kind: "result" } });
  expect(f.controller.status(query).turn).toEqual({state:"accounted",turnId:"turn-a"});
  expect(f.sends).toHaveLength(2);
});

it("does not create or send Chat before a matching native accepted submission", async () => {
  const f = fixture();
  for (const state of ["prepared", "dispatched", "unknown", "rejected", "ambiguous"]) {
    f.receipt({ state, bindingId: "binding-a", ...f.task });
    await expect(f.controller.exchange(f.payload)).rejects.toMatchObject({ code: "SUBMISSION_UNCONFIRMED" });
  }
  expect(f.made()).toBe(0);
  f.accept();
  expect((await f.controller.exchange(f.payload)).state).toBe("waiting");
  expect(f.sends).toHaveLength(1);
});

it("distinguishes a malformed local request from an invalid Chat reply before touching a session", async () => {
  const f = fixture(); f.accept();
  await expect(f.controller.exchange({ ...f.payload, request: { ...f.payload.request, replyToTurnId: "previous" } }))
    .rejects.toMatchObject({ code: "LOCAL_REQUEST_INVALID" });
  expect(f.made()).toBe(0);
  expect(f.sends).toHaveLength(0);
  await f.controller.exchange(f.payload);
  expect(f.sends).toHaveLength(1);
});

it("freezes the visible preparation and never binds an unrelated task during navigation", async () => {
  const f = fixture();
  f.config.updateTask(f.task, { totalWaitMinutes: 1, maxRounds: 1 });
  f.accept();
  await expect(f.controller.exchange({ ...f.payload, task: { hostId: "local", taskId: "task-b" } })).rejects.toMatchObject({ code: "TASK_MISMATCH" });
  await f.controller.exchange(f.payload);
  const state = f.controller.status({ task: f.task, bindingId: "binding-a" });
  expect(state.active?.config.settings.totalWaitMinutes).toBe(15);
  expect(state.active?.config.settings.maxRounds).toBe(3);
  expect(state.nextSettings.totalWaitMinutes).toBe(1);
  expect(f.controller.status({ task: { hostId: "local", taskId: "task-b" } }).active).toBeNull();
});

it("keeps a single owner and releases a retained session without allowing old bindings to restart", async () => {
  const f = fixture(); f.accept();
  await f.controller.exchange(f.payload);
  await expect(f.controller.finish({ task: { hostId: "local", taskId: "task-b" }, sessionId: "session-a", policy: "retain" })).rejects.toMatchObject({ code: "TASK_MISMATCH" });
  await f.controller.finish({ task: f.task, sessionId: "session-a", policy: "retain" });
  await expect(f.controller.exchange(f.payload)).rejects.toMatchObject({ code: "SESSION_LOST" });
  expect(f.sends).toHaveLength(1);
});

it("does not treat a premature planner complete as verified completion or automatic deletion", async () => {
  const f = fixture(); f.accept();
  f.port.read = async () => ({ state: "complete", text: '```codex-bridge-response-v1\n' + JSON.stringify({ protocol: PROTOCOL, sessionId: "session-a", turnId: "turn-a", status: "complete", summary: "I think this is done", actions: [] }) + '\n```' });
  let deletes = 0; f.port.finish = async () => { deletes++; };
  await f.controller.exchange(f.payload);
  await expect(f.controller.finish({ task: f.task, sessionId: "session-a", policy: "delete" })).rejects.toMatchObject({ code: "COMPLETION_UNVERIFIED" });
  expect(deletes).toBe(0);
  expect(f.controller.status({ task: f.task }).active?.state).toBe("awaiting-verification");
});

it("preserves a new task's explicit override when its accepted draft is promoted", async () => {
  const f = fixture();
  const draft = { draftId: "new-draft" }, task = { hostId: "local", taskId: "new-task" };
  f.config.updateTask(draft, { enabled: true, modelKey: f.config.models()[0]!.key });
  const snapshot = f.controller.prepare(draft, "snapshot-draft");
  f.controller.register("binding-draft", draft, snapshot);
  f.config.updateTask(task, { enabled: false, maxRounds: 1 });
  f.receipt({ state: "accepted", bindingId: "binding-draft", ...task, turnId: "native-new-turn" });
  const payload = { ...f.payload, task, bindingId: "binding-draft", snapshotId: snapshot.id };
  await expect(f.controller.exchange(payload)).rejects.toMatchObject({ code: "COLLABORATION_DISABLED" });
  expect(f.sends).toHaveLength(0);
  expect(f.config.task(task).maxRounds).toBe(1);
});

it("promotes a confirmed draft after the formal task was only read, not explicitly changed", async () => {
  const f = fixture();
  const draft = { draftId: "draft" }, task = { hostId: "local", taskId: "new-task" };
  f.config.updateTask(draft, { enabled: true, modelKey: f.config.models()[0]!.key });
  const snapshot = f.controller.prepare(draft, "snapshot-draft");
  f.controller.register("binding-draft", draft, snapshot);
  f.controller.status({ task });
  f.receipt({ state: "accepted", bindingId: "binding-draft", ...task, turnId: "native-turn" });
  await f.controller.exchange({ ...f.payload, task, bindingId: "binding-draft", snapshotId: snapshot.id });
  expect(f.sends).toHaveLength(1);
  expect(f.controller.status({ task }).active?.config.task).toEqual(task);
});

it("allows normal cleanup only after a completed local report and a matching planner confirmation", async () => {
  const f = fixture(); f.accept();
  f.port.read = async () => ({ state: "complete", text: '```codex-bridge-response-v1\n' + JSON.stringify({ protocol: PROTOCOL, sessionId: "session-a", turnId: "turn-a", status: "complete", summary: "Evidence reviewed", actions: [] }) + '\n```' });
  let deleted = false; f.port.finish = async policy => { deleted = policy === "delete"; };
  await f.controller.exchange({ ...f.payload, request: { ...f.payload.request, state: { phase: "complete", summary: "Document checked against requirements", completed: ["Document created and inspected"], blockers: [] } } });
  await expect(f.controller.finish({ task: f.task, sessionId: "session-a", policy: "delete" })).resolves.toEqual({ state: "ended", policy: "delete" });
  expect(deleted).toBe(true);
});

it("rejects attempts to grant consent through command payloads", async () => {
  const f = fixture(); f.accept();
  await expect(f.controller.exchange({ ...f.payload, allowNextBatch: true })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  expect(() => f.controller.status({ task: f.task, continueWaiting: true })).toThrow();
  expect(f.sends).toHaveLength(0);
});
