export const PROTOCOL = "codex-chat-bridge/v1" as const;

const phases = ["investigate", "plan", "implement", "verify", "blocked", "complete"] as const;
const actionTypes = ["inspect", "change", "run", "verify", "ask_user", "plan"] as const;
const outcomes = ["succeeded", "failed", "blocked", "skipped"] as const;
const statuses = ["continue", "needs_user", "complete"] as const;

export interface BridgeRequest {
  protocol: typeof PROTOCOL;
  sessionId: string;
  turnId: string;
  kind: "request" | "result";
  objective: string;
  state: {
    phase: (typeof phases)[number];
    summary: string;
    completed: string[];
    blockers: string[];
  };
  message: string;
  actionResults: Array<{
    actionId: string;
    outcome: (typeof outcomes)[number];
    summary: string;
    evidence: string[];
  }>;
}

export interface BridgeResponse {
  protocol: typeof PROTOCOL;
  sessionId: string;
  turnId: string;
  status: (typeof statuses)[number];
  summary: string;
  actions: Array<{
    id: string;
    type: (typeof actionTypes)[number];
    instruction: string;
    expectedResult: string;
  }>;
}

export class ProtocolError extends Error {
  readonly code = "PROTOCOL_INVALID";
}

export function parseBridgeRequest(input: unknown): BridgeRequest {
  const root = record(input, "request");
  exactKeys(root, ["protocol", "sessionId", "turnId", "kind", "objective", "state", "message", "actionResults"], "request");
  literal(root.protocol, PROTOCOL, "protocol");
  const state = record(root.state, "state");
  exactKeys(state, ["phase", "summary", "completed", "blockers"], "state");
  const phase = oneOf(state.phase, phases, "state.phase");
  const results = array(root.actionResults, "actionResults").map((item, index) => {
    const result = record(item, `actionResults[${index}]`);
    exactKeys(result, ["actionId", "outcome", "summary", "evidence"], `actionResults[${index}]`);
    return {
      actionId: text(result.actionId, `actionResults[${index}].actionId`),
      outcome: oneOf(result.outcome, outcomes, `actionResults[${index}].outcome`),
      summary: text(result.summary, `actionResults[${index}].summary`),
      evidence: textArray(result.evidence, `actionResults[${index}].evidence`),
    };
  });
  return {
    protocol: PROTOCOL,
    sessionId: id(root.sessionId, "sessionId"),
    turnId: id(root.turnId, "turnId"),
    kind: oneOf(root.kind, ["request", "result"] as const, "kind"),
    objective: text(root.objective, "objective"),
    state: {
      phase,
      summary: text(state.summary, "state.summary"),
      completed: textArray(state.completed, "state.completed"),
      blockers: textArray(state.blockers, "state.blockers"),
    },
    message: text(root.message, "message"),
    actionResults: results,
  };
}

export function parseBridgeResponse(source: string, sessionId: string, turnId: string): BridgeResponse {
  const lines = source.trim().split(/\r?\n/);
  const header = /^(?:协作状态|Bridge status)\s*[:：]\s*(继续|需要确认|建议完成|continue|needs_user|complete)\s*$/i;
  const plain = (line: string): string => line.trim().replace(/^\*\*(.*?)\*\*$/, "$1");
  const state = plain(lines[0] ?? "").match(header);
  if (state) {
    if (lines.slice(1).some(line => /^(?:协作状态|Bridge status)\s*[:：]/i.test(plain(line))) || source.includes("```codex-bridge-response-v1")) throw new ProtocolError("The reply contains conflicting control formats.");
    const body = text(lines.slice(1).join("\n").trim(), "plan");
    const selected = state[1]!.toLowerCase();
    const status = selected === "继续" || selected === "continue" ? "continue" : selected === "需要确认" || selected === "needs_user" ? "needs_user" : "complete";
    return {protocol:PROTOCOL,sessionId:id(sessionId,"sessionId"),turnId:id(turnId,"turnId"),status,summary:body,
      actions:status === "complete" ? [] : [{id:"plan",type:status === "needs_user" ? "ask_user" : "plan",instruction:body,expectedResult:"按计划逐项核对范围和权限，回报实际结果、证据及未完成事项。"}]};
  }
  const blocks = [...source.matchAll(/^```(?:codex-bridge-response-v1|json)[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/gm)];
  const bare = source.trim().startsWith("{") && source.trim().endsWith("}") && !/^```/m.test(source);
  if (!bare && (blocks.length !== 1 || [...source.matchAll(/^```/gm)].length !== 2)) throw new ProtocolError("Chat must return exactly one JSON response and no other fenced block.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(bare ? source : blocks[0]?.[1] ?? "");
  } catch {
    throw new ProtocolError("The protocol block is not valid JSON.");
  }
  const root = record(parsed, "response");
  // A redundant response discriminator does not change the business contract.
  if (root.kind === "response") delete root.kind;
  exactKeys(root, ["protocol", "sessionId", "turnId", "status", "summary", "actions"], "response");
  literal(root.protocol, PROTOCOL, "protocol");
  const actualSessionId = id(root.sessionId, "sessionId");
  const actualTurnId = id(root.turnId, "turnId");
  if (actualSessionId !== sessionId || actualTurnId !== turnId) throw new ProtocolError("Response id does not match the active request.");
  const status = oneOf(root.status, statuses, "status");
  const items = array(root.actions, "actions");
  if (items.length > 8) throw new ProtocolError("Response may contain at most 8 actions.");
  const actions = items.map((item, index) => {
    const action = record(item, `actions[${index}]`);
    exactKeys(action, ["id", "type", "instruction", "expectedResult"], `actions[${index}]`);
    return {
      id: id(action.id, `actions[${index}].id`),
      type: oneOf(typeof action.type === "string" && ["investigate", "research", "analyze", "analyse", "synthesize", "summarize"].includes(action.type) ? "inspect" : action.type, actionTypes, `actions[${index}].type`),
      instruction: text(action.instruction, `actions[${index}].instruction`),
      expectedResult: text(action.expectedResult, `actions[${index}].expectedResult`),
    };
  });
  if (new Set(actions.map((action) => action.id)).size !== actions.length) throw new ProtocolError("Action ids must be unique.");
  if (status === "complete" && actions.length !== 0) throw new ProtocolError("A complete response cannot contain actions.");
  if (status === "continue" && actions.length === 0) throw new ProtocolError("A continue response must contain at least one action.");
  if (status === "needs_user" && (actions.length !== 1 || actions[0]?.type !== "ask_user")) throw new ProtocolError("A needs_user response must contain exactly one ask_user action.");
  return { protocol: PROTOCOL, sessionId: actualSessionId, turnId: actualTurnId, status, summary: text(root.summary, "summary"), actions };
}

export function formatRequestPrompt(input: unknown): string {
  const request = parseBridgeRequest(input);
  const phase = {investigate:"调查",plan:"规划",implement:"实施",verify:"验收",blocked:"受阻",complete:"本地验收完成"}[request.state.phase];
  const outcome = {succeeded:"成功",failed:"失败",blocked:"受阻",skipped:"未执行"};
  return [
    `## 任务目标\n${request.objective}`,
    `## 当前情况\n阶段：${phase}\n${request.state.summary}`,
    ...(request.state.completed.length ? [`已完成：\n${request.state.completed.map(item=>`- ${item}`).join("\n")}`] : []),
    ...(request.state.blockers.length ? [`受阻事项：\n${request.state.blockers.map(item=>`- ${item}`).join("\n")}`] : []),
    ...request.actionResults.map((result,index)=>`## 执行反馈 ${index+1}：${outcome[result.outcome]}\n${result.summary}\n${result.evidence.map(item=>`- ${item}`).join("\n")}`),
    `## 本轮需要你协助\n${request.message}`,
    ...(request.kind === "request" ? [
      "## 协作方式\n你是本次任务的规划伙伴，Codex 负责执行工具和验收。像委派给同事一样交流：给出当前可执行的 1–3 个连贯步骤、范围、约束、验收证据和停止条件；信息不足先安排检查。Codex 按现有权限决定如何执行，你的建议不是新的操作授权。根据实际反馈调整计划，只有证据足够才建议完成。",
      humanResponseContract,
    ] : []),
  ].join("\n\n");
}

const humanResponseContract = "请用自然语言回复，正文可分段、列步骤或展示必要代码。第一行只写一个状态：『协作状态：继续』『协作状态：需要确认』或『协作状态：建议完成』（去掉书名括号）。需要确认时写明要问用户的问题；建议完成时说明依据和限制。无需 JSON、会话编号或复制本次请求。";

export function formatRepairPrompt(): string {
  return [
    "上一条回复的协作状态不明确。这是唯一一次格式澄清，请保留原计划内容，不执行任何新任务。",
    humanResponseContract,
  ].join("\n");
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new ProtocolError(`${field} must be an object.`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], field: string): void {
  const allowed = new Set(expected);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown !== undefined) throw new ProtocolError(`${field} contains an unknown field. Allowed keys: ${expected.join(", ")}.`);
  const missing = expected.find((key) => !(key in value));
  if (missing !== undefined) throw new ProtocolError(`${field} is missing field ${missing}.`);
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new ProtocolError(`${field} must be a non-empty string.`);
  return value;
}

function id(value: unknown, field: string): string {
  const result = text(value, field);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(result)) throw new ProtocolError(`${field} is invalid.`);
  return result;
}

function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new ProtocolError(`${field} must be an array.`);
  return value;
}

function textArray(value: unknown, field: string): string[] {
  return array(value, field).map((item, index) => text(item, `${field}[${index}]`));
}

function literal<T extends string>(value: unknown, expected: T, field: string): asserts value is T {
  if (value !== expected) throw new ProtocolError(`${field} must be ${expected}.`);
}

function oneOf<const T extends readonly string[]>(value: unknown, allowed: T, field: string): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) throw new ProtocolError(`${field} is invalid. Allowed values: ${allowed.join(", ")}.`);
  return value as T[number];
}
