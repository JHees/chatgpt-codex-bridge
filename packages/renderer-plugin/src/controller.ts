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
  repairAttempted: boolean;
  repairReason?: string;
  response?: BridgeResponse;
}

export class BridgeController {
  private sessionId: string | undefined;
  private readonly turns = new Map<string, TurnState>();

  constructor(private readonly dom: ChatDomPort) {}

  async exchange(input: unknown): Promise<BridgeResponse | LoaderHostAction> {
    const request = parseBridgeRequest(input);
    try {
      if (this.sessionId !== undefined && this.sessionId !== request.sessionId) {
        throw new BridgeError("SESSION_BUSY", "Another Bridge session is active.");
      }
      if (this.sessionId === undefined) {
        await this.dom.beginSession(request.sessionId);
        this.sessionId = request.sessionId;
      }

      const state = this.turns.get(request.turnId) ?? { repairAttempted: false };
      if (state.response !== undefined) return state.response;
      this.turns.set(request.turnId, state);
      const marker = markerFor(request.sessionId, request.turnId);
      if (state.repairAttempted) return await this.readRepair(request.sessionId, request.turnId, marker, state);
      const source = await this.dom.exchange(`${marker}\n${formatRequestPrompt(request)}`, marker, { sessionId: request.sessionId, turnId: request.turnId });
      if (isLoaderHostAction(source)) return source;
      try {
        const response = parseBridgeResponse(source, request.sessionId, request.turnId);
        state.response = response;
        return response;
      } catch (error) {
        if (!(error instanceof ProtocolError)) throw error;
        state.repairAttempted = true;
        state.repairReason = error.message;
        throw new BridgeError("PROTOCOL_REPAIR_REQUIRED", "Chat returned an invalid protocol response. Invoke exchange once more with the same turn to dispatch the single repair request.");
      }
    } catch (error) {
      if (error instanceof BridgeError && error.code === "SESSION_LOST") this.reset();
      throw error;
    }
  }

  async finish(input: unknown): Promise<{ finished: true }> {
    if (typeof input !== "object" || input === null || Array.isArray(input)) throw new BridgeError("INVALID_REQUEST", "finish payload must be an object.");
    const keys = Object.keys(input);
    if (keys.length !== 1 || keys[0] !== "sessionId") throw new BridgeError("INVALID_REQUEST", "finish payload must contain only sessionId.");
    const sessionId = (input as { sessionId?: unknown }).sessionId;
    if (typeof sessionId !== "string" || sessionId.length === 0) throw new BridgeError("INVALID_REQUEST", "sessionId must be a non-empty string.");
    if (this.sessionId !== sessionId) throw new BridgeError("SESSION_MISMATCH", "finish session does not match the active Bridge session.");
    await this.dom.finishSession(sessionId);
    this.reset();
    return { finished: true };
  }

  reset(): void {
    this.sessionId = undefined;
    this.turns.clear();
    this.dom.resetSession();
  }

  private async readRepair(sessionId: string, turnId: string, marker: string, state: TurnState): Promise<BridgeResponse | LoaderHostAction> {
    const repairMarker = `${marker}:repair`;
    const repaired = await this.dom.exchange(`${repairMarker}\n${formatRepairPrompt(sessionId, turnId, state.repairReason ?? "Invalid protocol response")}`, repairMarker, { sessionId, turnId });
    if (isLoaderHostAction(repaired)) return repaired;
    try {
      const response = parseBridgeResponse(repaired, sessionId, turnId);
      state.response = response;
      return response;
    } catch (error) {
      if (error instanceof ProtocolError) throw new BridgeError("PROTOCOL_INVALID", "Chat returned an invalid protocol response after one repair attempt.");
      throw error;
    }
  }
}

function isLoaderHostAction(value: string | LoaderHostAction): value is LoaderHostAction {
  return typeof value === "object";
}

function markerFor(sessionId: string, turnId: string): string {
  return `codex-bridge:${sessionId}:${turnId}`;
}
