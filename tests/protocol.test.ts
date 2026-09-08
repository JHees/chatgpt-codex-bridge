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
    const prompt=formatRequestPrompt(request);
    expect(prompt).toContain(request.objective);
    expect(prompt).toContain(request.state.summary);
    expect(prompt).not.toContain("```codex-bridge-request-v1");
    expect(prompt).not.toContain('"sessionId"');
    expect(prompt).toContain("现有权限");
  });

  it("reads a human plan with a small explicit state header, without guessing completion from prose", () => {
    const prose="1. 检查现有测试。\n2. 修复解析逻辑，保留用户修改。\n验收：运行测试并回报退出码。";
    expect(parseBridgeResponse("协作状态：继续\n\n"+prose,"session-1","turn-1"))
      .toMatchObject({sessionId:"session-1",turnId:"turn-1",status:"continue",actions:[{id:"plan",type:"plan",instruction:prose}]});
    expect(parseBridgeResponse("**协作状态：建议完成**\n\n已核对提交的测试证据。","session-1","turn-1"))
      .toMatchObject({status:"complete",actions:[]});
    expect(parseBridgeResponse("Bridge status: needs_user\n\n请确认是否覆盖目标文件。","session-1","turn-1"))
      .toMatchObject({status:"needs_user",actions:[{type:"ask_user"}]});
    expect(()=>parseBridgeResponse("已经完成。接下来删除文件。","session-1","turn-1")).toThrow();
    expect(()=>parseBridgeResponse("协作状态：继续\n\n协作状态：建议完成","session-1","turn-1")).toThrow();
    expect(()=>parseBridgeResponse("协作状态：继续\n", "session-1","turn-1")).toThrow();
  });

  it("sends readable evidence and only introduces the planner role on the first business turn", () => {
    const prompt=formatRequestPrompt({...request,kind:"result",actionResults:[{actionId:"plan",outcome:"succeeded",summary:"修复完成",evidence:["npm test: 12 passed, exit 0"]}]});
    expect(prompt).toContain("npm test: 12 passed, exit 0");
    expect(prompt).not.toContain("你是本次任务的规划伙伴");
    expect(prompt).not.toContain(JSON.stringify(request));
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

  it("normalizes known research action synonyms without guessing IDs, permissions or unknown operations", () => {
    const base={protocol:"codex-chat-bridge/v1",sessionId:"session-1",turnId:"turn-1",status:"continue",summary:"Research",actions:[]};
    for(const type of ["investigate","research","analyze","analyse","synthesize","summarize"]){
      const action={id:"a1",type,instruction:"Compare the cited evidence",expectedResult:"Verified findings"};
      expect(parseBridgeResponse(block({...base,actions:[action]}),"session-1","turn-1").actions).toEqual([{...action,type:"inspect"}]);
    }
    expect(()=>parseBridgeResponse(block({...base,actions:[{id:"a1",type:"execute_arbitrary",instruction:"Text",expectedResult:"Text"}]}),"session-1","turn-1")).toThrow();
  });

  it("accepts unambiguous JSON presentation and a redundant response discriminator only", () => {
    const value={protocol:"codex-chat-bridge/v1",sessionId:"session-1",turnId:"turn-1",kind:"response",status:"complete",summary:"Plan result only",actions:[]};
    for(const text of [JSON.stringify(value), '```json\n'+JSON.stringify(value)+'\n```',block(value)]){
      expect(parseBridgeResponse(text,"session-1","turn-1")).not.toHaveProperty("kind");
    }
    expect(()=>parseBridgeResponse(JSON.stringify({...value,kind:"request"}),"session-1","turn-1")).toThrow();
    expect(()=>parseBridgeResponse(JSON.stringify({...value,extra:"untrusted-private-key"}),"session-1","turn-1")).toThrowError(/unknown field/);
    expect(()=>parseBridgeResponse(JSON.stringify(value)+JSON.stringify(value),"session-1","turn-1")).toThrow();
    expect(()=>parseBridgeResponse('```json\n'+JSON.stringify(value)+'\n```\n'+block(value),"session-1","turn-1")).toThrow();
  });

  it("rejects an additional non-protocol fence", () => {
    const response = { protocol: "codex-chat-bridge/v1", sessionId: "session-1", turnId: "turn-1", status: "complete", summary: "Done", actions: [] };
    expect(() => parseBridgeResponse(`${block(response)}\n\`\`\`text\nextra\n\`\`\``, "session-1", "turn-1")).toThrowError("exactly one");
  });
});
