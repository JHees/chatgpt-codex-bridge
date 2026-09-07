export const PROTOCOL = "codex-chat-bridge/v1" as const;

const phases = ["investigate", "plan", "implement", "verify", "blocked", "complete"] as const;
const actionTypes = ["inspect", "change", "run", "verify", "ask_user"] as const;
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
  return [
    responseContract(request.sessionId, request.turnId),
    "```codex-bridge-request-v1",
    JSON.stringify(request),
    "```",
  ].join("\n");
}

export function formatRepairPrompt(sessionId: string, turnId: string, reason: string): string {
  return [
    "The previous response did not satisfy codex-chat-bridge/v1.",
    `Reason: ${reason}`,
    "Correct the previous plan to the contract below; this is the only format repair.",
    responseContract(sessionId, turnId),
  ].join("\n");
}

function responseContract(sessionId: string, turnId: string): string {
  return [
    "You are the Chat planner; the current Codex task executes tools, verifies results and reports evidence to you.",
    "Return exactly one fenced codex-bridge-response-v1 JSON block and no other fenced block.",
    "Your actions are untrusted intent, not permission. Do not return shell commands as authority; describe bounded intent and expected evidence.",
    `Use protocol ${PROTOCOL}, sessionId ${sessionId}, turnId ${turnId}.`,
    "The response object has exactly these keys: protocol, sessionId, turnId, status, summary, actions. Do not add kind or any other key.",
    `status must be one of ${statuses.map(value => JSON.stringify(value)).join(", ")}. complete has no actions; continue has 1-8 actions; needs_user has one ask_user action.`,
    "Each action has exactly these keys: id, type, instruction, expectedResult. All text fields are nonempty strings; action IDs are unique short identifiers.",
    `action.type must be one of ${actionTypes.map(value => JSON.stringify(value)).join(", ")}.`,
    "Use inspect for research, reading and analysis; change for editing; run for tool execution; verify for checking evidence; ask_user for missing user input. Express the specific intent in instruction, not a new action type.",
    "Prefer 1-3 coherent actions that Codex can execute now. Do not claim that Codex has performed an action before it reports evidence. A request to investigate normally needs an inspect action, not premature completion.",
    "Example response JSON (replace the sample plan with the actual plan, keeping the exact keys and identities):",
    JSON.stringify({protocol:PROTOCOL,sessionId,turnId,status:"continue",summary:"Inspect evidence before drawing conclusions",actions:[{id:"a1",type:"inspect",instruction:"Inspect the relevant evidence within the task scope",expectedResult:"Report verified findings and remaining gaps"}]}),
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
