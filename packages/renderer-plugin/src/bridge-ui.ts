import type { ChatSettings, ComposerIdentity } from "./chat-configuration.js";
import type { BridgeSession } from "./session.js";
import type { ComposerHandle, LoaderApi } from "./loader-interface.js";
import { menuIcon, modelLabel, mountModelMenu } from "./model-menu.js";
import { bridgeStyle } from "./bridge-style.js";
import { mountContextPresentation } from "./context-presentation.js";

export const DEFAULTS_KEY = "collaboration-defaults-v2";
const errorMessages: Record<string, [string, string]> = {
  APP_UNSUPPORTED: ["Chat 接口不可用。点“诊断”刷新；如果仍失败，请更新 Bridge。", "The Chat interface is unavailable. Refresh diagnostics; update Bridge if it persists."],
  CHAT_MODELS_UNAVAILABLE: ["没有读取到可用模型。点“诊断”刷新模型列表。", "No available models were found. Refresh the model list in diagnostics."],
  CHAT_CONNECT_TIMEOUT: ["连接 Chat 超时。点“诊断”后可安全重试同一请求。", "Connecting to Chat timed out. Refresh diagnostics, then retry the same request."],
  CHAT_READ_TIMEOUT: ["读取回复超时。使用相同 requestId 继续读取，别新建请求。", "Reading the reply timed out. Continue with the same requestId; do not create a new request."],
  SEND_UNCERTAIN: ["发送结果未确认。先用 status 检查；不要重发。", "Delivery is unconfirmed. Check status first; do not resend."],
  SESSION_LOST: ["Bridge 会话已变化，旧请求不能恢复。先检查 Chat 记录，不要重发旧请求。", "The Bridge session changed and the old request cannot be resumed. Check Chat before starting another request."],
  BUDGET_EXHAUSTED: ["已达到本任务请求上限。调整任务限制，或结束当前协作。", "The task request limit was reached. Change its limit or finish this collaboration."],
};

export function bundledSkillDiagnostics(zh = false) {
  return { bundledSkill: "loader-managed-unverified", bundledSkillNote: zh
    ? "随包 skill 由 Loader 管理；此字段不独立核验安装状态，不表示安装失败。"
    : "Bundled skill is managed by Loader; this field does not independently verify installation and is not an installation failure." };
}

/** Native-style defaults page and a separate task-scoped quick selector. */
export class BridgeUi {
  private handle: ComposerHandle | undefined;
  private page: { open?(): Promise<void>; unregister(): void } | undefined;
  private closeQuick: (() => void) | undefined;
  private stopContextPresentation: (() => void) | undefined;
  private readonly timers = new Set<ReturnType<typeof setInterval>>();
  private readonly accessoryUpdates = new Map<string, () => void>();
  private lastError: string | null = null;
  private backgroundError: string | null = null;
  private stopped = false;
  private readonly css: HTMLStyleElement;
  private get zh(): boolean { return /^zh/i.test(this.document.documentElement.lang || navigator.language); }

  constructor(private readonly document: Document, private readonly api: LoaderApi, private readonly control: BridgeSession,
    private readonly refreshModels: () => Promise<void>) {
    this.css = document.createElement("style"); this.css.textContent = bridgeStyle;
  }
  private t(zh: string, en: string): string { return this.zh ? zh : en; }
  private node<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
    const element = this.document.createElement(tag); if (text !== undefined) element.textContent = text; return element;
  }
  private button(text: string, run: () => void | Promise<void>): HTMLButtonElement {
    const button = this.node("button", text); button.type = "button";
    button.addEventListener("click", () => { void Promise.resolve().then(run).catch(error => this.error(error)); });
    return button;
  }
  private error(error: unknown): void {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "BRIDGE_UNAVAILABLE";
    this.lastError = /^[A-Z_]{1,64}$/.test(code) ? code : "BRIDGE_UNAVAILABLE";
    for (const element of this.document.querySelectorAll("[data-bridge-error]")) {
      element.setAttribute("data-bridge-error", this.lastError); element.textContent = this.errorText(this.lastError);
    }
  }
  private errorText(code: string): string { return `${this.t(...errorMessages[code] ?? ["Bridge 出错了。请根据错误码排查。", "Bridge failed. Use the error code to diagnose it."])} (${code})`; }

  start(): void {
    this.document.head.append(this.css);
    this.stopContextPresentation = mountContextPresentation(this.document, this.zh);
    this.page = this.api.settings?.registerPage({ id: "main", title: "Bridge", iconSvg: menuIcon(this.document, "bridge").outerHTML, description: this.t("后台规划与任务执行协作", "Background planning and task execution"), render: root => {
      root.classList.add("bridge-controls"); this.renderDefaults(root);
      return () => { this.closeQuick?.(); root.replaceChildren(); root.classList.remove("bridge-controls", "bridge-settings"); };
    } });
    this.handle = this.api.composer?.registerAccessory({ id: "collaboration", render: (root, owner) => this.renderAccessory(root, owner) });
    this.refreshDiagnostics();
  }
  backgroundChanged(code: string | null, recovering = false): void {
    this.backgroundError = code && /^[A-Z_]{1,64}$/.test(code) ? code : null;
    for (const element of this.document.querySelectorAll("[data-bridge-background]")) element.textContent = this.backgroundError
      ? `${this.errorText(this.backgroundError)}${recovering ? this.t(" · 正在自动恢复连接", " · Reconnecting automatically") : ""}` : "";
    this.refreshDiagnostics();
  }
  private ownsMountedContext(owner: ComposerIdentity): boolean {
    const current = this.handle?.getStatus();
    return !!current?.available && ("draftId" in owner ? current.draftId === owner.draftId : current.hostId === owner.hostId && current.taskId === owner.taskId);
  }
  compatibility() { return { settings: !!this.page, composer: typeof this.handle?.prepareContext === "function", mounted: this.handle?.getStatus().available ?? false, errorCode: this.lastError,
    ...bundledSkillDiagnostics(this.zh) }; }

  private diagnosticsText(): string {
    const state = this.compatibility();
    return `${this.t("插件版本", "Plugin version")}: ${this.api.version} · ${this.t("后台模型目录", "Background catalog")}: ${this.control.configuration.models().length} · ${this.t("输入区接口", "Composer interface")}: ${state.composer ? this.t("可用", "available") : this.t("不可用", "unavailable")} · ${state.bundledSkillNote}`;
  }
  private refreshDiagnostics(): void {
    for (const element of this.document.querySelectorAll("[data-bridge-diagnostics]")) element.textContent = this.diagnosticsText();
  }

  private renderDefaults(root: HTMLElement): void {
    root.classList.add("bridge-settings");
    this.closeQuick?.();
    root.replaceChildren();
    const form = this.settingsForm(this.control.configuration.defaults(), selected => {
      const previous = this.control.configuration.defaults();
      this.control.configuration.saveDefaults(selected);
      try { this.api.storage.set(DEFAULTS_KEY, selected); }
      catch (error) { this.control.configuration.saveDefaults(previous); throw error; }
    });
    const note = this.node("p", this.t("新任务默认关闭协作；请先创建任务，再在该任务的输入区明确开启。", "New tasks start with collaboration off. Create the task first, then explicitly enable Bridge in its composer.")); note.className = "bridge-note";
    root.append(form, note);
    const diagnostics = this.node("p", this.diagnosticsText()); diagnostics.dataset.bridgeDiagnostics = "true";
    const refresh = this.button(this.t("诊断", "Diagnose"), async () => {
      refresh.disabled = true;
      try { await this.refreshModels(); if (root.isConnected) this.renderDefaults(root); }
      finally { refresh.disabled = false; }
    });
    const error = this.node("p", this.lastError ? this.errorText(this.lastError) : ""); error.dataset.bridgeError = this.lastError ?? ""; error.setAttribute("role", "status");
    const background = this.node("p", this.backgroundError ?? ""); background.dataset.bridgeBackground = "true"; background.setAttribute("role", "status");
    const health = this.node("section"); health.className = "bridge-diagnostics";
    const row = this.node("div"); row.className = "bridge-row";
    const copy = this.node("span"); copy.className = "bridge-row-copy";
    const title = this.node("span", this.t("模型与兼容性", "Models and compatibility")); title.className = "bridge-row-title";
    const description = this.node("span", this.t("检查后台连接与模型目录，不发送 Chat 消息。", "Check the background connection and model catalog without sending Chat messages.")); description.className = "bridge-row-description";
    copy.append(title, description); row.append(copy, refresh);
    const group = this.node("div"); group.className = "bridge-group"; group.append(row);
    health.append(this.node("h3", this.t("诊断", "Diagnostics")), group, diagnostics, background, error);
    root.append(health);
  }

  private settingsForm(initial: ChatSettings, save: (value: ChatSettings) => void): HTMLFormElement {
    const form = this.node("form"); const value = { ...initial };
    const status = this.node("p", this.t("更改会自动保存。", "Changes save automatically.")); status.setAttribute("role", "status"); status.className = "bridge-save-status";
    const commit = (patch: Partial<ChatSettings>): boolean => {
      const next = { ...value, ...patch };
      try {
        if (JSON.stringify(next) !== JSON.stringify(value)) save(next);
        Object.assign(value, next);
        status.textContent = this.t("已自动保存；活动协作中的参数不变。", "Saved automatically; active collaboration settings are unchanged.");
        return true;
      } catch (error) {
        this.error(error); status.textContent = `${this.t("未保存", "Not saved")} · ${this.errorText(this.lastError ?? "BRIDGE_UNAVAILABLE")}`;
        return false;
      }
    };
    const group = (title: string): HTMLDivElement => { form.append(this.node("h3", title)); const box = this.node("div"); box.className = "bridge-group"; form.append(box); return box; };
    let section = group(this.t("Chat 协作", "Chat collaboration"));
    const label = (title: string, control: HTMLElement, description?: string): void => {
      const row = this.node("label"); row.className = "bridge-row";
      const copy = this.node("span"); copy.className = "bridge-row-copy";
      const heading = this.node("span", title); heading.className = "bridge-row-title"; copy.append(heading);
      if (description) { const detail = this.node("span", description); detail.className = "bridge-row-description"; copy.append(detail); }
      row.append(copy, control); section.append(row);
    };
    const choice = <T extends string | number>(title: string, options: readonly {value: T; label: string}[], current: () => T, change: (next: T) => void): HTMLButtonElement => {
      const trigger = this.button("", () => {
        const popup = this.openPopup(trigger, title); if (!popup) return;
        popup.panel.classList.add("bridge-choice-popup");
        const menu = this.node("div"); menu.setAttribute("role", "menu"); menu.setAttribute("aria-label", title); popup.panel.append(menu);
        const rows = options.map(option => {
          const row = this.button("", () => { change(option.value); update(); popup.close(); trigger.focus({preventScroll:true}); });
          row.className = "bridge-model-row"; row.setAttribute("role", "menuitemradio"); row.setAttribute("aria-checked", String(current() === option.value));
          row.append(this.node("span", option.label)); if (current() === option.value) row.append(menuIcon(this.document, "check"));
          menu.append(row); return row;
        });
        menu.addEventListener("keydown", event => {
          if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const index = rows.indexOf(this.document.activeElement as HTMLButtonElement);
          const next = event.key === "Home" ? 0 : event.key === "End" ? rows.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length;
          rows[next]?.focus();
        });
        popup.position(); (rows.find(row => row.getAttribute("aria-checked") === "true") ?? rows[0])?.focus();
      });
      trigger.className = "bridge-preset-trigger bridge-choice-trigger";
      trigger.setAttribute("aria-label", title); trigger.setAttribute("aria-haspopup", "dialog"); trigger.setAttribute("aria-expanded", "false");
      const update = (): void => { trigger.replaceChildren(this.node("span", options.find(option => option.value === current())!.label), menuIcon(this.document, "next")); };
      update(); return trigger;
    };
    const picker = this.button("", () => {
      const popup = this.openPopup(picker, this.t("默认 Chat 模型", "Default Chat model"));
      if (!popup) return;
      const models = this.control.configuration.models();
      popup.cleanup(mountModelMenu(popup.panel, models, () => value.modelKey,
        () => models.find(model => model.key === value.modelKey),
        model => { commit({ modelKey: model.key }); updatePicker(); }, popup.close, this.zh));
      popup.position(); popup.panel.querySelector<HTMLButtonElement>("button")?.focus();
    });
    picker.className = "bridge-preset-trigger"; picker.setAttribute("aria-haspopup", "dialog"); picker.setAttribute("aria-expanded", "false");
    const updatePicker = (): void => {
      const selected = this.control.configuration.models().find(model => model.key === value.modelKey);
      picker.replaceChildren(this.node("span", selected ? modelLabel(selected) : this.t("选择模型", "Choose model")), menuIcon(this.document, "next"));
    };
    updatePicker();
    label(this.t("默认模型与思考程度", "Default model and thinking level"), picker, this.t("任务切换模型时，优先使用此档位；不支持时匹配最接近的可用值。", "Task model changes use this level, or the closest supported level."));
    const warning = this.node("p", this.t("Pro 仅在明确选择或继承已保存的 Pro 默认值时使用。不会自动替换失效模型。", "Pro is opt-in, including saved Pro defaults. Unavailable models are never substituted.")); warning.className = "bridge-note"; form.append(warning);
    section = group(this.t("可选限制", "Optional limits"));
    const rounds = this.node("input"); rounds.type = "number"; rounds.min = "1"; rounds.step = "1"; rounds.value = value.maxRequests === null ? "" : String(value.maxRequests); rounds.placeholder = this.t("不限", "None");
    const numeric = (input: HTMLInputElement, field: "maxRequests" | "replyTimeoutMinutes"): void => {
      const change = (): void => {
        const valid = !input.validity.badInput && (input.value === "" || Number.isSafeInteger(Number(input.value)) && input.checkValidity());
        if (!valid) { input.setAttribute("aria-invalid", "true"); status.textContent = this.t("未保存：请输入范围内的整数。", "Not saved: enter a whole number within the allowed range."); return; }
        input.removeAttribute("aria-invalid"); commit({ [field]: input.value === "" ? null : Number(input.value) });
      };
      input.oninput = change; input.onchange = change;
    };
    numeric(rounds, "maxRequests"); label(this.t("总请求上限", "Total request limit"), rounds, this.t("留空则持续推进到任务完成。设置上限时，结果反馈和最终验收也计入。", "Leave empty to work until completion. An optional cap includes feedback and final verification."));
    const total = this.node("input"); total.type = "number"; total.min = "1"; total.step = "1"; total.value = value.replyTimeoutMinutes === null ? "" : String(value.replyTimeoutMinutes); total.placeholder = this.t("不限", "None");
    numeric(total, "replyTimeoutMinutes"); label(this.t("回复硬超时（分钟）", "Hard reply timeout (minutes)"), total, this.t("留空则长时间等待仅提醒；设置后到期需要明确继续。", "Leave empty for a long-wait notice only; an explicit timeout pauses for consent."));
    section = group(this.t("会话处理", "Conversation handling"));
    const cleanupTitle = this.t("正常结束后的会话处理", "Conversation policy after verified completion");
    label(cleanupTitle, choice(cleanupTitle, [{value:"delete",label:this.t("删除", "Delete")}, {value:"archive",label:this.t("归档", "Archive")}, {value:"retain",label:this.t("保留", "Retain")}] as const, () => value.cleanup, cleanup => { commit({cleanup}); }));
    form.append(status);
    form.onsubmit = event => { event.preventDefault(); };
    return form;
  }

  private renderAccessory(root: HTMLElement, owner: ComposerIdentity): () => void {
    root.classList.add("bridge-controls");
    const taskKey = JSON.stringify(owner);
    let contextAttempted = false;
    const button = this.button("Bridge", () => {
      if (["idle", "missing-or-edited"].includes(this.handle?.getStatus().context?.state ?? "idle")) contextAttempted = false;
      this.accessoryUpdates.get(taskKey)?.(); this.openTask(owner, button);
    }); button.className = "bridge-compact";
    button.setAttribute("aria-haspopup", "dialog"); button.setAttribute("aria-expanded", "false"); root.append(button);
    const update = (): void => {
      if (this.stopped || !root.isConnected) return;
      if (typeof this.handle?.prepareContext !== "function") {
        button.textContent = this.t("Bridge：输入区接口不可用", "Bridge: composer unavailable");
        button.title = button.textContent; return;
      }
      const settings = this.control.configuration.task(owner);
      const status = "draftId" in owner ? null : this.control.status({ task: owner });
      const active = status?.active;
      const selected = this.control.configuration.models().find(model => model.key === settings.modelKey);
      const model = active?.config.model ?? selected;
      const name = model ? modelLabel(model) : this.t("未选模型", "Choose model");
      const state = active?.state ?? status?.error?.code ?? (settings.enabled ? name : this.t("Chat 协作：关", "Chat: off"));
      button.textContent = active ? `${state} · ${name}` : state;
      button.title = button.textContent;
      const activeOwner = "draftId" in owner ? undefined : { hostId: owner.hostId, taskId: owner.taskId };
      const context = this.handle?.getStatus().context;
      if (!settings.enabled) {
        contextAttempted = false;
        if (context?.state === "prepared") this.handle.clearContext();
      }
      if (settings.enabled && activeOwner && model && !contextAttempted && context?.state !== "prepared") {
        contextAttempted = true;
        try {
          this.handle.prepareContext({ ...activeOwner, revision: "bridge-enabled", text: this.t(
            "当前任务已启用 Bridge。使用随包 bridge-chat skill。Chat 提供建议，Codex 审查并执行；按现有权限操作。用 status 读取任务、模型和会话状态。",
            "Bridge is enabled for this task. Use the bundled bridge-chat skill. Chat advises; Codex reviews and executes under existing permissions. Read task, model and session state with status.") });
          this.lastError = null;
        } catch (error) { this.error(error); }
      }
    };
    // Loader can call render synchronously before returning its handle.
    this.accessoryUpdates.set(taskKey, update);
    queueMicrotask(update);
    const timer = setInterval(update, 1000); this.timers.add(timer);
    return () => { this.accessoryUpdates.delete(taskKey); this.closeQuick?.(); clearInterval(timer); this.timers.delete(timer); root.replaceChildren(); root.classList.remove("bridge-controls"); };
  }
  private openPopup(anchor: HTMLButtonElement, title: string, available: () => boolean = () => true) {
    const wasOpen = anchor.getAttribute("aria-expanded") === "true";
    this.closeQuick?.();
    if (wasOpen || !available()) return null;
    const panel = this.node("div"); panel.className = "bridge-controls bridge-popover";
    panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", title);
    anchor.setAttribute("aria-expanded", "true");
    const view = this.document.defaultView!;
    const cleanups: Array<() => void> = [];
    const close = (): void => {
      for (const cleanup of cleanups.splice(0)) cleanup();
      panel.remove(); anchor.setAttribute("aria-expanded", "false");
      this.document.removeEventListener("pointerdown", outside, true);
      this.document.removeEventListener("keydown", keydown);
      this.document.removeEventListener("focusin", focusout);
      view.removeEventListener("resize", position); view.removeEventListener("scroll", position, true);
      if (this.closeQuick === close) this.closeQuick = undefined;
    };
    const outside = (event: Event): void => { if (!event.composedPath().includes(panel) && !event.composedPath().includes(anchor)) close(); };
    const keydown = (event: KeyboardEvent): void => { if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); close(); anchor.focus(); } };
    const focusout = (event: Event): void => { if (!event.composedPath().includes(panel) && event.target !== anchor) close(); };
    const position = (): void => {
      if (!anchor.isConnected || !available()) { close(); return; }
      const rect = anchor.getBoundingClientRect(), box = panel.getBoundingClientRect();
      panel.style.left = `${Math.max(8, Math.min(rect.left, view.innerWidth - box.width - 8))}px`;
      const top = rect.top - box.height - 8;
      panel.style.top = `${Math.max(8, Math.min(top >= 8 ? top : rect.bottom + 8, view.innerHeight - box.height - 8))}px`;
    };
    this.closeQuick = close;
    this.document.body.append(panel);
    this.document.addEventListener("pointerdown", outside, true); this.document.addEventListener("keydown", keydown); this.document.addEventListener("focusin", focusout);
    view.addEventListener("resize", position); view.addEventListener("scroll", position, true);
    return { panel, close, position, cleanup: (run: () => void) => cleanups.push(run) };
  }
  private openTask(owner: ComposerIdentity, anchor: HTMLButtonElement): void {
    const popup = this.openPopup(anchor, this.t("当前任务 Chat 协作", "Chat collaboration for this task"), () => this.ownsMountedContext(owner));
    if (!popup) return;
    const { panel, close, position } = popup;
    const row = (text: string, control: HTMLElement): void => { const label = this.node("label"); label.className = "bridge-quick-row"; label.append(this.node("span", text), control); panel.append(label); };
    const value = { ...this.control.configuration.task(owner) };
    const status = "draftId" in owner ? null : this.control.status({ task: owner });
    const active = status?.active ?? null;
    const apply = (): void => {
      if (!this.ownsMountedContext(owner)) { close(); return; }
      try {
        this.control.updateTask(owner, value);
        Object.assign(value, this.control.configuration.task(owner));
        if (!value.enabled && this.handle?.getStatus().context?.state === "prepared") this.handle.clearContext();
        this.accessoryUpdates.get(JSON.stringify(owner))?.();
      }
      catch (error) { this.error(error); throw error; }
    };
    const enabled = this.node("input"); enabled.type = "checkbox"; enabled.setAttribute("role", "switch"); enabled.checked = value.enabled;
    enabled.disabled = "draftId" in owner || !this.control.configuration.models().some(model => model.key === value.modelKey);
    enabled.onchange = () => {
      if (enabled.disabled) return;
      value.enabled = enabled.checked; apply(); close();
    };
    row(this.t("本任务 Chat 协作", "Enable Bridge for this task"), enabled);
    if (enabled.disabled) {
      const note = this.node("p", this.t("draftId" in owner ? "请先创建任务，再为该任务开启 Bridge。" : "请先选择可用的 Chat 模型。",
        "draftId" in owner ? "Create the task first, then enable Bridge for it." : "Choose an available Chat model first."));
      note.className = "bridge-note"; panel.append(note);
    }
    const models = this.control.configuration.models();
    const heading = this.node("div", this.t("Chat 模型", "Chat model")); heading.className = "bridge-menu-heading"; panel.append(heading);
    popup.cleanup(mountModelMenu(panel, models, () => value.modelKey,
      () => models.find(model => model.key === value.modelKey),
      model => { value.modelKey = model.key; apply(); }, close, this.zh));
    const divider = this.node("div"); divider.className = "bridge-quick-divider"; panel.append(divider);
    panel.append(this.button(this.t("恢复默认", "Reset defaults"), () => {
      if (!this.ownsMountedContext(owner)) { close(); return; }
      this.control.restoreDefaults(owner); close(); this.openTask(owner, anchor);
    }), this.button(this.t("Bridge 设置", "Bridge settings"), async () => {
      if (!this.page?.open) { this.error({ code: "SETTINGS_NAVIGATION_UNAVAILABLE" }); return; }
      try { await this.page.open(); close(); }
      catch (error) { this.error(error); }
    }));
    if (active && !("draftId" in owner)) {
      const lines = [this.t(`${active.state} · 已发送 ${active.usedRequests} 个请求`, `${active.state} · ${active.usedRequests} requests sent`)];
      if (active.requestId) lines.push(active.requestId);
      if (active.elapsedMs !== undefined) lines.push(`${Math.round(active.elapsedMs / 1000)} s`);
      if (active.allowedMs !== undefined) lines.push(active.allowedMs === null ? this.t("无硬超时", "No hard timeout") : `${Math.round(active.allowedMs / 1000)} s`);
      if (active.cleanupReason) lines.push(active.cleanupReason);
      const state = this.node("p", lines.join(" · ")); state.className = "bridge-quick-state"; panel.append(state);
      if (active.state === "paused") panel.append(this.button(this.t("继续等待", "Continue waiting"), () => {
        if (!this.ownsMountedContext(owner)) { close(); return; }
        this.control.continueAfterTimeout(owner, active.sessionId); close();
      }));
      if (active.maxRequests !== null && active.usedRequests >= active.maxRequests && !active.busy && !active.requestId) panel.append(this.button(this.t("取消请求上限", "Remove request limit"), () => {
        if (!this.ownsMountedContext(owner)) { close(); return; }
        this.control.removeRequestLimit(owner, active.sessionId); close();
      }));
      if (active.state === "failed" || active.state === "ending") panel.append(this.button(this.t("保留 Chat 并结束 Bridge", "Keep Chat and end Bridge"), async () => {
        if (!this.ownsMountedContext(owner)) { close(); return; }
        await this.control.finish({ task: owner, sessionId: active.sessionId, reason: "user-request", policy: "retain" });
        close();
      }));
    }
    if (status?.error) {
      const detail = this.node("p", this.errorText(status.error.code)); detail.className = "bridge-quick-state"; detail.setAttribute("role", "status"); panel.append(detail);
    }
    const error = this.node("p", this.lastError ? this.errorText(this.lastError) : ""); error.dataset.bridgeError = this.lastError ?? ""; error.className = "bridge-quick-state"; error.setAttribute("role", "status"); panel.append(error);
    position();
    enabled.focus({ preventScroll: true });
  }
  stop(): void {
    this.stopped = true; this.closeQuick?.(); this.handle?.unregister(); this.page?.unregister();
    this.stopContextPresentation?.(); this.stopContextPresentation = undefined;
    for (const timer of this.timers) clearInterval(timer); this.timers.clear();
    this.accessoryUpdates.clear(); this.css.remove();
  }
}
