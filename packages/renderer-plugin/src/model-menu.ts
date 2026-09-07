import { Check, ChevronRight, type IconNode } from "lucide";
import type { ChatModel } from "./chat-configuration.js";

export const modelGroup = (model: ChatModel): string => model.groupId ?? JSON.stringify([model.slug, model.mode]);

/** UI-only matching after an explicit family choice. Never substitutes a running model. */
export function preferredModel(choices: readonly ChatModel[], preference?: ChatModel): ChatModel | undefined {
  const exact = choices.find(model => model.key === preference?.key);
  if (exact) return exact;
  const ordinary = choices.filter(model => model.mode !== "pro");
  // Choosing a Pro-only family is itself explicit consent to that mode.
  if (!ordinary.length) return choices[0];
  const rank = (model?: ChatModel): number | undefined => model?.mode === "instant" ? 0 : ({ standard: 1, extended: 2, max: 3 } as Record<string, number>)[model?.effort ?? ""];
  const same = preference?.mode !== "pro" && ordinary.find(model => model.mode === preference?.mode && model.effort === preference?.effort);
  if (same) return same;
  const target = rank(preference) ?? 1;
  return ordinary.filter(model => rank(model) !== undefined).sort((a, b) => Math.abs(rank(a)! - target) - Math.abs(rank(b)! - target) || rank(a)! - rank(b)!)[0] ?? ordinary[0];
}

// Library-provided paths, rendered with the owning document for isolated UI tests.
export function menuIcon(document: Document, kind: "check" | "next"): SVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [key, value] of Object.entries({ viewBox: "0 0 24 24", width: "16", height: "16", fill: "none", stroke: "currentColor", "stroke-width": "1.5", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) svg.setAttribute(key, value);
  const nodes: IconNode = kind === "check" ? Check : ChevronRight;
  for (const [tag, attributes] of nodes) { const child = document.createElementNS(svg.namespaceURI, tag); for (const [key, value] of Object.entries(attributes)) child.setAttribute(key, String(value)); svg.append(child); }
  return svg;
}

/** Two-level, whole-row menu. Hover previews; only click/Enter changes a preset. */
export function mountModelMenu(root: HTMLElement, models: readonly ChatModel[], current: () => string | null,
  preference: () => ChatModel | undefined, select: (model: ChatModel) => void, done: () => void, zh: boolean): () => void {
  const document = root.ownerDocument, view = document.defaultView!;
  const list = document.createElement("div"); list.className = "bridge-model-list"; list.setAttribute("role", "menu"); list.setAttribute("aria-label", zh ? "Chat 模型" : "Chat models"); root.append(list);
  let child: HTMLDivElement | undefined, trigger: HTMLButtonElement | undefined;
  const refreshRows: Array<() => void> = [];
  const hide = (): void => { child?.remove(); child = undefined; trigger?.setAttribute("aria-expanded", "false"); trigger = undefined; };
  const position = (): void => {
    if (!child || !trigger) return;
    const row = trigger.getBoundingClientRect(), parent = list.getBoundingClientRect(), box = child.getBoundingClientRect();
    const right = parent.right + 4, left = parent.left - box.width - 4;
    child.style.left = `${Math.max(8, Math.min(right + box.width <= view.innerWidth - 8 ? right : left, view.innerWidth - box.width - 8))}px`;
    child.style.top = `${Math.max(8, Math.min(row.top - 6, view.innerHeight - box.height - 8))}px`;
  };
  for (const [key, first] of new Map(models.map(model => [modelGroup(model), model]))) {
    const choices = models.filter(model => modelGroup(model) === key);
    const row = document.createElement("button"); row.type = "button"; row.className = "bridge-model-row"; row.dataset.bridgeModel = key;
    row.setAttribute("role", "menuitem"); row.setAttribute("aria-haspopup", "menu"); row.setAttribute("aria-expanded", "false");
    const title = document.createElement("span"); title.textContent = first.groupTitle ?? first.title;
    const caption = document.createElement("span"); caption.className = "bridge-model-caption";
    const update = (): void => { const selected = choices.find(model => model.key === current()); caption.textContent = selected?.effortLabel ?? ""; row.dataset.selected = String(!!selected); };
    refreshRows.push(update);
    row.append(title, caption, menuIcon(document, "next")); list.append(row); update();
    const show = (): void => {
      if (trigger === row) return;
      hide(); trigger = row; row.setAttribute("aria-expanded", "true");
      child = document.createElement("div"); child.className = "bridge-submenu"; child.setAttribute("role", "menu"); child.setAttribute("aria-label", `${title.textContent} · ${zh ? "模式／思考程度" : "Mode / thinking level"}`);
      const heading = document.createElement("div"); heading.className = "bridge-menu-heading"; heading.textContent = title.textContent; child.append(heading);
      const preferred = preferredModel(choices, preference());
      for (const model of choices) {
        const item = document.createElement("button"); item.type = "button"; item.className = "bridge-model-row"; item.dataset.bridgePreset = model.key;
        item.setAttribute("role", "menuitemradio"); item.setAttribute("aria-checked", String(model.key === current()));
        const text = document.createElement("span"); text.textContent = model.effortLabel; item.append(text);
        if (model.key === current()) item.append(menuIcon(document, "check"));
        else if (model.key === preferred?.key) { const hint = document.createElement("span"); hint.className = "bridge-model-caption"; hint.textContent = zh ? "默认" : "Default"; item.append(hint); }
        item.onclick = () => { select(model); refreshRows.forEach(refresh => refresh()); done(); }; child.append(item);
      }
      const note = document.createElement("p"); note.className = "bridge-menu-note"; note.textContent = choices.every(model => model.mode === "pro") ? (zh ? "Pro · 无独立思考参数，可能等待更久" : "Pro · no separate thinking level; may take longer") : (zh ? "自动匹配默认档位；Pro 仅手动选择" : "Closest default level; Pro is opt-in"); child.append(note);
      child.onkeydown = event => { if (event.key === "ArrowLeft" || event.key === "Escape") { event.preventDefault(); event.stopPropagation(); const previous = trigger; hide(); previous?.focus(); } };
      root.append(child); position();
    };
    row.onpointerenter = show;
    row.onclick = () => { const selected = preferredModel(choices, preference()); if (selected) select(selected); refreshRows.forEach(refresh => refresh()); hide(); show(); };
    row.onkeydown = event => { if (event.key === "ArrowRight") { event.preventDefault(); show(); child?.querySelector<HTMLButtonElement>("button")?.focus(); } };
  }
  if (!models.length) { const empty = document.createElement("p"); empty.className = "bridge-menu-note"; empty.textContent = zh ? "模型目录不可用，请在 Bridge 设置中刷新。" : "Model catalog unavailable. Refresh in Bridge settings."; list.append(empty); }
  const navigate = (event: KeyboardEvent): void => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const menu = (event.target as Element).closest('[role="menu"]'); if (!menu || !root.contains(menu)) return;
    const items = [...menu.querySelectorAll<HTMLButtonElement>(":scope > button")]; if (!items.length) return;
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    event.preventDefault(); items[next]?.focus();
  };
  root.addEventListener("keydown", navigate); view.addEventListener("resize", position); view.addEventListener("scroll", position, true);
  return () => { hide(); list.remove(); root.removeEventListener("keydown", navigate); view.removeEventListener("resize", position); view.removeEventListener("scroll", position, true); };
}
