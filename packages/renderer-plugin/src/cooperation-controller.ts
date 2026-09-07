import { BackgroundSession, type BackgroundChatPort, type BackgroundResult } from "./background-session.js";
import type { ChatConfiguration, ComposerIdentity, ConfigurationSnapshot, PreparedConfiguration, TaskIdentity } from "./chat-configuration.js";
import { BridgeError } from "./errors.js";
import { parseBridgeRequest, ProtocolError } from "./protocol.js";

interface Binding { owner: ComposerIdentity; config: Readonly<PreparedConfiguration>; ended: boolean }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BridgeError("INVALID_REQUEST", "Expected an object.");
  return value as Record<string, unknown>;
}
function fields(value: unknown, required: string[], optional: string[] = []): Record<string, unknown> {
  const input = object(value);
  if (required.some(key => !(key in input)) || Object.keys(input).some(key => ![...required, ...optional].includes(key))) throw new BridgeError("INVALID_REQUEST", "Unexpected or missing local call fields.");
  return input;
}
function id(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 256) throw new BridgeError("INVALID_REQUEST", "An explicit identity is required.");
  return value;
}
function identity(value: unknown): TaskIdentity {
  const input = fields(value, ["hostId", "taskId"]);
  return { hostId: id(input.hostId), taskId: id(input.taskId) };
}
function sameTask(a: TaskIdentity, b: TaskIdentity): boolean { return a.hostId === b.hostId && a.taskId === b.taskId; }

/** Three command operations; configuration preparation and consent are reachable only from local UI. */
export class CooperationController {
  private readonly bindings = new Map<string, Binding>();
  private active: { bindingId: string; session: BackgroundSession } | undefined;
  private stopped = false;

  constructor(readonly configuration: ChatConfiguration, private readonly receipt: (bindingId: string) => unknown,
    private readonly createChat: (config: Readonly<ConfigurationSnapshot>) => BackgroundChatPort,
    private readonly now?: () => number) {}

  prepare(owner: ComposerIdentity, snapshotId: string): Readonly<PreparedConfiguration> {
    this.check();
    return this.configuration.prepare(owner, snapshotId);
  }
  register(bindingId: string, owner: ComposerIdentity, config: Readonly<PreparedConfiguration>): void {
    this.check(); id(bindingId);
    if (this.bindings.has(bindingId)) throw new BridgeError("BINDING_EXISTS", "This submission is already registered.");
    if (this.bindings.size >= 128) throw new BridgeError("BINDING_LIMIT", "Reload the plugin after finishing active work to clear submission history.");
    this.bindings.set(bindingId, { owner: { ...owner }, config, ended: false });
  }

  status(payload: unknown) {
    this.check();
    const input = fields(payload, ["task"], ["bindingId", "read"]);
    const task = identity(input.task);
    const active = this.active?.session;
    const owned = active && sameTask(task, active.config.task);
    const bindingId = input.bindingId === undefined ? undefined : id(input.bindingId);
    const binding = bindingId ? this.bindings.get(bindingId) : undefined;
    let turn: ReturnType<BackgroundSession["readTurn"]> | undefined;
    if (input.read !== undefined) {
      const read = fields(input.read, ["sessionId", "turnId"]);
      const target = this.owned(task, id(read.sessionId));
      if (!bindingId || target.bindingId !== bindingId) throw new BridgeError("SESSION_MISMATCH", "Readback must use the original submission binding.");
      turn = target.session.readTurn(id(read.turnId));
    }
    // Never expose another task's configuration or native receipt.
    const submission = binding && ("draftId" in binding.owner || sameTask(task, binding.owner))
      ? this.acceptedReceipt(bindingId!, task, false) : null;
    const pending = !owned ? [...this.bindings.entries()].reverse().find(([key, value]) => !value.ended
      && ("draftId" in value.owner || sameTask(task, value.owner)) && this.acceptedReceipt(key, task, false)?.state === "accepted") : undefined;
    return {
      task, submission, nextSettings: this.configuration.task(task),
      ...(turn ? { turn } : {}),
      connection: pending ? { state: "awaiting-executor", bindingId: pending[0], snapshotId: pending[1].config.id } : null,
      prepared: !turn && submission?.state === "accepted" ? binding?.config ?? null : null,
      active: owned && !turn ? { sessionId: active.id, config: active.config, ...active.status() } : null,
      occupied: !!active && !owned,
      // Readback carries a bounded reply instead of duplicating configuration/catalog data.
      models: turn ? [] : this.configuration.models(),
    };
  }

  async exchange(payload: unknown): Promise<BackgroundResult> {
    this.check();
    const input = fields(payload, ["task", "bindingId", "snapshotId", "request"], ["replyToTurnId"]);
    const task = identity(input.task), bindingId = id(input.bindingId), snapshotId = id(input.snapshotId);
    const replyTo = input.replyToTurnId === undefined ? undefined : id(input.replyToTurnId);
    let request: ReturnType<typeof parseBridgeRequest>;
    try { request = parseBridgeRequest(input.request); }
    catch (error) {
      if (error instanceof ProtocolError) throw new BridgeError("LOCAL_REQUEST_INVALID", "No Chat request was sent: " + error.message);
      throw error;
    }
    const binding = this.bindings.get(bindingId);
    if (!binding || binding.ended) throw new BridgeError("SESSION_LOST", "This submission is not active in the current plugin instance.");
    if (binding.config.id !== snapshotId) throw new BridgeError("CONFIGURATION_MISMATCH", "The call does not match its visible configuration snapshot.");
    if (!("draftId" in binding.owner) && !sameTask(task, binding.owner)) throw new BridgeError("TASK_MISMATCH", "The call belongs to a different task.");
    this.acceptedReceipt(bindingId, task, true);
    if (this.active) {
      if (!sameTask(task, this.active.session.config.task)) throw new BridgeError("SESSION_OCCUPIED", "Another task owns the single active collaboration.");
      if (this.active.bindingId !== bindingId || this.active.session.id !== request.sessionId) throw new BridgeError("SESSION_MISMATCH", "Finish the current collaboration before starting another.");
    } else {
      if ("draftId" in binding.owner) {
        this.configuration.promote(binding.owner, task);
        binding.owner = task;
      }
      const enabled = this.configuration.task(binding.owner).enabled;
      if (!enabled) throw new BridgeError("COLLABORATION_DISABLED", "Collaboration was disabled after preparation.");
      const current = this.configuration.models().find(model => model.key === binding.config.model.key);
      if (!current || JSON.stringify(current) !== JSON.stringify(binding.config.model)) throw new BridgeError("CHAT_CONFIGURATION_REQUIRED", "The selected model is no longer available with the frozen parameters.");
      const config = Object.freeze({ ...binding.config, task: Object.freeze({ ...task }) });
      this.active = { bindingId, session: new BackgroundSession(request.sessionId, config, this.createChat(config), this.now) };
    }
    this.active.session.setEnabled(this.configuration.task(task).enabled);
    return await this.active.session.exchange(request, replyTo);
  }

  async finish(payload: unknown): Promise<{ state: "ended"; policy: "delete" | "retain" }> {
    return await this.end(payload, false);
  }
  async endFromUi(payload: unknown): Promise<{ state: "ended"; policy: "delete" | "retain" }> {
    return await this.end(payload, true);
  }
  private async end(payload: unknown, explicitUserEnd: boolean): Promise<{ state: "ended"; policy: "delete" | "retain" }> {
    this.check();
    const input = fields(payload, ["task", "sessionId", "policy"]);
    const active = this.owned(identity(input.task), id(input.sessionId));
    if (input.policy !== "delete" && input.policy !== "retain") throw new BridgeError("INVALID_REQUEST", "Choose delete or retain explicitly.");
    if (input.policy === "delete" && !explicitUserEnd && !active.session.hasCompletedReport()) throw new BridgeError("COMPLETION_UNVERIFIED", "Report completed local verification and obtain planner confirmation before automatic cleanup; explicit termination is available in the task panel.");
    await active.session.finish(input.policy);
    const binding = this.bindings.get(active.bindingId);
    if (binding) binding.ended = true;
    this.active = undefined;
    return { state: "ended", policy: input.policy };
  }

  /** These grants are intentionally absent from the host-command payloads. */
  consent(task: TaskIdentity, sessionId: string, action: "next-batch" | "continue-waiting" | "user-confirmed"): void {
    this.check();
    const { session } = this.owned(task, sessionId);
    if (action === "next-batch") session.allowNextBatch();
    else if (action === "continue-waiting") session.continueWaiting();
    else if (action === "user-confirmed") session.confirmUser();
    else throw new BridgeError("INVALID_REQUEST", "Unknown consent action.");
  }
  setEnabled(owner: ComposerIdentity, enabled: boolean): void {
    this.configuration.updateTask(owner, { enabled });
    if (!("draftId" in owner) && this.active && sameTask(owner, this.active.session.config.task)) this.active.session.setEnabled(enabled);
  }
  stop(): void { this.stopped = true; this.active?.session.stop(); this.active = undefined; this.bindings.clear(); this.configuration.resetTasks(); }

  private owned(task: TaskIdentity, sessionId: string) {
    if (!this.active) throw new BridgeError("SESSION_LOST", "No active collaboration exists in this plugin instance.");
    if (!sameTask(task, this.active.session.config.task)) throw new BridgeError("TASK_MISMATCH", "This task does not own the active collaboration.");
    if (this.active.session.id !== sessionId) throw new BridgeError("SESSION_MISMATCH", "This session identity does not match.");
    return this.active;
  }
  private acceptedReceipt(bindingId: string, task: TaskIdentity, strict: boolean) {
    const value = object(this.receipt(bindingId));
    if (value.state !== "accepted" || value.bindingId !== bindingId || typeof value.turnId !== "string") {
      if (strict) throw new BridgeError("SUBMISSION_UNCONFIRMED", "The visible instructions have not been confirmed by a native accepted submission.");
      return { state: "unconfirmed" };
    }
    if (value.hostId !== task.hostId || value.taskId !== task.taskId) {
      if (strict) throw new BridgeError("TASK_MISMATCH", "The accepted submission belongs to a different task.");
      return null;
    }
    return { state: "accepted", bindingId, task, nativeTurnId: value.turnId };
  }
  private check(): void { if (this.stopped) throw new BridgeError("SESSION_LOST", "The plugin instance has stopped."); }
}
