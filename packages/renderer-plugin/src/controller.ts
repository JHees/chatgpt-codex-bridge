import { BridgeError } from "./errors.js";
import {
  formatRepairPrompt,
  formatRequestPrompt,
  parseBridgeRequest,
  parseBridgeResponse,
  ProtocolError,
  type BridgeResponse,
} from "./protocol.js";

export { BridgeError } from "./errors.js";

export interface ChatDomPort {
  beginSession(sessionId: string): Promise<void>;
  checkSession(): Promise<void>;
  exchange(message: string, marker: string, correlation: ReplyCorrelation): Promise<string | LoaderHostAction>;
  finishSession(sessionId: string): Promise<void>;
  resetSession(): void;
}

export interface ReplyCorrelation {
  sessionId: string;
  turnId: string;
}

export interface LoaderHostAction {
  $loaderHostAction: {
    version: 1;
    type: "press-enter";
  };
}

interface TurnState {
  requestJson: string;
  repairAttempted: boolean;
  repairReason?: string;
  response?: BridgeResponse;
}

export class BridgeController {
  private sessionId: string | undefined;
  private readonly turns = new Map<string, TurnState>();
  private pendingTurnId: string | undefined;
  private terminalError: BridgeError | undefined;
  private busy = false;
  private generation = 0;

  constructor(private readonly dom: ChatDomPort) {}

  async exchange(input: unknown): Promise<BridgeResponse | LoaderHostAction> {
    return await this.exclusive(async (checkCurrent) => {
      let request;
      try { request = parseBridgeRequest(input); }
      catch (error) {
        if (error instanceof ProtocolError) throw new BridgeError("INVALID_REQUEST", error.message);
        throw error;
      }
      if (this.sessionId !== undefined && this.sessionId !== request.sessionId) {
        throw new BridgeError("SESSION_BUSY", "Another Bridge session is active.");
      }
      if (this.terminalError !== undefined) throw this.terminalError;
      const requestJson = JSON.stringify(request);
      const state = this.turns.get(request.turnId) ?? { requestJson, repairAttempted: false };
      if (state.requestJson !== requestJson) throw new BridgeError("TURN_CONFLICT", "A turn ID cannot be reused with a different payload.");
      if (this.pendingTurnId !== undefined && this.pendingTurnId !== request.turnId) {
        throw new BridgeError("TURN_PENDING", "Read or finish the pending turn before starting another turn.");
      }
      try {
        if (this.sessionId === undefined) {
          this.sessionId = request.sessionId;
          await this.dom.beginSession(request.sessionId);
        } else {
          await this.dom.checkSession();
        }
        checkCurrent();
        if (state.response !== undefined) return state.response;
        this.turns.set(request.turnId, state);
        this.pendingTurnId = request.turnId;
        const marker = markerFor(request.sessionId, request.turnId) + (state.repairAttempted ? ":repair" : "");
        const prompt = state.repairAttempted
          ? formatRepairPrompt()
          : formatRequestPrompt(request);
        const source = await this.dom.exchange(`${marker}\n${prompt}`, marker, request);
        checkCurrent();
        if (typeof source === "object") return source;
        try {
          state.response = parseBridgeResponse(source, request.sessionId, request.turnId);
          this.pendingTurnId = undefined;
          return state.response;
        } catch (error) {
          if (!(error instanceof ProtocolError)) throw error;
          if (state.repairAttempted) throw new BridgeError("PROTOCOL_INVALID", "Chat returned an invalid protocol response after one repair attempt.");
          state.repairAttempted = true;
          state.repairReason = error.message;
          throw new BridgeError("PROTOCOL_REPAIR_REQUIRED", "Invoke exchange once more with the identical payload to dispatch the single repair request.");
        }
      } catch (error) {
        if (error instanceof BridgeError) {
          if (error.code === "SESSION_LOST") this.reset();
          else if (["SEND_UNCERTAIN", "DOM_AMBIGUOUS", "PROTOCOL_INVALID"].includes(error.code)) this.terminalError = error;
          throw error;
        }
        this.terminalError = new BridgeError("BRIDGE_FAILED", "Unexpected Bridge failure; finish the session before continuing.");
        throw this.terminalError;
      }
    });
  }

  async finish(input: unknown): Promise<{ finished: true }> {
    return await this.exclusive(async (checkCurrent) => {
      if (typeof input !== "object" || input === null || Array.isArray(input)) throw new BridgeError("INVALID_REQUEST", "finish payload must be an object.");
      const keys = Object.keys(input);
      if (keys.length !== 1 || keys[0] !== "sessionId") throw new BridgeError("INVALID_REQUEST", "finish payload must contain only sessionId.");
      const sessionId = (input as { sessionId?: unknown }).sessionId;
      if (typeof sessionId !== "string" || sessionId.length === 0) throw new BridgeError("INVALID_REQUEST", "sessionId must be a non-empty string.");
      if (this.sessionId !== sessionId) throw new BridgeError("SESSION_MISMATCH", "finish session does not match the active Bridge session.");
      await this.dom.finishSession(sessionId);
      checkCurrent();
      this.reset();
      return { finished: true as const };
    });
  }

  reset(): void {
    this.generation += 1;
    this.sessionId = undefined;
    this.pendingTurnId = undefined;
    this.terminalError = undefined;
    this.turns.clear();
    this.dom.resetSession();
  }

  private async exclusive<T>(work: (checkCurrent: () => void) => Promise<T>): Promise<T> {
    if (this.busy) throw new BridgeError("CALL_BUSY", "A Bridge call is already in flight.");
    this.busy = true;
    const generation = this.generation;
    try {
      return await work(() => {
        if (generation !== this.generation) throw new BridgeError("SESSION_LOST", "The Bridge instance was reset during the call.");
      });
    } finally {
      this.busy = false;
    }
  }
}

function markerFor(sessionId: string, turnId: string): string {
  return `codex-bridge:${encodeURIComponent(sessionId)}:${encodeURIComponent(turnId)}`;
}
