import { describe, expect, it } from "vitest";

import { BridgeController, BridgeError, type ChatDomPort } from "../packages/renderer-plugin/src/controller.js";

const request = {
  protocol: "codex-chat-bridge/v1" as const,
  sessionId: "session-1",
  turnId: "turn-1",
  kind: "request" as const,
  objective: "Implement the bridge",
  state: { phase: "implement" as const, summary: "Working", completed: [], blockers: [] },
  message: "What next?",
  actionResults: [],
};

function reply(turnId = "turn-1", sessionId = "session-1"): string {
  return `\`\`\`codex-bridge-response-v1\n${JSON.stringify({
    protocol: "codex-chat-bridge/v1",
    sessionId,
    turnId,
    status: "continue",
    summary: "Verify it",
    actions: [{ id: "a1", type: "verify", instruction: "Run the focused tests", expectedResult: "All tests pass" }],
  })}\n\`\`\``;
}

class FakeDom implements ChatDomPort {
  readonly calls: Array<{ message: string; marker: string }> = [];
  replies: string[] = [reply()];
  began = 0;
  finished = 0;
  resets = 0;

  async beginSession(): Promise<void> { this.began += 1; }
  async exchange(message: string, marker: string): Promise<string> {
    this.calls.push({ message, marker });
    const next = this.replies.shift();
    if (next === undefined) throw new BridgeError("REPLY_TIMEOUT", "No reply");
    return next;
  }
  async finishSession(): Promise<void> { this.finished += 1; }
  resetSession(): void { this.resets += 1; }
}

describe("BridgeController", () => {
  it("creates one session and caches a completed turn without resending", async () => {
    const dom = new FakeDom();
    const controller = new BridgeController(dom);
    const first = await controller.exchange(request);
    const duplicate = await controller.exchange(request);
    expect(first).toEqual(duplicate);
    expect(dom.began).toBe(1);
    expect(dom.calls).toHaveLength(1);
  });

  it("completes two structured turns and restores the originating task", async () => {
    const dom = new FakeDom();
    dom.replies = [reply("turn-1"), reply("turn-2")];
    const controller = new BridgeController(dom);

    const first = await controller.exchange(request);
    const second = await controller.exchange({
      ...request,
      turnId: "turn-2",
      kind: "result",
      state: {
        ...request.state,
        phase: "verify",
        summary: "Focused tests completed",
        completed: ["a1"],
      },
      message: "Here is the requested result.",
      actionResults: [{ actionId: "a1", outcome: "succeeded", summary: "All focused tests passed", evidence: ["18/18"] }],
    });
    const finished = await controller.finish({ sessionId: "session-1" });

    expect(first).toMatchObject({ turnId: "turn-1" });
    expect(second).toMatchObject({ turnId: "turn-2" });
    expect(dom.began).toBe(1);
    expect(dom.calls).toHaveLength(2);
    expect(dom.calls[1]?.message).toContain("All focused tests passed");
    expect(finished).toEqual({ finished: true });
    expect(dom.finished).toBe(1);
  });

  it("sends one protocol repair and then stops", async () => {
    const dom = new FakeDom();
    dom.replies = ["not structured", "still not structured"];
    const controller = new BridgeController(dom);
    await expect(controller.exchange(request)).rejects.toMatchObject({ code: "PROTOCOL_REPAIR_REQUIRED" });
    await expect(controller.exchange(request)).rejects.toMatchObject({ code: "PROTOCOL_INVALID" });
    expect(dom.calls).toHaveLength(2);
    expect(dom.calls[1]?.marker).toBe("codex-bridge:session-1:turn-1:repair");
  });

  it("continues reading the same repair marker after a repair timeout", async () => {
    const dom = new FakeDom();
    dom.replies = ["not structured"];
    const original = dom.exchange.bind(dom);
    let repairAttempts = 0;
    dom.exchange = async (message, marker) => {
      if (marker.endsWith(":repair")) {
        dom.calls.push({ message, marker });
        repairAttempts += 1;
        if (repairAttempts === 1) throw new BridgeError("REPLY_TIMEOUT", "Repair still generating");
        return reply();
      }
      return await original(message, marker);
    };
    const controller = new BridgeController(dom);
    await expect(controller.exchange(request)).rejects.toMatchObject({ code: "PROTOCOL_REPAIR_REQUIRED" });
    await expect(controller.exchange(request)).rejects.toMatchObject({ code: "REPLY_TIMEOUT" });
    await expect(controller.exchange(request)).resolves.toMatchObject({ turnId: "turn-1" });
    expect(dom.calls.filter((call) => call.marker.endsWith(":repair"))).toHaveLength(2);
  });

  it("does not resend an ambiguous send", async () => {
    const dom = new FakeDom();
    dom.exchange = async () => { throw new BridgeError("SEND_UNCERTAIN", "Unknown send state"); };
    const controller = new BridgeController(dom);
    await expect(controller.exchange(request)).rejects.toMatchObject({ code: "SEND_UNCERTAIN" });
  });

  it("propagates one trusted Enter request and resumes the same turn", async () => {
    const dom = new FakeDom();
    let attempts = 0;
    dom.exchange = async (message, marker) => {
      dom.calls.push({ message, marker });
      attempts += 1;
      if (attempts === 1) {
        return { $loaderHostAction: { version: 1, type: "press-enter" } } as never;
      }
      return reply();
    };
    const controller = new BridgeController(dom);

    await expect(controller.exchange(request)).resolves.toEqual({
      $loaderHostAction: { version: 1, type: "press-enter" },
    });
    await expect(controller.exchange(request)).resolves.toMatchObject({ turnId: "turn-1" });
    expect(dom.began).toBe(1);
    expect(dom.calls.map((call) => call.marker)).toEqual([
      "codex-bridge:session-1:turn-1",
      "codex-bridge:session-1:turn-1",
    ]);
  });

  it("reuses the same turn marker after a reply timeout", async () => {
    const dom = new FakeDom();
    let attempts = 0;
    dom.exchange = async (_message, marker) => {
      dom.calls.push({ message: "", marker });
      attempts += 1;
      if (attempts === 1) throw new BridgeError("REPLY_TIMEOUT", "Still generating");
      return reply();
    };
    const controller = new BridgeController(dom);
    await expect(controller.exchange(request)).rejects.toMatchObject({ code: "REPLY_TIMEOUT" });
    await expect(controller.exchange(request)).resolves.toMatchObject({ turnId: "turn-1" });
    expect(dom.calls.map((call) => call.marker)).toEqual([
      "codex-bridge:session-1:turn-1",
      "codex-bridge:session-1:turn-1",
    ]);
  });

  it("allows one active session and restores only the matching session", async () => {
    const dom = new FakeDom();
    const controller = new BridgeController(dom);
    await controller.exchange(request);
    await expect(controller.exchange({ ...request, sessionId: "session-2", turnId: "turn-2" })).rejects.toMatchObject({ code: "SESSION_BUSY" });
    await expect(controller.finish({ sessionId: "session-2" })).rejects.toMatchObject({ code: "SESSION_MISMATCH" });
    await expect(controller.finish({ sessionId: "session-1" })).resolves.toEqual({ finished: true });
    expect(dom.finished).toBe(1);
  });

  it("abandons controller and DOM state after a lost session", async () => {
    const dom = new FakeDom();
    let attempts = 0;
    dom.exchange = async () => {
      attempts += 1;
      if (attempts === 1) throw new BridgeError("SESSION_LOST", "Chat was unmounted");
      return reply("turn-2", "session-2");
    };
    const controller = new BridgeController(dom);

    await expect(controller.exchange(request)).rejects.toMatchObject({ code: "SESSION_LOST" });
    await expect(controller.exchange({ ...request, sessionId: "session-2", turnId: "turn-2" })).resolves.toMatchObject({
      sessionId: "session-2",
      turnId: "turn-2",
    });

    expect(dom.began).toBe(2);
    expect(dom.resets).toBe(1);
  });
});
