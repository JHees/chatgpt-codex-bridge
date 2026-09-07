import type { ChatSettings, ComposerIdentity, PreparedConfiguration } from "./chat-configuration.js";
import type { CooperationController } from "./cooperation-controller.js";
import type { ComposerHandle, LoaderApi } from "./loader-interface.js";
import { menuIcon, mountModelMenu } from "./model-menu.js";
import { bridgeStyle } from "./bridge-style.js";

export const DEFAULTS_KEY = "collaboration-defaults-v1";

/** Native-style defaults page and a separate task-scoped quick selector. */
export class BridgeUi {
  private handle: ComposerHandle | undefined;
  private page: { open?(): Promise<void>; unregister(): void } | undefined;
  private closeQuick: (() => void) | undefined;
  private readonly timers = new Set<ReturnType<typeof setInterval>>();
  private readonly prepared = new Map<string, { bindingId: string; config: Readonly<PreparedConfiguration> }>();
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
    this.page = this.api.settings?.registerPage({ id: "main", title: "Bridge", description: this.t("后台规划与任务执行协作", "Background planning and task execution"), render: root => {
      root.classList.add("bridge-controls"); this.renderDefaults(root);
      return () => { this.closeQuick?.(); root.replaceChildren(); root.classList.remove("bridge-controls", "bridge-settings"); };
    } });
    this.handle = this.api.composer?.registerAccessory({ id: "collaboration", render: (root, owner) => this.renderAccessory(root, owner) });
    this.refreshDiagnostics();
  }
  receipt(bindingId: string): unknown { return this.handle?.getSubmission?.(bindingId) ?? { state: "unavailable" }; }
  backgroundChanged(code: string | null): void {
    this.backgroundError = code && /^[A-Z_]{1,64}$/.test(code) ? code : null;
    for (const element of this.document.querySelectorAll("[data-bridge-background]")) element.textContent = this.backgroundError ?? "";
    this.refreshDiagnostics();
  }
  private ownsMountedContext(owner: ComposerIdentity): boolean {
    const current = this.handle?.getStatus();
    return !!current?.available && ("draftId" in owner ? current.draftId === owner.draftId : current.hostId === owner.hostId && current.taskId === owner.taskId);
  }
  compatibility() { return { settings: !!this.page, composer: typeof this.handle?.prepareSubmission === "function", mounted: this.handle?.getStatus().available ?? false, errorCode: this.lastError }; }

  private diagnosticsText(): string {
    const state = this.compatibility();
    return `${this.t("插件版本", "Plugin version")}: ${this.api.version} · ${this.t("后台模型目录", "Background catalog")}: ${this.control.configuration.models().length} · ${this.t("输入区接口", "Composer interface")}: ${state.composer ? this.t("可用", "available") : this.t("不可用", "unavailable")} · ${this.t("随包 skill：由 Loader 管理；安装状态需由 Loader 核对", "Bundled skill: Loader-managed; verify installation in Loader")}`;
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
    const note = this.node("p", this.t("默认值用于新任务；当前任务可单独调整。重载后不会自动恢复或重发请求。", "New tasks inherit these defaults; each task can override them. Reloading never restores or resends requests.")); note.className = "bridge-note";
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
    const option = (select: HTMLSelectElement, key: string, text: string): void => { const element = this.node("option", text); element.value = key; select.append(element); };
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
    section = group(this.t("轮数与等待", "Rounds and waiting"));
    const rounds = this.node("input"); rounds.type = "number"; rounds.min = "1"; rounds.max = "8"; rounds.step = "1"; rounds.value = String(value.maxRounds); rounds.required = true;
    const numeric = (input: HTMLInputElement, field: "maxRounds" | "totalWaitMinutes"): void => {
      const change = (): void => {
        const valid = input.value !== "" && Number.isInteger(Number(input.value)) && input.checkValidity();
        if (!valid) { input.setAttribute("aria-invalid", "true"); status.textContent = this.t("未保存：请输入范围内的整数。", "Not saved: enter a whole number within the allowed range."); return; }
        input.removeAttribute("aria-invalid"); commit({ [field]: Number(input.value) });
      };
      input.oninput = change; input.onchange = change;
    };
    numeric(rounds, "maxRounds"); label(this.t("每批业务轮数（1–8）", "Business rounds per batch (1–8)"), rounds);
    const window = this.node("select"); for (const seconds of [30, 60, 90]) option(window, String(seconds), `${seconds} s`);
    window.value = String(value.readWindowSeconds); window.onchange = () => { if (!commit({ readWindowSeconds: Number(window.value) as 30 | 60 | 90 })) window.value = String(value.readWindowSeconds); }; label(this.t("单次读取窗口", "Read window"), window);
    const total = this.node("input"); total.type = "number"; total.min = "1"; total.max = "60"; total.step = "1"; total.value = String(value.totalWaitMinutes); total.required = true;
    numeric(total, "totalWaitMinutes"); label(this.t("单条回复总等待上限（分钟）", "Total wait per reply (minutes)"), total);
    section = group(this.t("会话处理", "Conversation handling"));
    const cleanup = this.node("select"); option(cleanup, "delete", this.t("删除", "Delete")); option(cleanup, "retain", this.t("保留", "Retain")); cleanup.value = value.cleanup;
    cleanup.onchange = () => { if (!commit({ cleanup: cleanup.value as "delete" | "retain" })) cleanup.value = value.cleanup; }; label(this.t("正常结束后的会话处理", "Conversation policy after verified completion"), cleanup);
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
      button.textContent = active ? `${this.stateLabel(active.state)} · ${name}${waiting ? ` · ${clock(active.elapsedMs ?? 0)} / ${clock(active.allowedMs ?? 0)}` : ""}` : `${this.t("Chat 协作", "Chat collaboration")}: ${settings.enabled ? this.t("开", "on") : this.t("关", "off")}${settings.enabled ? ` · ${name} · ${selected?.effortLabel ?? "—"}` : ""}`;
      if (!active && settings.enabled && status?.connection) button.textContent = `${this.t("等待 Codex 接入", "Waiting for Codex to connect")} · ${name}`;
      // Keep the user's explicit Pro choice visible even when model details truncate.
      if ((active?.config.model.mode ?? (settings.enabled ? selected?.mode : undefined)) === "pro") button.textContent = `Pro · ${button.textContent}`;
      button.title = button.textContent;
      const prepared = this.prepared.get(key);
      // Do not re-add a removed/edited instruction. Only a positively accepted submission ends this preparation.
      if (prepared && (this.receipt(prepared.bindingId) as { state?: string }).state === "accepted") this.prepared.delete(key);
      if (settings.enabled && settings.modelKey !== null && !this.prepared.has(key) && !active && typeof this.handle?.prepareSubmission === "function") {
        try { this.prepare(owner); } catch (error) { this.error(error); }
      }
    };
    // Loader can call render synchronously before returning its handle.
    queueMicrotask(update);
    const timer = setInterval(update, 1000); this.timers.add(timer);
    return () => { this.closeQuick?.(); clearInterval(timer); this.timers.delete(timer); root.replaceChildren(); root.classList.remove("bridge-controls"); };
  }
  private stateLabel(state: string): string {
    if (state === "repair-required") return this.t("等待 Codex 续读修复回复", "Waiting for Codex to continue repair");
    if (state === "awaiting-verification") return this.t("Chat 已回复 · 待 Codex 核对", "Chat replied · Codex review pending");
    if (state === "actions-returned") return this.t("Chat 已回复 · 待 Codex 处理", "Chat replied · Codex action pending");
    const labels: Record<string, [string, string]> = { "waiting": ["正在等待 Chat", "Waiting for Chat"], "paused": ["等待你确认", "Waiting for confirmation"], "needs-user": ["等待你确认", "Waiting for confirmation"], "cleanup-failed": ["会话清理失败", "Cleanup failed"], "failed": ["协作已停止", "Collaboration stopped"] };
    const label = labels[state]; return label ? this.t(...label) : this.t("协作已接入", "Collaboration connected");
  }
  private prepare(owner: ComposerIdentity): void {
    const config = this.control.prepare(owner, `snapshot-${crypto.randomUUID()}`);
    const waiting = this.t(
      "本次先重新读取随包 skill。exchange 脚本会自动分段等待；必须等工具进程退出。若输出丢失，按 skill 用 status 的 read 查询原 session/turn，再判断是否继续；不要让用户重新提交同一请求。",
      "Read the installed skill again for this submission. The exchange helper waits across windows; await its tool process. If output is lost, use status read for the original session/turn as documented before deciding how to continue; do not ask for a replacement submission.");
    const text = waiting + "\n" + this.t(
      `Bridge 协作说明（可编辑或删除）：使用随包 bridge-chat skill。Chat 负责规划与指挥，当前 Codex 负责执行与验证；不得改变当前执行模型或权限。接入失败时报告并暂停，不能默默改为独立执行；安装目录权限不足时按 skill 申请同一调用的工具授权。先用 status 核对本说明外层 Loader context 中的 submission 标识和实际 host/task，再 exchange。配置快照 ${config.id}；Chat ${config.model.title} / ${config.model.mode} / ${config.model.effortLabel}；每批 ${config.settings.maxRounds} 轮，读取 ${config.settings.readWindowSeconds} 秒，总等待 ${config.settings.totalWaitMinutes} 分钟。后台运行，不切换页面。先咨询 Chat，顺序执行允许的动作并回报真实证据；达到预算或需要用户时暂停。Chat complete 不代表本地验收或用户交付完成。不授权提交、发布、部署或破坏性操作。`,
      `Visible Bridge collaboration instructions (editable or removable): use the bundled bridge-chat skill. Chat plans; this Codex task executes and verifies without changing its model or permissions. If connection fails, report it and pause instead of silently proceeding alone. For installation access denial, request normal tool approval for the same call as described by the skill. First call status to confirm the submission identity in the outer Loader context and the actual host/task; then exchange. Snapshot ${config.id}; Chat ${config.model.title} / ${config.model.mode} / ${config.model.effortLabel}; ${config.settings.maxRounds} business rounds, ${config.settings.readWindowSeconds}s read windows, ${config.settings.totalWaitMinutes}min total reply wait. Run in the background without navigation. Consult Chat first, execute authorized actions in order and report real evidence. Pause at budget or user-input gates. Chat complete is not local verification or user delivery. This does not authorize commits, publishing, deployment or destructive actions.`);
    const receipt = this.handle!.prepareSubmission({ ...owner, revision: config.id, text });
    this.control.register(receipt.bindingId, owner, config);
    this.prepared.set(JSON.stringify(owner), { bindingId: receipt.bindingId, config });
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
        this.handle?.clearContext(); this.prepared.delete(JSON.stringify(owner));
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
    if (!active && value.enabled && !("draftId" in owner) && this.control.status({task:owner}).connection) {
      const pending = this.node("p", this.t("说明已提交，尚未启动 Chat。请查看 Codex 的工具授权或错误；接入失败时应暂停，不能当作协作完成。", "Instructions submitted. No Chat has started. Check Codex tool approvals or errors; stop if connection fails."));
      pending.className = "bridge-quick-state"; pending.setAttribute("role", "status"); panel.append(pending);
    }
    if (active && !("draftId" in owner)) {
      const state = this.node("p", `${this.stateLabel(active.state)} · ${active.usedRounds}/${active.maxRounds} · ${this.t("修改下次生效", "Changes apply next time")}`); state.className = "bridge-quick-state"; panel.append(state);
      if (active.state === "repair-required") {
        const repair = this.node("p", this.t("Chat 已回复，但格式需要一次修复。Codex 应续读同一请求，不是重新提交任务。", "Chat replied, but its format needs one repair. Codex should continue the same request, not resubmit the task."));
        repair.className = "bridge-quick-state"; repair.setAttribute("role", "status"); panel.append(repair);
      }
      const details = this.node("details"), actions = this.node("div"); actions.className = "bridge-actions";
      details.append(this.node("summary", this.t("管理当前协作", "Manage collaboration")), actions); panel.append(details);
      details.addEventListener("toggle", position);
      const add = (label: string, action: "next-batch" | "continue-waiting" | "user-confirmed"): void => { actions.append(this.button(label, () => { this.control.consent(owner, active.sessionId, action); close(); })); };
      if (active.usedRounds >= active.maxRounds && !active.busy) add(this.t("允许下一批", "Allow next batch"), "next-batch");
      if (active.state === "paused") add(this.t("继续等待", "Continue waiting"), "continue-waiting");
      if (active.state === "needs-user") add(this.t("已提供所需确认", "Required confirmation provided"), "user-confirmed");
      for (const policy of ["retain", "delete"] as const) actions.append(this.button(policy === "retain" ? this.t("结束并保留", "End and retain") : this.t("结束并删除", "End and delete"), async () => { await this.control.endFromUi({ task: owner, sessionId: active.sessionId, policy }); close(); }));
    }
    const error = this.node("p", this.lastError ?? ""); error.dataset.bridgeError = "true"; error.className = "bridge-quick-state"; error.setAttribute("role", "status"); panel.append(error);
    position();
    enabled.focus({ preventScroll: true });
  }
  stop(): void {
    this.stopped = true; this.closeQuick?.(); this.handle?.unregister(); this.page?.unregister();
    for (const timer of this.timers) clearInterval(timer); this.timers.clear();
    this.prepared.clear(); this.css.remove();
  }
}
