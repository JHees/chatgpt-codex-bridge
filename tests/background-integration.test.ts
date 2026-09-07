import { expect, it } from "vitest";
import { AppChatBackgroundAdapter, type NativeCompletionInput } from "../packages/renderer-plugin/src/background-adapter.js";
import type { AppChatClient } from "../packages/renderer-plugin/src/app-chat-runtime.js";
import { ChatConfiguration } from "../packages/renderer-plugin/src/chat-configuration.js";
import { CooperationController } from "../packages/renderer-plugin/src/cooperation-controller.js";
import { PROTOCOL } from "../packages/renderer-plugin/src/protocol.js";

it.each(["manual-message", "regeneration", "changed-branch", "unchanged"])("revalidates paused native results before resuming: %s", async change => {
  let now = 0, sends = 0;
  const mapping: Record<string, unknown> = {};
  let current = "root";
  let stream = "COMPLETE";
  const client: AppChatClient = {
    models: async () => ({}), delete: async () => { throw Error("Must retain this conversation"); },
    getConversationStreamStatus: async () => ({ status: stream }),
    get: async () => { now = Math.max(now, 60_001); return { current_node: current, mapping }; },
    startCompletionStream: async input => {
      sends++;
      const native = input as NativeCompletionInput, user = native.request.messages[0]!;
      mapping[user.id] = { parent: "root", message: user };
      const text = '```codex-bridge-response-v1\n' + JSON.stringify({ protocol: PROTOCOL, sessionId: "session", turnId: "turn", status: "continue", summary: "Inspect the requested document", actions: [{ id: "a1", type: "inspect", instruction: "Read the document", expectedResult: "Report its current sections" }] }) + '\n```';
      current = "assistant";
      mapping[current] = { parent: user.id, message: { id: current, author: { role: "assistant" }, end_turn: true, content: { parts: [text] } } };
      native.onRequestStart(); native.onUpdate({ type: "message", conversationId: "owned", message: { id: current } }); native.onComplete({ reason: "done" });
    },
  };
  const configuration = new ChatConfiguration();
  configuration.updateCatalog({ options: [{ slug: "planner", lane: "thinking", modelTitle: "Planner", selectedLabel: "Medium", thinkingEffort: "standard" }] });
  const task = { hostId: "local", taskId: "task" };
  configuration.updateTask(task, { enabled: true, modelKey: configuration.models()[0]!.key, totalWaitMinutes: 1 });
  const controller = new CooperationController(configuration, () => ({ state: "accepted", bindingId: "binding", ...task, turnId: "native-turn" }), () => new AppChatBackgroundAdapter(client, () => true), () => now);
  const config = controller.prepare(task, "snapshot"); controller.register("binding", task, config);
  const payload = { task, bindingId: "binding", snapshotId: config.id, request: { protocol: PROTOCOL, sessionId: "session", turnId: "turn", kind: "request", objective: "Inspect a document", state: { phase: "plan", summary: "Ready", completed: [], blockers: [] }, message: "Choose the first check", actionResults: [] } };
  try {
    expect((await controller.exchange(payload)).state).toBe("paused");
    if (change === "manual-message") {
      mapping.manual = { parent: current, message: { id: "manual", author: { role: "user" }, content: { parts: ["I have changed the task"] } } };
      current = "manual";
    } else if (change === "regeneration") stream = "IN_PROGRESS";
    else if (change === "changed-branch") current = "another-reply";
    controller.consent(task, "session", "continue-waiting");
    if (change === "unchanged") {
      expect(await controller.exchange(payload)).toMatchObject({ state: "response", response: { actions: [{ id: "a1" }] } });
      expect(await controller.exchange(payload)).toEqual({ state: "already-delivered", turnId: "turn" });
    } else {
      await expect(controller.exchange(payload)).rejects.toMatchObject({ code: "USER_INTERVENED" });
      await expect(controller.finish({ task, sessionId: "session", policy: "retain" })).resolves.toEqual({ state: "ended", policy: "retain" });
    }
    expect(sends).toBe(1);
  } finally { controller.stop(); }
});
