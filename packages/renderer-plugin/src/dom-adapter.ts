import type { ChatDomPort, LoaderHostAction, ReplyCorrelation } from "./controller.js";
import { BridgeError } from "./errors.js";
import { PROTOCOL } from "./protocol.js";

interface AdapterOptions {
  pollMs?: number;
  stableMs?: number;
  timeoutMs?: number;
}

interface MessageEntry {
  container: Element;
  text: string;
}

const labels = {
  newChat: ["新对话", "New chat"],
  edit: ["编辑消息", "Edit message"],
  back: ["返回", "Back"],
  generating: ["停止生成", "Stop generating"],
  chatGptMode: ["切换模式，当前模式：ChatGPT", "Switch mode, current mode: ChatGPT"],
  modelSelector: ["选择 ChatGPT 模型", "Select ChatGPT model"],
  pinChat: ["置顶聊天", "Pin chat"],
  chatActions: ["聊天操作", "Chat actions", "Conversation actions"],
} as const;

const allowedReasoningLabels = new Set([
  "思考强度中",
  "思考强度中等",
  "思考强度高",
  "Thinking effort Medium",
  "Thinking effort: Medium",
  "Thinking effort High",
  "Thinking effort: High",
  "Reasoning effort Medium",
  "Reasoning effort: Medium",
  "Reasoning effort High",
  "Reasoning effort: High",
]);

const highReasoningOptions = new Set([
  "高",
  "High",
  "思考强度高",
  "Thinking effort High",
  "Thinking effort: High",
  "Reasoning effort High",
  "Reasoning effort: High",
]);

const trustedEnterAction: LoaderHostAction = Object.freeze({
  $loaderHostAction: Object.freeze({ version: 1, type: "press-enter" }),
});

export class AppChatDomAdapter implements ChatDomPort {
  private readonly pollMs: number;
  private readonly stableMs: number;
  private readonly timeoutMs: number;
  private conversationKey: string | undefined;
  private conversationKeysBeforeSession = new Set<string>();
  private pendingSendMarker: string | undefined;
  private readonly replyBaselines = new Map<string, number>();
  private sessionId: string | undefined;
  private sessionAnchorMarker: string | undefined;

  constructor(private readonly document: Document, options: AdapterOptions = {}) {
    this.pollMs = options.pollMs ?? 100;
    this.stableMs = options.stableMs ?? 1_200;
    this.timeoutMs = options.timeoutMs ?? 90_000;
  }

  async beginSession(sessionId: string): Promise<void> {
    if (this.sessionId !== undefined) throw new BridgeError("SESSION_BUSY", "A DOM session is already active.");
    if (this.document.location.href !== "app://-/index.html") throw new BridgeError("SESSION_LOST", "Bridge is not running in the Codex main renderer.");
    if (this.userEntries("codex-bridge:").length > 0) {
      throw new BridgeError("SESSION_LOST", "A prior Bridge conversation is visible but its in-memory session was lost.");
    }
    this.conversationKeysBeforeSession = new Set(this.conversationRows().map(({ key }) => key));
    const newChat = this.uniqueAction(labels.newChat, "new Chat");
    newChat.click();
    await this.waitFor(() => {
      this.uniqueComposer();
      this.uniqueAction(labels.back, "back");
      return true;
    }, "SESSION_LOST", "App Chat controls did not appear.", Math.min(this.timeoutMs, 10_000));
    await this.ensureChatConfiguration();
    this.sessionId = sessionId;
    this.sessionAnchorMarker = undefined;
  }

  async exchange(message: string, marker: string, correlation: ReplyCorrelation): Promise<string | LoaderHostAction> {
    await this.ensureSessionVisible(marker);
    const existing = this.userEntries(marker);
    if (existing.length > 1) throw new BridgeError("DOM_AMBIGUOUS", "Multiple user messages match the Bridge turn.");
    if (existing.length === 0) {
      if (this.pendingSendMarker === marker) {
        try {
          await this.waitFor(
            () => this.userEntries(marker).length === 1,
            "SEND_UNCERTAIN",
            "The trusted Enter send could not be confirmed.",
            Math.min(this.timeoutMs, 10_000),
          );
        } catch (error) {
          if (!(error instanceof BridgeError) || error.code !== "SEND_UNCERTAIN") throw error;
          const composers = this.composers();
          const composer = composers.length === 1 ? composers[0] : undefined;
          const active = this.document.activeElement;
          const composerTextLength = (composer?.textContent ?? "").length;
          throw new BridgeError(
            "SEND_UNCERTAIN",
            `The trusted Enter send could not be confirmed. State: activeComposer=${active === composer}, composers=${composers.length}, composerTextLength=${composerTextLength}, visibility=${this.document.visibilityState}.`,
          );
        }
      } else {
        if (this.pendingSendMarker !== undefined) throw new BridgeError("SEND_UNCERTAIN", "Another Bridge message has an unresolved send state.");
        this.uniqueComposer();
        this.replyBaselines.set(marker, this.protocolReplySources(correlation).length);
        this.enterComposer(message);
        this.pendingSendMarker = marker;
        return trustedEnterAction;
      }
    }
    if (this.pendingSendMarker === marker) this.pendingSendMarker = undefined;
    this.sessionAnchorMarker ??= marker;
    return await this.waitForStableReply(marker, correlation);
  }

  async finishSession(sessionId: string): Promise<void> {
    if (this.sessionId !== sessionId) throw new BridgeError("SESSION_MISMATCH", "DOM session does not match finish request.");
    await this.ensureSessionVisible();
    const marker = this.sessionAnchorMarker;
    this.activate(this.uniqueAction(labels.back, "back"));
    await this.waitFor(
      () => marker !== undefined ? this.userEntries(marker).length === 0 : this.actions(labels.back).length === 0,
      "RESTORE_REQUIRED",
      "Codex task restoration could not be verified.",
      Math.min(this.timeoutMs, 10_000),
    );
    this.resetSession();
  }

  resetSession(): void {
    this.conversationKey = undefined;
    this.conversationKeysBeforeSession.clear();
    this.pendingSendMarker = undefined;
    this.replyBaselines.clear();
    this.sessionId = undefined;
    this.sessionAnchorMarker = undefined;
  }

  private requireSession(): void {
    if (this.sessionId === undefined) throw new BridgeError("SESSION_LOST", "No App Chat session is active.");
  }

  private enterComposer(message: string): void {
    const composer = this.uniqueComposer();
    composer.focus();
    const selection = this.document.defaultView?.getSelection();
    if (selection !== undefined && selection !== null) {
      const range = this.document.createRange();
      range.selectNodeContents(composer);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    const editableDocument = this.document as Document & { execCommand?: (command: string, showUi: boolean, value: string) => boolean };
    const inserted = editableDocument.execCommand?.("insertText", false, message) ?? false;
    if (!inserted) composer.textContent = message;
    const InputEventConstructor = this.document.defaultView?.InputEvent;
    if (InputEventConstructor !== undefined) {
      composer.dispatchEvent(new InputEventConstructor("input", { bubbles: true, inputType: "insertText", data: message }));
    } else {
      composer.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  private async waitForStableReply(marker: string, correlation: ReplyCorrelation): Promise<string> {
    let last = "";
    let stableSince = 0;
    try {
      return await this.waitFor(() => {
        this.captureConversationKey();
        if (this.actions(labels.generating).length > 0) {
          last = "";
          stableSince = 0;
          return undefined;
        }
        const replies = this.protocolReplySources(correlation).slice(this.replyBaselines.get(marker) ?? 0);
        if (replies.length > 1) throw new BridgeError("DOM_AMBIGUOUS", "Multiple assistant replies match the Bridge turn.");
        const current = replies[0]?.trim() ?? "";
        if (current.length === 0) return undefined;
        if (current !== last) {
          last = current;
          stableSince = Date.now();
          if (this.stableMs > 0) return undefined;
        }
        return Date.now() - stableSince >= this.stableMs ? current : undefined;
      }, "REPLY_TIMEOUT", "Timed out waiting for the correlated App Chat reply.");
    } catch (error) {
      if (error instanceof BridgeError && error.code === "REPLY_TIMEOUT") {
        const users = this.userEntries(marker).length;
        const assistants = Math.max(0, this.protocolReplySources(correlation).length - (this.replyBaselines.get(marker) ?? 0));
        const generating = this.actions(labels.generating).length;
        const composers = this.composers().length;
        const controls = this.conversationControlLabels(marker);
        const semanticActions = this.semanticActionSignatures();
        const edit = this.actions(labels.edit).length;
        const back = this.actions(labels.back).length;
        const newChat = this.actions(labels.newChat).length;
        const chatMode = this.actions(labels.chatGptMode).length;
        const modelSelector = this.actions(labels.modelSelector).length;
        const conversationRows = this.conversationRows().length;
        const conversationKey = this.conversationKey === undefined ? 0 : 1;
        const pending = [...this.document.querySelectorAll<HTMLElement>('[aria-busy="true"],[role="progressbar"]')].filter((element) => this.isUsable(element)).length;
        const alerts = [...this.document.querySelectorAll<HTMLElement>('[role="alert"],[role="status"]')]
          .filter((element) => this.isUsable(element))
          .map((element) => (element.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 64))
          .filter(Boolean)
          .slice(0, 3);
        const online = this.document.defaultView?.navigator.onLine ?? true;
        throw new BridgeError("REPLY_TIMEOUT", `Timed out waiting for the correlated App Chat reply. State: u=${users}, a=${assistants}, edit=${edit}, gen=${generating}, composer=${composers}, pending=${pending}, back=${back}, new=${newChat}, mode=${chatMode}, model=${modelSelector}, rows=${conversationRows}, key=${conversationKey}, online=${Number(online)}, visibility=${this.document.visibilityState}, controls=${JSON.stringify(controls)}, actions=${JSON.stringify(semanticActions)}, alerts=${JSON.stringify(alerts)}.`);
      }
      throw error;
    }
  }

  private protocolReplySources(correlation: ReplyCorrelation): string[] {
    const body = this.document.body;
    if (body === null) return [];
    const NodeFilterConstructor = this.document.defaultView?.NodeFilter;
    if (NodeFilterConstructor === undefined) return [];
    const walker = this.document.createTreeWalker(body, NodeFilterConstructor.SHOW_TEXT);
    const results = new Set<string>();
    let node = walker.nextNode();
    while (node !== null) {
      const text = node.textContent ?? "";
      if (text.includes(PROTOCOL) || text.includes(correlation.sessionId)) {
        let current = node.parentElement;
        for (let depth = 0; depth < 12 && current !== null && current !== body; depth += 1) {
          const parsed = this.correlatedProtocolJson(current.textContent ?? "", correlation);
          if (parsed !== undefined) {
            results.add(parsed);
            break;
          }
          current = current.parentElement;
        }
      }
      node = walker.nextNode();
    }
    return [...results].map((source) => `\`\`\`codex-bridge-response-v1\n${source}\n\`\`\``);
  }

  private correlatedProtocolJson(source: string, correlation: ReplyCorrelation): string | undefined {
    const start = source.indexOf("{");
    const end = source.lastIndexOf("}");
    if (start < 0 || end <= start) return undefined;
    try {
      const value = JSON.parse(source.slice(start, end + 1)) as Record<string, unknown>;
      if (value.protocol !== PROTOCOL
        || value.sessionId !== correlation.sessionId
        || value.turnId !== correlation.turnId
        || typeof value.status !== "string"
        || !Array.isArray(value.actions)) return undefined;
      return JSON.stringify(value);
    } catch {
      return undefined;
    }
  }

  private userEntries(marker: string): MessageEntry[] {
    return this.messageEntries().filter((entry) => entry.text.includes(marker));
  }

  private conversationControlLabels(marker: string): string[] {
    const user = this.userEntries(marker)[0];
    const root = user?.container.parentElement ?? user?.container;
    if (root === undefined) return [];
    const values = [...root.querySelectorAll<HTMLElement>("button,[role=button],[role=status],[role=progressbar]")]
      .filter((element) => this.isUsable(element))
      .map((element) => element.getAttribute("aria-label") ?? element.getAttribute("title"))
      .filter((value): value is string => value !== null && value.length > 0 && value.length <= 48);
    return [...new Set(values)].slice(-10);
  }

  private semanticActionSignatures(): string[] {
    const values = [...this.document.querySelectorAll<HTMLElement>("button,[role=button]")]
      .filter((element) => this.isUsable(element))
      .map((element) => [
        element.getAttribute("aria-label"),
        element.getAttribute("title"),
        element.getAttribute("data-testid"),
        (element.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 24),
      ].filter((value): value is string => value !== null && value.length > 0).join("|"))
      .filter((value) => /复制|编辑|重新生成|copy|edit|regenerate/i.test(value))
      .map((value) => value.slice(0, 72));
    return [...new Set(values)].slice(-6);
  }

  private messageEntries(): MessageEntry[] {
    const containers = [...this.document.querySelectorAll<HTMLElement>("button,[role=button]")]
      .filter((element) => this.isUsable(element) && this.matches(element, labels.edit))
      .map((element) => element.closest("[data-message-id],article,[role=listitem]") ?? this.messageAncestor(element));
    return [...new Set(containers)].map((container) => ({ container, text: container.textContent ?? "" }));
  }

  private async ensureSessionVisible(turnMarker?: string): Promise<void> {
    this.requireSession();
    const anchor = this.sessionAnchorMarker;
    if (anchor === undefined) return;
    const visible = this.userEntries(anchor).length;
    if (visible > 1) throw new BridgeError("DOM_AMBIGUOUS", "Multiple user messages match the Bridge session anchor.");
    const currentTurnIsPosted = turnMarker !== undefined && this.userEntries(turnMarker).length === 1;
    if (visible === 1 && (turnMarker === undefined || currentTurnIsPosted || this.composers().length === 1)) return;

    this.captureConversationKey();
    if (this.conversationKey === undefined) {
      throw new BridgeError("SESSION_LOST", "The dedicated App Chat identity could not be recovered.");
    }
    let rows = this.conversationRows().filter(({ key }) => key === this.conversationKey);
    if (rows.length === 0) {
      const replacements = this.conversationRows().filter(({ key }) => !this.conversationKeysBeforeSession.has(key));
      if (replacements.length === 1) {
        this.conversationKey = replacements[0]!.key;
        rows = replacements;
      } else if (replacements.length > 1) {
        throw new BridgeError("DOM_AMBIGUOUS", "Multiple replacement App Chat sidebar identities appeared during the Bridge session.");
      }
    }
    if (rows.length !== 1) {
      throw new BridgeError(rows.length === 0 ? "SESSION_LOST" : "DOM_AMBIGUOUS", "The dedicated App Chat sidebar identity is unavailable or ambiguous.");
    }
    const open = this.uniqueConversationOpenAction(rows[0]!.element);
    this.activate(open);
    if (this.composers().length === 0) this.activate(rows[0]!.element);
    await this.waitFor(() => {
      const matches = this.userEntries(anchor).length;
      if (matches > 1) throw new BridgeError("DOM_AMBIGUOUS", "Multiple user messages match the Bridge session anchor.");
      const posted = turnMarker !== undefined && this.userEntries(turnMarker).length === 1;
      const ready = turnMarker === undefined || posted || this.composers().length === 1;
      return matches === 1 && ready ? true : undefined;
    }, "SESSION_LOST", "The dedicated App Chat could not be reopened.", Math.min(this.timeoutMs, 10_000));
  }

  private activate(element: HTMLElement): void {
    const PointerEventConstructor = this.document.defaultView?.PointerEvent;
    if (PointerEventConstructor !== undefined) {
      element.dispatchEvent(new PointerEventConstructor("pointerdown", { bubbles: true, button: 0, pointerType: "mouse", isPrimary: true }));
      element.dispatchEvent(new PointerEventConstructor("pointerup", { bubbles: true, button: 0, pointerType: "mouse", isPrimary: true }));
    }
    const MouseEventConstructor = this.document.defaultView?.MouseEvent;
    if (MouseEventConstructor !== undefined) {
      element.dispatchEvent(new MouseEventConstructor("mousedown", { bubbles: true, button: 0 }));
      element.dispatchEvent(new MouseEventConstructor("mouseup", { bubbles: true, button: 0 }));
    }
    element.click();
  }

  private captureConversationKey(): void {
    if (this.conversationKey !== undefined) return;
    const added = this.conversationRows().filter(({ key }) => !this.conversationKeysBeforeSession.has(key));
    if (added.length > 1) throw new BridgeError("DOM_AMBIGUOUS", "Multiple new App Chat sidebar identities appeared during the Bridge session.");
    if (added.length === 1) this.conversationKey = added[0]!.key;
  }

  private conversationRows(): Array<{ element: HTMLElement; key: string }> {
    return [...this.document.querySelectorAll<HTMLElement>("[data-sidebar-chatgpt-conversation-key]")]
      .filter((element) => this.isUsable(element))
      .map((element) => ({ element, key: element.getAttribute("data-sidebar-chatgpt-conversation-key") ?? "" }))
      .filter(({ key }) => key.startsWith("chatgpt:conversation:") && key.length > "chatgpt:conversation:".length);
  }

  private uniqueConversationOpenAction(row: HTMLElement): HTMLElement {
    const actions = [...row.querySelectorAll<HTMLElement>('button,[role="button"],a,[role="link"]')]
      .filter((element) => this.isUsable(element))
      .filter((element) => !this.matches(element, labels.pinChat) && !this.matches(element, labels.chatActions));
    if (actions.length !== 1) {
      throw new BridgeError(actions.length === 0 ? "SESSION_LOST" : "DOM_AMBIGUOUS", "Expected exactly one action for the dedicated App Chat sidebar item.");
    }
    return actions[0]!;
  }

  private messageAncestor(action: Element): Element {
    let current = action.parentElement;
    while (current !== null && current !== this.document.body) {
      const actionCount = current.querySelectorAll("button,[role=button]").length;
      if (actionCount > 0 && current.textContent?.trim()) return current;
      current = current.parentElement;
    }
    throw new BridgeError("DOM_AMBIGUOUS", "A message action has no semantic message container.");
  }

  private uniqueComposer(): HTMLElement {
    const items = this.composers();
    if (items.length !== 1) throw new BridgeError(items.length === 0 ? "SESSION_LOST" : "DOM_AMBIGUOUS", "Expected exactly one App Chat composer.");
    return items[0]!;
  }

  private composers(): HTMLElement[] {
    return [...this.document.querySelectorAll<HTMLElement>('[role="textbox"][contenteditable="true"]')]
      .filter((element) => this.isUsable(element));
  }

  private uniqueAction(expected: readonly string[], name: string): HTMLElement {
    const items = this.actions(expected);
    if (items.length === 0) throw new BridgeError("DOM_NOT_FOUND", `Expected exactly one ${name} action.`);
    for (const value of [
      (element: HTMLElement) => element.getAttribute("aria-label"),
      (element: HTMLElement) => element.getAttribute("title"),
      (element: HTMLElement) => element.textContent?.trim(),
    ]) {
      const preferred = items.filter((element) => {
        const candidate = value(element);
        return candidate !== null && candidate !== undefined && expected.includes(candidate);
      });
      if (preferred.length === 1) return preferred[0]!;
      if (preferred.length > 1) break;
    }
    throw new BridgeError("DOM_AMBIGUOUS", `Expected exactly one ${name} action.`);
  }

  private actions(expected: readonly string[]): HTMLElement[] {
    return [...this.document.querySelectorAll<HTMLElement>("button,[role=button]")]
      .filter((element) => this.isUsable(element) && this.matches(element, expected));
  }

  private async ensureChatConfiguration(): Promise<void> {
    try {
      this.uniqueAction(labels.chatGptMode, "ChatGPT mode");
    } catch (error) {
      if (error instanceof BridgeError && error.code === "DOM_AMBIGUOUS") throw error;
      throw new BridgeError("CHAT_CONFIGURATION_REQUIRED", "App Chat must use ChatGPT mode; Pro is not allowed.");
    }
    let selector: HTMLElement;
    try {
      selector = this.uniqueAction(labels.modelSelector, "ChatGPT model selector");
    } catch (error) {
      if (error instanceof BridgeError && error.code === "DOM_AMBIGUOUS") throw error;
      throw new BridgeError("CHAT_CONFIGURATION_REQUIRED", "App Chat reasoning level could not be verified.");
    }
    const current = (selector.textContent ?? "").trim().replace(/\s+/g, " ");
    if (allowedReasoningLabels.has(current)) return;

    const PointerEventConstructor = this.document.defaultView?.PointerEvent;
    if (PointerEventConstructor !== undefined) {
      selector.dispatchEvent(new PointerEventConstructor("pointerdown", { bubbles: true, button: 0, pointerType: "mouse", isPrimary: true }));
    } else {
      const MouseEventConstructor = this.document.defaultView?.MouseEvent;
      if (MouseEventConstructor === undefined) throw new BridgeError("CHAT_CONFIGURATION_REQUIRED", "App Chat reasoning menu could not be opened.");
      selector.dispatchEvent(new MouseEventConstructor("mousedown", { bubbles: true, button: 0 }));
    }

    let high: HTMLElement;
    try {
      high = await this.waitFor(
        () => this.uniqueHighReasoningOption(),
        "CHAT_CONFIGURATION_REQUIRED",
        "A unique High reasoning option did not appear.",
        Math.min(this.timeoutMs, 3_000),
      );
    } catch (error) {
      if (error instanceof BridgeError && error.code === "DOM_AMBIGUOUS") throw error;
      throw new BridgeError("CHAT_CONFIGURATION_REQUIRED", "App Chat reasoning level must be Medium or High.");
    }
    high.click();
    await this.waitFor(() => {
      const updated = this.uniqueAction(labels.modelSelector, "ChatGPT model selector");
      const label = (updated.textContent ?? "").trim().replace(/\s+/g, " ");
      return allowedReasoningLabels.has(label) ? true : undefined;
    }, "CHAT_CONFIGURATION_REQUIRED", "High reasoning selection could not be verified.", Math.min(this.timeoutMs, 3_000));
  }

  private uniqueHighReasoningOption(): HTMLElement {
    const items = [...this.document.querySelectorAll<HTMLElement>('button,[role="menuitem"],[role="option"],[role="radio"]')]
      .filter((element) => this.isUsable(element))
      .filter((element) => highReasoningOptions.has((element.textContent ?? "").trim().replace(/\s+/g, " ")));
    if (items.length !== 1) {
      throw new BridgeError(items.length === 0 ? "DOM_NOT_FOUND" : "DOM_AMBIGUOUS", "Expected exactly one High reasoning option.");
    }
    return items[0]!;
  }

  private matches(element: HTMLElement, expected: readonly string[]): boolean {
    const values = [element.getAttribute("aria-label"), element.getAttribute("title"), element.textContent?.trim()];
    return values.some((value) => value !== null && value !== undefined && expected.includes(value));
  }

  private isUsable(element: HTMLElement): boolean {
    if (!element.isConnected || element.hidden || element.getAttribute("aria-hidden") === "true"
      || element.closest('[hidden],[aria-hidden="true"]') !== null || element.hasAttribute("disabled")) return false;
    const view = this.document.defaultView;
    if (view !== null) {
      const style = view.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
    }
    return true;
  }

  private async waitFor<T>(probe: () => T | undefined | false, code: string, message: string, timeoutMs = this.timeoutMs): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    let lastError: unknown;
    while (Date.now() <= deadline) {
      try {
        const value = probe();
        if (value !== undefined && value !== false) return value;
      } catch (error) {
        if (error instanceof BridgeError && error.code === "DOM_AMBIGUOUS") throw error;
        lastError = error;
      }
      await new Promise((resolve) => setTimeout(resolve, this.pollMs));
    }
    if (lastError instanceof BridgeError && lastError.code === "DOM_AMBIGUOUS") throw lastError;
    throw new BridgeError(code, message);
  }
}
