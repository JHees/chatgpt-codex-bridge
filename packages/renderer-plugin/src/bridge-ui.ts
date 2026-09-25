import type { ChatSettings, ComposerIdentity, PreparedConfiguration } from "./chat-configuration.js";
import type { CooperationController } from "./cooperation-controller.js";
import type { ComposerHandle, LoaderApi } from "./loader-interface.js";
import { menuIcon, mountModelMenu } from "./model-menu.js";
import { bridgeStyle } from "./bridge-style.js";
import { mountContextPresentation } from "./context-presentation.js";

export const DEFAULTS_KEY = "collaboration-defaults-v2";

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
  private readonly prepared = new Map<string, { bindingId: string; config: Readonly<PreparedConfiguration> }>();
  private readonly blockedPreparation = new Set<string>();
  private lastError: string | null = null;
  private backgroundError: string | null = null;
  private stopped = false;
  private readonly css: HTMLStyleElement;
  private readonly zh: boolean;

  constructor(private readonly document: Document, private readonly api: LoaderApi, private readonly control: CooperationController,
    private readonly refreshModels: () => Promise<void>) {
    this.zh = /^zh/i.test(document.documentElement.lang || navigator.language);
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
    for (const element of this.document.querySelectorAll("[data-bridge-error]")) element.textContent = this.lastError;
  }

  start(): void {
    this.document.head.append(this.css);
    this.stopContextPresentation = mountContextPresentation(this.document, this.zh);
    this.page = this.api.settings?.registerPage({ id: "main", title: "Bridge", description: this.t("后台规划与任务执行协作", "Background planning and task execution"), render: root => {
      root.classList.add("bridge-controls"); this.renderDefaults(root);
      return () => { this.closeQuick?.(); root.replaceChildren(); root.classList.remove("bridge-controls", "bridge-settings"); };
    } });
    this.handle = this.api.composer?.registerAccessory({ id: "collaboration", render: (root, owner) => this.renderAccessory(root, owner),
      onChange: event => {
        if (this.stopped || event.target !== "context" || event.action !== "removed" || !this.ownsMountedContext(event.identity)) return;
        this.control.setEnabled(event.identity, false);
        const key = JSON.stringify(event.identity);
        this.prepared.delete(key); this.blockedPreparation.delete(key); this.closeQuick?.(); this.accessoryUpdates.get(key)?.();
      },
    });
    this.refreshDiagnostics();
  }
  receipt(bindingId: string): unknown { return this.handle?.getSubmission?.(bindingId) ?? { state: "unavailable" }; }
  backgroundChanged(code: string | null, recovering = false): void {
    this.backgroundError = code && /^[A-Z_]{1,64}$/.test(code) ? code : null;
    for (const element of this.document.querySelectorAll("[data-bridge-background]")) element.textContent = this.backgroundError
      ? `${this.backgroundError}${recovering ? this.t(" · 正在自动恢复连接", " · Reconnecting automatically") : ""}` : "";
    this.refreshDiagnostics();
  }
  private ownsMountedContext(owner: ComposerIdentity): boolean {
    const current = this.handle?.getStatus();
    return !!current?.available && ("draftId" in owner ? current.draftId === owner.draftId : current.hostId === owner.hostId && current.taskId === owner.taskId);
  }
  compatibility() { return { settings: !!this.page, composer: typeof this.handle?.prepareSubmission === "function", mounted: this.handle?.getStatus().available ?? false, contextPresentation: this.handle?.getStatus().context?.display ?? "text", errorCode: this.lastError,
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
    const note = this.node("p", this.t("默认值用于新任务；已有任务记住自己的开关和模型选择。重载仅恢复偏好，不恢复或重发协作请求。", "Defaults apply to new tasks; existing tasks remember their switches and model choices. Reload restores preferences, not collaboration requests.")); note.className = "bridge-note";
    root.append(form, note);
    const diagnostics = this.node("p", this.diagnosticsText()); diagnostics.dataset.bridgeDiagnostics = "true";
    const refresh = this.button(this.t("诊断", "Diagnose"), async () => {
      refresh.disabled = true;
      try { await this.refreshModels(); if (root.isConnected) this.renderDefaults(root); }
      finally { refresh.disabled = false; }
    });
    const error = this.node("p", this.lastError ?? ""); error.dataset.bridgeError = "true"; error.setAttribute("role", "status");
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
        this.error(error); status.textContent = `${this.t("未保存", "Not saved")} · ${this.lastError}`;
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
    const enabled = this.node("input"); enabled.type = "checkbox"; enabled.setAttribute("role", "switch"); enabled.checked = value.enabled;
    enabled.onchange = () => { if (!commit({ enabled: enabled.checked })) enabled.checked = value.enabled; };
    label(this.t("新任务默认启用", "Enable for new tasks"), enabled, this.t("由 Chat 规划，当前 Codex 执行与验证。", "Chat plans; the current Codex task executes and verifies."));
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
      picker.replaceChildren(this.node("span", selected ? `${selected.groupTitle ?? selected.title} · ${selected.effortLabel}` : this.t("选择模型", "Choose model")), menuIcon(this.document, "next"));
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
    const key = JSON.stringify(owner);
    const button = this.button("Bridge", () => this.openTask(owner, button)); button.className = "bridge-compact";
    button.setAttribute("aria-haspopup", "dialog"); button.setAttribute("aria-expanded", "false"); root.append(button);
    const update = (): void => {
      if (this.stopped || !root.isConnected) return;
      if (typeof this.handle?.prepareSubmission !== "function") {
        button.textContent = this.t("Bridge：需要兼容的 Loader 输入区接口", "Bridge: compatible Loader composer required");
        button.title = button.textContent; return;
      }
      const settings = this.control.configuration.task(owner);
      const status = "draftId" in owner ? null : this.control.status({ task: owner });
      const active = status?.active;
      const selected = this.control.configuration.models().find(model => model.key === settings.modelKey);
      const name = active ? `${active.config.model.title} · ${active.config.model.mode}` : selected ? `${selected.title} · ${selected.mode}` : this.t("未选模型", "Choose model");
      const clock = (ms: number): string => `${String(Math.floor(ms / 60000)).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
      const waiting = active?.state === "waiting" || active?.state === "paused";
      button.textContent = active ? `${this.stateLabel(active.state)} · ${name}${waiting ? ` · ${clock(active.elapsedMs ?? 0)}${active.allowedMs == null ? "" : ` / ${clock(active.allowedMs)}`}` : ""}` : `${this.t("Chat 协作", "Chat collaboration")}: ${settings.enabled ? this.t("开", "on") : this.t("关", "off")}${settings.enabled ? ` · ${name} · ${selected?.effortLabel ?? "—"}` : ""}`;
      if (!active && settings.enabled && status?.connection) button.textContent = `${this.t("等待 Codex 接入", "Waiting for Codex to connect")} · ${name}`;
      if (this.blockedPreparation.has(key)) button.textContent = this.t("旧协作说明需重新准备", "Saved collaboration instructions need renewal");
      // Keep the user's explicit Pro choice visible even when model details truncate.
      if ((active?.config.model.mode ?? (settings.enabled ? selected?.mode : undefined)) === "pro") button.textContent = `Pro · ${button.textContent}`;
      button.title = button.textContent;
      const prepared = this.prepared.get(key);
      // Do not re-add a removed/edited instruction. Only a positively accepted submission ends this preparation.
      if (prepared && (this.receipt(prepared.bindingId) as { state?: string }).state === "accepted") this.prepared.delete(key);
      if (settings.enabled && settings.modelKey !== null && !this.prepared.has(key) && !this.blockedPreparation.has(key) && !active && typeof this.handle?.prepareSubmission === "function") {
        try { this.prepare(owner); } catch (error) { this.error(error); }
      }
    };
    // Loader can call render synchronously before returning its handle.
    this.accessoryUpdates.set(key, update);
    queueMicrotask(update);
    const timer = setInterval(update, 1000); this.timers.add(timer);
    return () => { this.accessoryUpdates.delete(key); this.blockedPreparation.delete(key); this.closeQuick?.(); clearInterval(timer); this.timers.delete(timer); root.replaceChildren(); root.classList.remove("bridge-controls"); };
  }
  private stateLabel(state: string): string {
    if (state === "ending") return this.t("正在结束协作", "Ending collaboration");
    if (state === "repair-required") return this.t("等待 Codex 续读修复回复", "Waiting for Codex to continue repair");
    if (state === "awaiting-verification") return this.t("Chat 已回复 · 待 Codex 核对", "Chat replied · Codex review pending");
    if (state === "actions-returned") return this.t("Chat 已回复 · 待 Codex 处理", "Chat replied · Codex action pending");
    const labels: Record<string, [string, string]> = { "waiting": ["正在等待 Chat", "Waiting for Chat"], "paused": ["等待你确认", "Waiting for confirmation"], "needs-user": ["等待你确认", "Waiting for confirmation"], "cleanup-failed": ["会话清理失败", "Cleanup failed"], "failed": ["协作已停止", "Collaboration stopped"] };
    const label = labels[state]; return label ? this.t(...label) : this.t("协作已接入", "Collaboration connected");
  }
  private prepare(owner: ComposerIdentity): void {
    const config = this.control.prepare(owner, `snapshot-${crypto.randomUUID()}`);
    const text = this.t(
      `使用随包 bridge-chat skill 协作：Chat 负责技术决策和验收，Codex 审核后执行并回报证据；沿用现有权限，接入失败时暂停。Chat ${config.model.title} · ${config.model.mode} · ${config.model.effortLabel}。配置 ${config.id}；其余参数由 status 读取。`,
      `Use the bundled bridge-chat skill: Chat leads decisions and verification; Codex reviews, executes and reports evidence under existing permissions. Pause if connection fails. Chat ${config.model.title} · ${config.model.mode} · ${config.model.effortLabel}. Configuration ${config.id}; read remaining parameters with status.`);
    const summary = this.handle?.getStatus().contextDisplay === "collapsed-v1" ? this.t("Chat 协作", "Chat collaboration") + ` · ${config.model.title} · ${config.model.effortLabel}` : undefined;
    let receipt;
    try { receipt = this.handle!.prepareSubmission({ ...owner, revision: config.id, text, ...(summary ? {summary} : {}) }); }
    catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "CONTEXT_EXISTS") this.blockedPreparation.add(JSON.stringify(owner));
      throw error;
    }
    this.control.register(receipt.bindingId, owner, config);
    this.prepared.set(JSON.stringify(owner), { bindingId: receipt.bindingId, config });
    this.lastError = null;
    for (const element of this.document.querySelectorAll("[data-bridge-error]")) element.textContent = "";
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
    const active = "draftId" in owner ? null : this.control.status({ task: owner }).active;
    const apply = (): void => {
      if (!this.ownsMountedContext(owner)) { close(); return; }
      try {
        this.control.configuration.updateTask(owner, value); this.control.setEnabled(owner, value.enabled);
        this.handle?.clearContext(); this.prepared.delete(JSON.stringify(owner)); this.blockedPreparation.delete(JSON.stringify(owner));
        if (value.enabled && value.modelKey !== null && !active) this.prepare(owner);
      } catch (error) { this.error(error); }
    };
    const enabled = this.node("input"); enabled.type = "checkbox"; enabled.setAttribute("role", "switch"); enabled.checked = value.enabled;
    enabled.onchange = () => { value.enabled = enabled.checked; apply(); };
    row(this.t("Chat 协作", "Chat collaboration"), enabled);
    const models = this.control.configuration.models();
    const heading = this.node("div", this.t("规划模型", "Planning model")); heading.className = "bridge-menu-heading"; panel.append(heading);
    popup.cleanup(mountModelMenu(panel, models, () => value.modelKey,
      () => models.find(model => model.key === this.control.configuration.defaults().modelKey) ?? models.find(model => model.key === value.modelKey),
      model => { value.modelKey = model.key; apply(); }, close, this.zh));
    const divider = this.node("div"); divider.className = "bridge-quick-divider"; panel.append(divider);
    const footer = this.node("div"); footer.className = "bridge-quick-footer";
    footer.append(this.button(this.t("恢复默认", "Reset defaults"), () => {
      if (!this.ownsMountedContext(owner)) { close(); return; }
      Object.assign(value, this.control.configuration.defaults()); apply(); close(); this.openTask(owner, anchor);
    }), this.button(this.t("Bridge 设置", "Bridge settings"), async () => {
      if (!this.page?.open) { this.error({ code: "SETTINGS_NAVIGATION_UNAVAILABLE" }); return; }
      try { await this.page.open(); close(); }
      catch (error) { this.error(error); }
    }));
    panel.append(footer);
    if (this.blockedPreparation.has(JSON.stringify(owner)) && !active) {
      panel.append(this.node("p", this.t("草稿中的旧说明未被改写。重新准备只替换 Bridge 说明，其余草稿保持原样。", "Saved instructions were left untouched. Preparing fresh instructions replaces only the Bridge block.")),
        this.button(this.t("重新准备协作说明", "Prepare fresh collaboration instructions"), () => { apply(); close(); }));
    }
    let stateNode: HTMLParagraphElement | undefined;
    const consentButtons = new Map<string, HTMLButtonElement>();
    if (!("draftId" in owner)) {
      const diagnostics = this.node("p"); diagnostics.className = "bridge-quick-state"; diagnostics.setAttribute("role", "status"); panel.append(diagnostics);
      diagnostics.style.whiteSpace = "pre-line";
      const update = (): void => {
        if (!this.ownsMountedContext(owner)) { close(); return; }
        const current = this.control.status({ task: owner }), lines: string[] = [];
        // Session-bound controls must not outlive their owner or target a replacement session.
        if (current.active?.sessionId !== active?.sessionId) { close(); return; }
        if (current.active) {
          if (stateNode) stateNode.textContent = `${this.stateLabel(current.active.state)} · ${this.t("已发送请求", "Requests sent")}: ${current.active.usedRequests}`;
          for (const [action, button] of consentButtons) button.hidden = action === "remove-request-limit"
            ? current.active.maxRequests === null || current.active.busy || current.active.turnId !== undefined
            : current.active.state !== "paused";
          lines.push(current.active.remainingRequests === null ? this.t("自动推进到任务完成", "Working until task completion") : `${this.t("剩余请求", "Remaining requests")}: ${current.active.remainingRequests} · ${this.t("最终反馈计入上限", "Final feedback counts toward the limit")}`);
          if (current.active.longWait && current.active.state === "waiting") lines.push(this.t("等待较久，尚未收到可验证回复；可以随时停止。", "Long wait: no verified reply yet. You can stop at any time."));
          if (current.active.state === "needs-user") lines.push(this.t("请在当前任务中回答问题，Codex 会回传答案。", "Reply in the current task; Codex will return your answer."));
        }
        if (current.lastReply) {
          const { elapsedMs, repairCount, round } = current.lastReply;
          lines.push(this.t(`最近回复：${(elapsedMs / 1000).toFixed(1)} 秒 · 格式修复 ${repairCount} 次 · 第 ${round} 次请求`, `Last reply: ${(elapsedMs / 1000).toFixed(1)} s · ${repairCount} format repairs · request ${round}`));
        }
        diagnostics.textContent = lines.join("\n"); diagnostics.hidden = lines.length === 0;
        position();
      };
      update();
      const timer = setInterval(update, 1000); popup.cleanup(() => clearInterval(timer));
    }
    if (!active && value.enabled && !("draftId" in owner) && this.control.status({task:owner}).connection) {
      const pending = this.node("p", this.t("说明已提交，尚未启动 Chat。请查看 Codex 的工具授权或错误；接入失败时应暂停，不能当作协作完成。", "Instructions submitted. No Chat has started. Check Codex tool approvals or errors; stop if connection fails."));
      pending.className = "bridge-quick-state"; pending.setAttribute("role", "status"); panel.append(pending);
    }
    if (active && !("draftId" in owner)) {
      const state = this.node("p", `${this.stateLabel(active.state)} · ${this.t("已发送请求", "Requests sent")}: ${active.usedRequests}`); state.className = "bridge-quick-state"; panel.append(state);
      stateNode = state;
      for (const code of [active.cleanupReason, active.titleError]) if (code) {
        const detail=this.node("p",code); detail.className="bridge-quick-state"; detail.setAttribute("role","status"); panel.append(detail);
      }
      if (active.state === "repair-required") {
        const repair = this.node("p", this.t("Chat 已回复，但格式需要一次修复。Codex 应续读同一请求，不是重新提交任务。", "Chat replied, but its format needs one repair. Codex should continue the same request, not resubmit the task."));
        repair.className = "bridge-quick-state"; repair.setAttribute("role", "status"); panel.append(repair);
      }
      const details = this.node("details"), actions = this.node("div"); actions.className = "bridge-actions";
      details.append(this.node("summary", this.t("管理当前协作", "Manage collaboration")), actions); panel.append(details);
      details.addEventListener("toggle", position);
      const add = (label: string, action: "remove-request-limit" | "continue-waiting", available: boolean): void => {
        const button = this.button(label, () => { this.control.consent(owner, active.sessionId, action); close(); });
        button.hidden = !available; consentButtons.set(action, button); actions.append(button);
      };
      add(this.t("取消本次请求上限", "Remove this session's request limit"), "remove-request-limit", active.maxRequests !== null && !active.busy && active.turnId === undefined);
      add(this.t("继续等待", "Continue waiting"), "continue-waiting", active.state === "paused");
      for (const policy of ["retain", "archive", "delete"] as const) {
        const labels = {retain:this.t("结束并保留", "End and retain"),archive:this.t("结束并归档", "End and archive"),delete:this.t("结束并删除", "End and delete")};
        actions.append(this.button(labels[policy], async () => {
          for (const button of actions.querySelectorAll("button")) button.disabled = true;
          state.textContent = this.t("正在结束协作…", "Ending collaboration…");
          try { await this.control.endFromUi({ task: owner, sessionId: active.sessionId, policy }); if (this.ownsMountedContext(owner)) this.handle?.clearContext(); close(); }
          catch (error) {
            const current = this.control.status({task:owner}).active;
            state.textContent = current?.cleanupReason === "CLEANUP_UNSAFE"
              ? this.t("Chat 仍在生成或归属尚未确认；完成后可重试，也可结束并保留。", "Chat is still generating or ownership is unconfirmed. Retry after completion, or end and retain.")
              : this.t("结束未完成，可以重试或保留会话。", "Ending did not complete. Retry or retain the conversation.");
            throw error;
          } finally { for (const button of actions.querySelectorAll("button")) button.disabled = false; }
        }));
      }
    }
    if (!("draftId" in owner)) for (const cleanup of this.control.status({task:owner}).pendingCleanup) {
      const box = this.node("div"); box.className = "bridge-quick-state";
      box.append(this.node("p", this.t("任务已完成，Chat 清理待处理", "Task completed; Chat cleanup pending") + ` · ${cleanup.reason ?? "CLEANUP_FAILED"}`));
      for (const policy of [cleanup.policy, "retain"] as const) box.append(this.button(policy === "retain" ? this.t("保留 Chat", "Retain Chat") : this.t("重试清理", "Retry cleanup"), async () => {
        await this.control.finish({task:owner,sessionId:cleanup.sessionId,policy}); close();
      }));
      panel.append(box);
    }
    const error = this.node("p", this.lastError ?? ""); error.dataset.bridgeError = "true"; error.className = "bridge-quick-state"; error.setAttribute("role", "status"); panel.append(error);
    position();
    enabled.focus({ preventScroll: true });
  }
  stop(): void {
    this.stopped = true; this.closeQuick?.(); this.handle?.unregister(); this.page?.unregister();
    this.stopContextPresentation?.(); this.stopContextPresentation = undefined;
    for (const timer of this.timers) clearInterval(timer); this.timers.clear();
    this.prepared.clear(); this.blockedPreparation.clear(); this.accessoryUpdates.clear(); this.css.remove();
  }
}
