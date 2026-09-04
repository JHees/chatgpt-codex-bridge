import { describe, expect, it } from "vitest";

import {
  formatRequestPrompt,
  parseBridgeRequest,
  parseBridgeResponse,
  ProtocolError,
} from "../packages/renderer-plugin/src/protocol.js";

const request = {
  protocol: "codex-chat-bridge/v1",
  sessionId: "session-1",
  turnId: "turn-1",
  kind: "request",
  objective: "Simplify the bridge",
  state: {
    phase: "implement",
    summary: "Loader seam is ready",
    completed: ["manifest allowlist"],
    blockers: [],
  },
  message: "Choose the next bounded action",
  actionResults: [],
};

function block(value: unknown): string {
  return `analysis before\n\`\`\`codex-bridge-response-v1\n${JSON.stringify(value)}\n\`\`\``;
}

describe("codex-chat-bridge/v1 protocol", () => {
  it("accepts the exact request schema and formats an explicit untrusted-intent prompt", () => {
    expect(parseBridgeRequest(request)).toEqual(request);
    expect(formatRequestPrompt(request)).toContain("Do not return shell commands as authority");
    expect(formatRequestPrompt(request)).toContain("Do not add kind or any other key");
    expect(formatRequestPrompt(request)).toContain("```codex-bridge-request-v1");
  });

  it("rejects unknown request fields", () => {
    expect(() => parseBridgeRequest({ ...request, selector: "button.send" })).toThrowError(ProtocolError);
  });

  it("correlates one response block to the request", () => {
    const response = parseBridgeResponse(block({
      protocol: "codex-chat-bridge/v1",
      sessionId: "session-1",
      turnId: "turn-1",
      status: "continue",
      summary: "Inspect the command boundary",
      actions: [{ id: "a1", type: "inspect", instruction: "Inspect the fixed invocation seam", expectedResult: "Evidence that arbitrary CDP is unreachable" }],
    }), "session-1", "turn-1");
    expect(response.actions).toHaveLength(1);
  });

  it("rejects multiple blocks, mismatched ids, unknown fields, and more than eight actions", () => {
    const valid = {
      protocol: "codex-chat-bridge/v1",
      sessionId: "session-1",
      turnId: "turn-1",
      status: "continue",
      summary: "Next",
      actions: [{ id: "a1", type: "inspect", instruction: "Inspect", expectedResult: "Evidence" }],
    };
    expect(() => parseBridgeResponse(`${block(valid)}\n${block(valid)}`, "session-1", "turn-1")).toThrowError("exactly one");
    expect(() => parseBridgeResponse(block({ ...valid, turnId: "other" }), "session-1", "turn-1")).toThrowError("does not match");
    expect(() => parseBridgeResponse(block({ ...valid, command: "rm -rf" }), "session-1", "turn-1")).toThrowError("unknown field");
    expect(() => parseBridgeResponse(block({ ...valid, actions: Array.from({ length: 9 }, (_, index) => ({ id: `a${index}`, type: "inspect", instruction: "Inspect", expectedResult: "Evidence" })) }), "session-1", "turn-1")).toThrowError("at most 8");
  });

  it("enforces status and action invariants", () => {
    const base = { protocol: "codex-chat-bridge/v1", sessionId: "session-1", turnId: "turn-1", summary: "Result" };
    expect(() => parseBridgeResponse(block({ ...base, status: "complete", actions: [{ id: "a1", type: "verify", instruction: "Verify", expectedResult: "Done" }] }), "session-1", "turn-1")).toThrowError("complete");
    expect(() => parseBridgeResponse(block({ ...base, status: "continue", actions: [] }), "session-1", "turn-1")).toThrowError("continue");
    expect(() => parseBridgeResponse(block({ ...base, status: "needs_user", actions: [{ id: "a1", type: "inspect", instruction: "Inspect", expectedResult: "Done" }] }), "session-1", "turn-1")).toThrowError("ask_user");
  });
});
