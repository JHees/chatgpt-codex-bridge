import type { AppChatClient } from "./app-chat-runtime.js";
import type { BackgroundChatPort } from "./background-session.js";
import type { ChatModel, CleanupPolicy } from "./chat-configuration.js";
import { BridgeError } from "./errors.js";

export interface NativeCompletionInput {
  request: {
    action: "next"; model: string; thinking_effort?: string; conversation_id?: string;
    parent_message_id: string;
    messages: Array<{ id: string; author: { role: "user" }; content: { content_type: "text"; parts: string[] } }>;
    timezone: string; timezone_offset_min: number;
  };
  onRequestStart(): void;
  onUpdate(value: unknown): void;
  onComplete(value: unknown): void;
  onError(value: unknown): void;
}
interface SentMessage {
  id: string;
  requestText: string;
  done: boolean;
  resolved: boolean;
  observed: Set<string>;
  reply?: string;
  finalId?: string;
  reading?: Promise<{ state: "waiting" } | { state: "complete"; text: string }>;
}
function object(value: unknown): Record<string, any> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : undefined;
}
function nonempty(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 256; }

/** Native App transport only: no DOM, navigation, separate HTTP authentication or database access. */
export class AppChatBackgroundAdapter implements BackgroundChatPort {
  private conversationId: string | undefined;
  private readonly sent = new Map<string, SentMessage>();
  private last: SentMessage | undefined;
  private terminal: BridgeError | undefined;
  private disposed = false;
  private deletion: Promise<unknown> | undefined;
  private cleanupPolicy: CleanupPolicy | undefined;
  private cleanupPending = false;
  private titleAttempted = false;
  private ownedTitle: string | undefined;
  private titleError: string | null = null;
  private readonly wake = new Set<() => void>();

  constructor(private readonly client: AppChatClient, private readonly isCurrent: () => boolean, private readonly uuid: () => string = () => crypto.randomUUID()) {}

  async check(): Promise<void> {
    this.assertCurrent();
    if (!this.last?.resolved || this.deletion) return;
    // Paused responses may outlive the native snapshot used to read them.
    // Revalidate before cached actions or the next business message can be released.
    const [conversation, stream] = await this.bounded(Promise.all([
      this.ownedConversation(false), this.client.getConversationStreamStatus(this.conversationId!),
    ]), "CHAT_READ_TIMEOUT");
    this.assertCurrent();
    if (object(stream)?.status !== "COMPLETE" || conversation.current_node !== this.last.finalId) {
      this.fail("USER_INTERVENED"); this.assertCurrent();
    }
  }

  async send(input: { text: string; model: ChatModel }): Promise<string> {
    await this.check();
    if (this.deletion) throw new BridgeError("CLEANUP_PENDING", "A requested deletion is still unresolved.");
    if (this.last && !this.last.resolved) throw new BridgeError("TURN_PENDING", "Resolve the current native reply before sending another message.");
    if (new TextEncoder().encode(input.text).length > 64 * 1024) throw new BridgeError("REQUEST_TOO_LARGE", "The Chat request exceeds its byte limit.");
    const id = this.uuid();
    let parent = this.uuid();
    if (this.conversationId) {
      parent = this.last?.finalId ?? "";
      if (!nonempty(parent)) throw new BridgeError("SESSION_UNCONFIRMED", "The owned final parent is missing.");
    }
    const turn: SentMessage = { id, requestText: input.text, done: false, resolved: false, observed: new Set() };
    this.sent.set(id, turn);
    this.last = turn;
    const request: NativeCompletionInput["request"] = {
      action: "next", model: input.model.slug, parent_message_id: parent,
      messages: [{ id, author: { role: "user" }, content: { content_type: "text", parts: [input.text] } }],
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, timezone_offset_min: new Date().getTimezoneOffset(),
    };
    if (input.model.effort !== null) request.thinking_effort = input.model.effort;
    if (this.conversationId) request.conversation_id = this.conversationId;
    let startObserved!: () => void;
    const started = new Promise<void>(resolve => { startObserved = resolve; });
    this.wake.add(startObserved);
    const invocation: NativeCompletionInput = {
      request,
      onRequestStart: () => startObserved(),
      onUpdate: value => {
        if (this.disposed) return;
        const event = object(value);
        if (nonempty(event?.conversationId)) {
          if (this.conversationId && this.conversationId !== event.conversationId) this.fail("SESSION_LOST");
          else this.conversationId = event.conversationId;
        }
        if (event?.type === "message" && nonempty(event.message?.id)) turn.observed.add(event.message.id);
        this.notify();
      },
      onComplete: value => {
        if (this.disposed) return;
        if (object(value)?.reason !== "done") this.fail("STREAM_TERMINATED");
        else turn.done = true;
        this.notify();
      },
      onError: value => {
        if (this.disposed) return;
        const status = object(value)?.responseStatus;
        this.fail(status === 429 ? "CHAT_RATE_LIMITED" : status === 403 ? "CHAT_PERMISSION_DENIED" : status === 401 ? "SESSION_LOST" : "CHAT_REQUEST_FAILED");
        startObserved(); this.notify();
      },
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // App owns stream completion. A slow completion Promise must not occupy one host call.
      void this.client.startCompletionStream(invocation).then(startObserved, () => {
        if (!this.disposed) this.fail("SEND_UNCERTAIN");
        startObserved(); this.notify();
      });
      await Promise.race([started, new Promise<void>(resolve => {
        // Startup can outlive this host window. Keep the registered message and
        // native invocation alive; read() will wait for its callbacks, never resend.
        timer = setTimeout(resolve, 10_000);
      })]);
    } catch { this.fail("SEND_UNCERTAIN"); }
    finally { clearTimeout(timer); this.wake.delete(startObserved); }
    this.assertCurrent();
    return id;
  }

  async read(messageId: string, waitMs: number, signal?: AbortSignal): Promise<{ state: "waiting" } | { state: "complete"; text: string }> {
    const interrupt = (): void => this.notify();
    signal?.addEventListener("abort", interrupt, { once: true });
    try { return await this.readPending(messageId, waitMs, signal); }
    finally { signal?.removeEventListener("abort", interrupt); }
  }

  private async readPending(messageId: string, waitMs: number, signal?: AbortSignal): Promise<{ state: "waiting" } | { state: "complete"; text: string }> {
    this.assertCurrent();
    if (signal?.aborted) throw new BridgeError("SESSION_ENDING", "Local reading stopped; native generation is not cancelled.");
    const turn = this.sent.get(messageId);
    if (!turn) throw new BridgeError("TURN_MISMATCH", "The native message does not belong to this session.");
    if (!Number.isFinite(waitMs) || waitMs <= 0 || waitMs > 90_000) throw new BridgeError("INVALID_REQUEST", "The native read window must be positive and no more than 90 seconds.");
    const deadline = performance.now() + waitMs;
    while (!turn.done && performance.now() < deadline) {
      await new Promise<void>(resolve => {
        const finish = (): void => { clearTimeout(timer); this.wake.delete(finish); resolve(); };
        const timer = setTimeout(finish, Math.max(1, deadline - performance.now()));
        this.wake.add(finish);
      });
      this.assertCurrent();
      if (signal?.aborted) throw new BridgeError("SESSION_ENDING", "Local reading stopped.");
    }
    if (!turn.done) return { state: "waiting" };
    if (turn.reply !== undefined) return { state: "complete", text: turn.reply };
    if (performance.now() >= deadline) return { state: "waiting" };
    turn.reading ??= this.completedReply(turn).finally(() => { delete turn.reading; });
    let timer: ReturnType<typeof setTimeout> | undefined;
    let release: (() => void) | undefined;
    try {
      const result = await Promise.race([turn.reading, new Promise<{ state: "waiting" }>(resolve => {
        release = () => resolve({ state: "waiting" });
        this.wake.add(release);
        timer = setTimeout(release, Math.max(1, deadline - performance.now()));
      })]);
      this.assertCurrent();
      if (signal?.aborted) throw new BridgeError("SESSION_ENDING", "Local reading stopped.");
      if (result.state === "waiting" && performance.now() < deadline) {
        // Native completion metadata can lag the stream callback. Preserve the
        // read window instead of returning immediately into a caller retry loop.
        clearTimeout(timer); if (release) this.wake.delete(release);
        await new Promise<void>(resolve => {
          release = resolve;
          this.wake.add(release);
          timer = setTimeout(resolve, Math.max(1, deadline - performance.now()));
        });
        this.assertCurrent();
      }
      return result;
    } finally { clearTimeout(timer); if (release) this.wake.delete(release); }
  }

  private async completedReply(turn: SentMessage): Promise<{ state: "waiting" } | { state: "complete"; text: string }> {
    if (!this.conversationId) throw new BridgeError("SESSION_UNCONFIRMED", "The native conversation identity is missing.");
    // The enclosing read owns one short-window timer; keep this in-flight lookup reusable.
    const status = object(await this.client.getConversationStreamStatus(this.conversationId!));
    this.assertCurrent();
    if (status?.status !== "COMPLETE") return { state: "waiting" };
    const conversation = await this.ownedConversation(false);
    let nodeId = conversation.current_node;
    const seen = new Set<string>();
    let reply: Record<string, any> | undefined;
    while (nonempty(nodeId) && seen.size < 4096 && !seen.has(nodeId)) {
      seen.add(nodeId);
      const node = object(conversation.mapping[nodeId]);
      const message = object(node?.message);
      if (message?.id === turn.id) break;
      if (message?.author?.role === "user") throw new BridgeError("USER_INTERVENED", "The active reply belongs to another user message.");
      if (message?.author?.role === "assistant" && message.end_turn === true) {
        if (reply || !turn.observed.has(nodeId)) throw new BridgeError("REPLY_AMBIGUOUS", "The native final reply is not uniquely correlated.");
        reply = message;
      }
      nodeId = node?.parent;
    }
    if (nodeId !== turn.id || !reply || !Array.isArray(reply.content?.parts) || !reply.content.parts.every((part: unknown) => typeof part === "string")) throw new BridgeError("REPLY_AMBIGUOUS", "The native reply chain is incomplete or unsupported.");
    const text = reply.content.parts.join("");
    if (new TextEncoder().encode(text).length > 64 * 1024) throw new BridgeError("RESULT_TOO_LARGE", "The native reply exceeds its byte limit.");
    await this.prefixTitle(conversation);
    this.assertCurrent();
    turn.reply = text;
    turn.finalId = conversation.current_node;
    turn.resolved = true;
    return { state: "complete", text };
  }

  async finish(policy: CleanupPolicy): Promise<void> {
    if (policy === "retain") {
      if (this.cleanupPending) throw new BridgeError("CLEANUP_PENDING", "A native cleanup request is already in flight; retention cannot undo it.");
      this.dispose(); return;
    }
    this.assertCurrent();
    if (this.cleanupPolicy && this.cleanupPolicy !== policy) throw new BridgeError("CLEANUP_PENDING", "The previous cleanup outcome must be resolved before changing policy.");
    if (policy === "archive" && !this.client.setArchived) throw new BridgeError("ARCHIVE_UNSUPPORTED", "The native Chat client does not support archiving.");
    if (this.deletion) { await this.bounded(this.deletion, "CLEANUP_PENDING"); await this.confirmCleanup(policy); this.dispose(); return; }
    if (!this.conversationId || !this.last || [...this.sent.values()].some(turn => !turn.done)) throw new BridgeError("CLEANUP_UNSAFE", "Chat is still generating or its identity is unresolved. Retry after completion or end and retain.");
    // A local waiter may have been interrupted before fetching an already completed reply.
    if (!this.last.resolved) await this.bounded(this.last.reading ?? this.completedReply(this.last), "CLEANUP_PENDING");
    if (!this.last.resolved) throw new BridgeError("CLEANUP_UNSAFE", "The final native reply is not yet confirmed.");
    await this.check();
    this.assertCurrent();
    this.cleanupPolicy = policy;
    this.cleanupPending = true;
    this.deletion = (policy === "archive" ? this.client.setArchived!(this.conversationId, true) : this.client.delete(this.conversationId)).then(result => {
      if (object(result)?.error || object(result)?.success === false) throw new BridgeError("CHAT_REQUEST_FAILED", "The native cleanup was rejected.");
    }).catch(error => { this.deletion = undefined; this.cleanupPolicy = undefined; throw error; }).finally(() => { this.cleanupPending = false; });
    await this.bounded(this.deletion, "CLEANUP_PENDING");
    await this.confirmCleanup(policy);
    this.dispose();
  }

  private async confirmCleanup(policy: CleanupPolicy): Promise<void> {
    if (policy !== "archive") return;
    const conversation = await this.ownedConversation();
    if (conversation.is_archived !== true) throw new BridgeError("ARCHIVE_UNCONFIRMED", "Archive has not been confirmed; retry to read the same target.");
  }

  dispose(): void { this.disposed = true; this.sent.clear(); this.last = undefined; this.notify(); }
  diagnostics() { return { titleError: this.titleError }; }
  private async prefixTitle(conversation: Record<string, any>): Promise<void> {
    if (this.titleAttempted) return;
    if (typeof conversation.title !== "string" || !conversation.title.trim()) { this.titleError = "TITLE_PENDING"; return; }
    if (!this.client.rename) { this.titleError = "TITLE_UNSUPPORTED"; return; }
    this.titleAttempted = true;
    const original = conversation.title;
    const title = original.startsWith("[bridge] ") ? original : `[bridge] ${original}`;
    try {
      if (title !== original) {
        const result = await this.bounded(this.client.rename(this.conversationId!, title), "TITLE_UPDATE_UNCERTAIN");
        if (object(result)?.error || object(result)?.success === false) throw new BridgeError("TITLE_UPDATE_FAILED", "Native title update was rejected.");
      }
      const checked = await this.ownedConversation();
      if (checked.title !== title) throw new BridgeError("TITLE_UPDATE_UNCONFIRMED", "The title update was not confirmed.");
      this.ownedTitle = title; this.titleError = null;
    } catch (error) {
      this.titleError = error instanceof BridgeError ? error.code : "TITLE_UPDATE_FAILED";
    }
  }
  private notify(): void { for (const resolve of this.wake) resolve(); this.wake.clear(); }
  private fail(code: string): void { this.terminal ??= new BridgeError(code, "The native Chat session cannot safely continue."); }
  private assertCurrent(): void {
    if (this.disposed || !this.isCurrent()) throw new BridgeError("SESSION_LOST", "The native Chat client or plugin instance has changed.");
    if (this.terminal) throw this.terminal;
  }
  private async ownedConversation(bounded = true): Promise<Record<string, any>> {
    this.assertCurrent();
    if (!this.conversationId) throw new BridgeError("SESSION_UNCONFIRMED", "The native conversation identity is not yet confirmed.");
    const lookup = this.client.get(this.conversationId);
    const conversation = object(await (bounded ? this.bounded(lookup, "CHAT_READ_TIMEOUT") : lookup));
    this.assertCurrent();
    const mapping = object(conversation?.mapping);
    if (this.ownedTitle !== undefined && conversation?.title !== this.ownedTitle) {
      this.fail("USER_INTERVENED"); this.assertCurrent();
    }
    if (!mapping || Object.keys(mapping).length > 20_000) throw new BridgeError("APP_UNSUPPORTED", "The native conversation mapping is unsupported.");
    const users = Object.values(mapping).map(node => object(node)?.message).filter(message => message?.author?.role === "user");
    if (users.length !== this.sent.size || users.some(message => {
      const owned = this.sent.get(message.id);
      return !owned || !Array.isArray(message.content?.parts) || !message.content.parts.every((part: unknown) => typeof part === "string") || message.content.parts.join("") !== owned.requestText;
    }) || new Set(users.map(message => message.id)).size !== users.length) {
      this.fail("USER_INTERVENED"); this.assertCurrent();
    }
    return conversation!;
  }
  private async bounded<T>(operation: Promise<T>, code: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([operation, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new BridgeError(code, "The native metadata operation exceeded its bounded window.")), 10_000);
      })]);
    } finally { clearTimeout(timer); }
  }
}
