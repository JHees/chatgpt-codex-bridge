import { isCleanupPolicy, type CleanupPolicy, type ConfigurationSnapshot } from "./chat-configuration.js";
import { BridgeError } from "./errors.js";
import { commandResponseBytes, formatRepairPrompt, formatRequestPrompt, parseBridgeRequest, parseBridgeResponse, ProtocolError, type BridgeRequest, type BridgeResponse } from "./protocol.js";

/** An adapter must correlate message IDs, verify ownership and reject terminal stream errors. */
export interface BackgroundChatPort {
  check(): Promise<void>;
  send(input: { text: string; model: ConfigurationSnapshot["model"] }): Promise<string>;
  read(messageId: string, waitMs: number, signal?: AbortSignal): Promise<{ state: "waiting" } | { state: "complete"; text: string }>;
  finish(policy: CleanupPolicy): Promise<void>;
  dispose?(): void;
  diagnostics?(): { titleError: string | null };
}

interface Turn {
  json: string;
  startedAt: number;
  deadline: number | null;
  messageId?: string;
  response?: BridgeResponse;
  paused: boolean;
  repair: "none" | "required" | "sent";
  source?: string;
  accounted?: boolean;
}
export type BackgroundResult =
  | { state: "waiting" | "paused"; turnId: string; elapsedMs: number; allowedMs: number | null; longWait: boolean }
  | { state: "response"; response: BridgeResponse }
  | { state: "already-delivered" | "repair-required"; turnId: string };

export interface ReplyDiagnostics { elapsedMs: number; repairCount: number; round: number }

/** In-memory session engine. Construction requires an already accepted, frozen task binding. */
export class BackgroundSession {
  private readonly turns = new Map<string, Turn>();
  private pending: string | undefined;
  private busy = false;
  private stopped = false;
  private terminal: BridgeError | undefined;
  private enabled = true;
  private used = 0;
  private last: string | undefined;
  private lastReply: ReplyDiagnostics | null = null;
  private requestLimit: number | null;
  private cleanupFailed = false;
  private cleanupReason: string | null = null;
  private completedReport = false;
  private endRequested = false;
  private idle: Promise<void> = Promise.resolve();
  private readAbort: AbortController | undefined;
  private finishing: { policy: CleanupPolicy; promise: Promise<void> } | undefined;

  constructor(readonly id: string, readonly config: Readonly<ConfigurationSnapshot>, private readonly chat: BackgroundChatPort, private readonly now: () => number = () => performance.now()) { this.requestLimit = config.settings.maxRequests; }

  async exchange(input: unknown, replyToTurnId?: string): Promise<BackgroundResult> {
    if (this.stopped) throw new BridgeError("SESSION_LOST", "This session has ended.");
    if (this.endRequested) throw new BridgeError("SESSION_ENDING", "Ending this session; no new actions or messages are allowed.");
    if (this.busy) throw new BridgeError("CALL_BUSY", "Another call is still running.");
    if (this.terminal) throw this.terminal;
    const request = parseBridgeRequest(input);
    if (request.sessionId !== this.id) throw new BridgeError("SESSION_MISMATCH", "The request does not belong to this session.");
    const json = JSON.stringify({ request, replyToTurnId });
    let turn = this.turns.get(request.turnId);
    if (turn && turn.json !== json) throw new BridgeError("TURN_CONFLICT", "A turn cannot change after it is registered.");
    if (this.pending && this.pending !== request.turnId) throw new BridgeError("TURN_PENDING", "Read or end the pending turn first.");
    if (turn?.response) return { state: "already-delivered", turnId: request.turnId };
    if (!this.enabled) throw new BridgeError("COLLABORATION_DISABLED", "Collaboration is disabled; no new request or repair will be sent.");
    if (turn?.paused) return this.waitState(request.turnId, turn);
    if (!turn) {
      if (this.requestLimit !== null && this.used >= this.requestLimit) throw new BridgeError("BUDGET_EXHAUSTED", "The user-selected total request limit has been reached.");
      this.checkResults(request, replyToTurnId);
    }
    this.busy = true;
    let release!: () => void;
    this.idle = new Promise<void>(resolve => { release = resolve; });
    this.readAbort = new AbortController();
    const assertRunning = (): void => {
      if (this.stopped) throw new BridgeError("SESSION_LOST", "The plugin stopped during the call.");
      if (this.endRequested) throw new BridgeError("SESSION_ENDING", "The user requested termination; no late actions are delivered.");
    };
    try {
      await this.chat.check();
      assertRunning();
      if (!turn) {
        const previous = this.last ? this.turns.get(this.last) : undefined;
        if (previous) previous.accounted = true;
        const startedAt = this.now();
        turn = { json, startedAt, deadline: this.config.settings.replyTimeoutMinutes === null ? null : startedAt + this.config.settings.replyTimeoutMinutes * 60_000, paused: false, repair: "none" };
        this.turns.set(request.turnId, turn);
        this.pending = request.turnId;
        // Register before sending. An uncertain send must never be attempted again.
        this.used++;
        turn.messageId = await this.send(formatRequestPrompt(request, this.requestLimit === null ? undefined : this.requestLimit - this.used));
        assertRunning();
      }
      if (this.deadlineReached(turn)) { turn.paused = true; return this.waitState(request.turnId, turn); }
      if (turn.repair === "required") {
        turn.repair = "sent";
        delete turn.source;
        turn.messageId = await this.send(formatRepairPrompt());
        assertRunning();
      }
      const remaining = turn.deadline === null ? 90_000 : turn.deadline - this.now();
      if (remaining <= 0) { turn.paused = true; return this.waitState(request.turnId, turn); }
      const result = turn.source === undefined
        ? await this.chat.read(turn.messageId!, Math.min(90_000, remaining), this.readAbort.signal)
        : { state: "complete" as const, text: turn.source };
      assertRunning();
      if (result.state === "complete") turn.source = result.text;
      if (this.stopped) throw new BridgeError("SESSION_LOST", "The plugin stopped while reading.");
      if (!this.enabled) throw new BridgeError("COLLABORATION_DISABLED", "Collaboration was disabled while waiting; no actions were delivered.");
      // A response arriving after the deadline is not delivered until the user continues.
      if (this.deadlineReached(turn)) { turn.paused = true; return this.waitState(request.turnId, turn); }
      if (result.state === "waiting") return this.waitState(request.turnId, turn);
      try {
        const response = parseBridgeResponse(result.text, this.id, request.turnId);
        if (commandResponseBytes(response) > 48 * 1024) throw new BridgeError("RESULT_TOO_LARGE", "The reply exceeds the safe command response size after JSON escaping.");
        turn.response = response;
      }
      catch (error) {
        if (!(error instanceof ProtocolError)) throw error;
        if (turn.repair === "sent") throw new BridgeError("PROTOCOL_INVALID", `The response remains invalid after one repair: ${error.message}`);
        turn.repair = "required";
        return { state: "repair-required", turnId: request.turnId };
      }
      this.pending = undefined;
      this.last = request.turnId;
      this.lastReply = { elapsedMs: Math.max(0, this.now() - turn.startedAt), repairCount: turn.repair === "sent" ? 1 : 0, round: this.used };
      this.completedReport = turn.response.status === "complete" && request.state.phase === "complete"
        && request.state.completed.length > 0 && request.state.blockers.length === 0
        && request.actionResults.every(result => result.outcome === "succeeded" || result.outcome === "skipped");
      return { state: "response", response: structuredClone(turn.response) };
    } catch (error) {
      if (this.endRequested) throw new BridgeError("SESSION_ENDING", "The session was explicitly ended; do not retry the exchange.");
      this.terminal = error instanceof BridgeError ? error : new BridgeError("BACKGROUND_FAILED", "The background adapter failed. End this session before trying again.");
      throw this.terminal;
    } finally { this.busy = false; this.readAbort = undefined; release(); }
  }

  setEnabled(enabled: boolean): void { this.enabled = enabled; }
  /** Read a validated cached reply only. Never send, repair, grant consent or fetch Chat. */
  readTurn(turnId: string) {
    if (this.stopped) throw new BridgeError("SESSION_LOST", "This session has ended.");
    if (this.endRequested) return { state: "ending" as const, turnId };
    const turn = this.turns.get(turnId);
    if (!turn) return { state: "not-found" as const, turnId };
    if (turn.accounted) return { state: "accounted" as const, turnId };
    if (this.terminal) return { state: "failed" as const, turnId, errorCode: this.terminal.code };
    if (!this.enabled) return { state: "disabled" as const, turnId };
    if (turn.response) return { state: "response" as const, response: structuredClone(turn.response) };
    if (turn.paused || this.deadlineReached(turn)) return { ...this.waitState(turnId, turn), state: "paused" as const };
    if (turn.repair === "required") return { state: "repair-required" as const, turnId };
    return this.waitState(turnId, turn);
  }
  hasCompletedReport(): boolean { return this.completedReport && !this.pending && !this.busy && !this.terminal && !this.stopped; }
  completedReply() {
    if (!this.hasCompletedReport() || !this.last) return null;
    return {turnId:this.last,result:{state:"response" as const,response:structuredClone(this.turns.get(this.last)!.response!)}};
  }
  status() {
    const turn = this.pending ? this.turns.get(this.pending) : undefined;
    const response = this.last ? this.turns.get(this.last)?.response : undefined;
    const deadlineReached = turn && (turn.paused || this.deadlineReached(turn));
    return {
      state: this.cleanupFailed ? "cleanup-failed" : this.endRequested ? "ending" : this.terminal ? "failed" : deadlineReached ? "paused" : turn?.repair === "required" ? "repair-required" : turn ? "waiting" : response?.status === "needs_user" ? "needs-user" : response?.status === "complete" ? "awaiting-verification" : response ? "actions-returned" : "ready",
      usedRequests: this.used, maxRequests: this.requestLimit, busy: this.busy,
      remainingRequests: this.requestLimit === null ? null : Math.max(0, this.requestLimit - this.used),
      lastReply: this.lastReply ? { ...this.lastReply } : null,
      errorCode: this.cleanupFailed ? "CLEANUP_FAILED" : this.terminal?.code ?? null,
      cleanupReason: this.cleanupReason,
      titleError: this.chat.diagnostics?.().titleError ?? null,
      completionReported: this.completedReport,
      ...(turn ? { turnId: this.pending, elapsedMs: Math.max(0, this.now() - turn.startedAt), allowedMs: turn.deadline === null ? null : turn.deadline - turn.startedAt, longWait: this.now() - turn.startedAt >= 15 * 60_000, repair: turn.repair } : {}),
    };
  }
  stop(): void { this.stopped = true; this.readAbort?.abort(); this.chat.dispose?.(); this.turns.clear(); this.lastReply = null; }

  removeRequestLimit(): void {
    if (this.stopped || this.terminal) throw new BridgeError("SESSION_LOST", "This session cannot continue.");
    if (this.busy || this.pending) throw new BridgeError("CALL_BUSY", "Wait for the current reply before changing its limit.");
    this.requestLimit = null;
  }

  async finish(policy: CleanupPolicy): Promise<void> {
    if (this.finishing) {
      if (this.finishing.policy !== policy) throw new BridgeError("CLEANUP_PENDING", "Another cleanup policy is still in progress.");
      return this.finishing.promise;
    }
    if (this.stopped) throw new BridgeError("SESSION_LOST", "This session has already ended.");
    if (!isCleanupPolicy(policy)) throw new BridgeError("INVALID_REQUEST", "Select an explicit cleanup policy.");
    this.endRequested = true;
    this.readAbort?.abort();
    const promise = this.finishAfterRead(policy);
    this.finishing = { policy, promise };
    try { await promise; } finally { this.finishing = undefined; }
  }

  private async finishAfterRead(policy: CleanupPolicy): Promise<void> {
    await this.idle;
    if (this.stopped) throw new BridgeError("SESSION_LOST", "The plugin stopped before cleanup.");
    this.busy = true;
    this.cleanupFailed = false; this.cleanupReason = null;
    try {
      // The adapter must verify created ownership, user intervention and stream terminal state.
      await this.chat.finish(policy);
      this.stopped = true;
      this.turns.clear();
    } catch (error) {
      this.cleanupFailed = true;
      this.cleanupReason = error instanceof BridgeError ? error.code : "CHAT_REQUEST_FAILED";
      throw new BridgeError("CLEANUP_FAILED", "The exact session target is retained; retry cleanup or retain it explicitly.");
    }
    finally { this.busy = false; }
  }

  private async send(text: string): Promise<string> {
    if (!this.enabled) throw new BridgeError("COLLABORATION_DISABLED", "Collaboration was disabled before sending.");
    try {
      const id = await this.chat.send({ text, model: this.config.model });
      if (!id) throw new Error("Missing identity");
      return id;
    } catch (error) {
      if (error instanceof BridgeError) throw error;
      throw new BridgeError("SEND_UNCERTAIN", "Sending did not return a definite message identity. No resend is allowed.");
    }
  }

  private checkResults(request: BridgeRequest, replyToTurnId?: string): void {
    const previous = this.last ? this.turns.get(this.last)?.response : undefined;
    if (!previous) {
      if (replyToTurnId !== undefined || request.kind !== "request" || request.actionResults.length) throw new BridgeError("ACTION_RESULTS_INVALID", "The initial request cannot report unknown actions.");
      return;
    }
    // A premature planner complete may be corrected with fresh local evidence;
    // it does not terminate the executor's work or waive the remaining budget.
    if (replyToTurnId !== this.last || request.kind !== "result" || request.actionResults.length !== previous.actions.length) throw new BridgeError("ACTION_RESULTS_INVALID", "Results must match all actions of the immediately preceding reply.");
    let halted = false;
    for (const [index, result] of request.actionResults.entries()) {
      if (result.actionId !== previous.actions[index]?.id || (halted && result.outcome !== "skipped")) throw new BridgeError("ACTION_RESULTS_INVALID", "Action results are unknown, duplicated, out of order or continue after failure.");
      if (result.outcome === "failed" || result.outcome === "blocked") halted = true;
    }
  }

  /** UI-only consent, not an option accepted in an exchange payload. */
  continueWaiting(): void {
    if (this.stopped || this.terminal) throw new BridgeError("SESSION_LOST", "This session cannot continue.");
    if (this.busy) throw new BridgeError("CALL_BUSY", "Wait for the current read to return.");
    const turn = this.pending ? this.turns.get(this.pending) : undefined;
    if (!turn || turn.deadline === null || (!turn.paused && !this.deadlineReached(turn))) throw new BridgeError("NOT_PAUSED", "No reply is paused at its waiting limit.");
    turn.deadline = this.now() + this.config.settings.replyTimeoutMinutes! * 60_000;
    turn.paused = false;
  }

  private waitState(turnId: string, turn: Turn): BackgroundResult {
    return { state: turn.paused ? "paused" : "waiting", turnId, elapsedMs: Math.max(0, this.now() - turn.startedAt), allowedMs: turn.deadline === null ? null : turn.deadline - turn.startedAt, longWait: this.now() - turn.startedAt >= 15 * 60_000 };
  }
  private deadlineReached(turn: Turn): boolean { return turn.deadline !== null && this.now() >= turn.deadline; }
}
