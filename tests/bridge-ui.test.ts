import { afterEach, expect, it, vi } from "vitest";
import { Window } from "happy-dom";
import { BridgeUi } from "../packages/renderer-plugin/src/bridge-ui.js";
import { ChatConfiguration } from "../packages/renderer-plugin/src/chat-configuration.js";
import { CooperationController } from "../packages/renderer-plugin/src/cooperation-controller.js";
import type { LoaderApi } from "../packages/renderer-plugin/src/loader-interface.js";
import type { BackgroundChatPort } from "../packages/renderer-plugin/src/background-session.js";

const cleanup: Array<() => void> = [];
afterEach(() => { for (const stop of cleanup.splice(0)) stop(); vi.useRealTimers(); });
const sentContext = "[Loader context: dev.codex-chat-bridge / submission-test]\nUse the bundled bridge-chat skill.\n[/Loader context]";
function sentMessage(document: Document, text = sentContext): HTMLElement {
  const bubble = document.createElement("div"); bubble.setAttribute("data-user-message-bubble", "true");
  const markdown = document.createElement("div"); markdown.setAttribute("data-markdown-text-tone", "user-message");
  const body = document.createElement("p"); body.textContent = "My original request";
  const context = document.createElement("p"); context.textContent = text;
  markdown.append(body, context); bubble.append(markdown); document.body.append(bubble);
  return bubble;
}

it("folds sent Bridge instructions without replacing native text and restores them on stop", async () => {
  const f = fixture();
  const bubble = sentMessage(f.document), paragraphs = bubble.querySelectorAll("p");
  const context = paragraphs[1]!, original = context.innerHTML, originalNode = context.firstChild;
  await new Promise(resolve => setTimeout(resolve, 20));
  const toggle = bubble.querySelector<HTMLButtonElement>("[data-bridge-sent-toggle]")!;
  expect(toggle).not.toBeNull();
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(f.window.getComputedStyle(context as never).display).toBe("none");
  expect(paragraphs[0]!.textContent).toBe("My original request");
  toggle.click();
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(f.window.getComputedStyle(context as never).display).not.toBe("none");
  toggle.click();
  expect(context.innerHTML).toBe(original); expect(context.firstChild).toBe(originalNode);
  f.ui.stop();
  expect(bubble.querySelector("button")).toBeNull();
  expect(context.hasAttribute("data-bridge-sent-collapsed")).toBe(false);
  expect(context.innerHTML).toBe(original);
});

it("folds existing history on mount and handles message rerenders without duplicate controls", async () => {
  const f = fixture(); f.ui.stop();
  const bubble = sentMessage(f.document);
  const ui = new BridgeUi(f.document, f.api, f.controller, f.refreshModels); ui.start(); cleanup.push(() => ui.stop());
  expect(bubble.querySelectorAll("[data-bridge-sent-toggle]")).toHaveLength(1);
  const context = bubble.querySelectorAll("p")[1]!;
  context.textContent = "Edited normal message";
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(bubble.querySelector("[data-bridge-sent-toggle]")).toBeNull();
  expect(context.hasAttribute("data-bridge-sent-collapsed")).toBe(false);
  context.textContent = sentContext;
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(bubble.querySelectorAll("[data-bridge-sent-toggle]")).toHaveLength(1);
  const replacement = bubble.cloneNode(true) as HTMLElement;
  // The native rerender recreates its own paragraph, not plugin controls.
  replacement.querySelector("button")?.remove();
  replacement.querySelector("[data-bridge-sent-collapsed]")?.removeAttribute("data-bridge-sent-collapsed");
  bubble.replaceWith(replacement);
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(replacement.querySelectorAll("[data-bridge-sent-toggle]")).toHaveLength(1);
  expect(bubble.querySelector("button")).toBeNull();
});

it("leaves drafts, assistant examples, other plugins and mixed or incomplete paragraphs visible", async () => {
  const f = fixture();
  sentMessage(f.document, "My request\n" + sentContext);
  sentMessage(f.document, sentContext.replace("[/Loader context]", ""));
  sentMessage(f.document, sentContext.replace("dev.codex-chat-bridge", "another-plugin"));
  const draft = sentMessage(f.document); draft.setAttribute("contenteditable", "true");
  const assistant = sentMessage(f.document); assistant.removeAttribute("data-user-message-bubble");
  assistant.firstElementChild!.setAttribute("data-markdown-text-tone", "assistant-message");
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(f.document.querySelector("[data-bridge-sent-toggle]")).toBeNull();
  expect(f.preparations).toHaveLength(0);
});

it.each([
  ["zh", "Chat Planner · pro · Extended。配置 snapshot-test；其余参数由 status 读取。", "Chat 协作 · Planner · Extended"],
  ["en", "Chat Reasoner · thinking · High. Configuration snapshot-test; read remaining parameters with status.", "Chat collaboration · Reasoner · High"],
  ["zh", "使用随包 bridge-chat skill 协作：Chat 规划，Codex 执行并回报证据；沿用现有权限，接入失败时暂停。Chat GPT-5.6 Sol · thinking · 中。配置 snapshot-test；其余参数由 status 读取。", "Chat 协作 · GPT-5.6 Sol · 中"],
  ["en", "Use the bundled bridge-chat skill: Chat plans; Codex executes and reports evidence under existing permissions. Pause if connection fails. Chat Reasoner · thinking · High. Configuration snapshot-test; read remaining parameters with status.", "Chat collaboration · Reasoner · High"],
])("restored %s composer instructions keep the original Bridge summary", async (language, text, expected) => {
  const f = fixture(); f.ui.stop(); f.document.documentElement.lang = language;
  const editor = f.document.createElement("div"); editor.setAttribute("data-codex-composer", "true");
  const fold = f.document.createElement("div"); fold.dataset.loaderContextFold = "true";
  const bar = f.document.createElement("div"); bar.contentEditable = "false";
  const title = f.document.createElement("span"); title.textContent = "插件说明（已有草稿）"; title.title = title.textContent;
  const body = f.document.createElement("p"); body.textContent = `[Loader context: dev.codex-chat-bridge / submission-test]\n${text}\n[/Loader context]`;
  const originalBody = body.textContent;
  bar.append(title); fold.append(bar, body); editor.append(fold); f.document.body.append(editor);
  const unrelated = fold.cloneNode(true) as HTMLElement;
  unrelated.querySelector("p")!.textContent = body.textContent.replace("dev.codex-chat-bridge", "another.plugin"); editor.append(unrelated);
  const ui = new BridgeUi(f.document, f.api, f.controller, f.refreshModels); ui.start(); cleanup.push(() => ui.stop());
  expect(title.textContent).toBe(expected); expect(title.title).toBe(expected);
  expect(body.textContent).toBe(originalBody);
  expect(unrelated.querySelector("span")!.textContent).toBe("插件说明（已有草稿）");
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(title.textContent).toBe(expected); expect(f.preparations).toHaveLength(0);
  ui.stop(); expect(title.textContent).toBe("插件说明（已有草稿）");
});
function fixture(enabled = false, navigation = true, port?: BackgroundChatPort, restored = false) {
  const window = new Window({ url: "app://-/index.html" });
  const document = window.document as unknown as Document;
  document.documentElement.lang = "en";
  const settings = document.createElement("section"), composer = document.createElement("span"); document.body.append(settings, composer);
  const configuration = new ChatConfiguration();
  configuration.updateCatalog({ options: [
    { slug: "thinking-model", lane: "thinking", modelTitle: "Reasoner", selectedLabel: "Medium", thinkingEffort: "standard" },
    { slug: "thinking-model", lane: "thinking", modelTitle: "Reasoner", selectedLabel: "High", thinkingEffort: "extended" },
    { slug: "pro-model", lane: "pro", modelTitle: "Planner", selectedLabel: "Pro" },
  ] });
  const task = { hostId: "local", taskId: "task-a" };
  configuration.updateTask(task, { enabled, modelKey: configuration.models()[0]!.key });
  const writes: unknown[] = [], preparations: unknown[] = [];
  let edited = false, accepted = false;
  const receipt = (bindingId: string) => accepted ? { state: "accepted", bindingId, hostId: task.hostId, taskId: task.taskId, turnId: "native-turn" } : { state: "prepared", bindingId };
  let mountedTask = task.taskId, clears = 0, settingsOpened = 0, prepareCalls = 0;
  let onChange: ((event: { target: "context"; action: "removed" | "edited" | "expanded" | "collapsed"; revision: string; identity: typeof task }) => void) | undefined;
  const api: LoaderApi = {
    version: "test", storage: { get: () => null, set: (_key, value) => { writes.push(value); } },
    settings: { registerPage: page => { page.render(settings); return { ...(navigation ? { open: async () => { settingsOpened++; } } : {}), unregister() { settings.replaceChildren(); } }; } },
    composer: { registerAccessory: spec => {
      onChange = (spec as typeof spec & { onChange?: typeof onChange }).onChange;
      spec.render(composer, task);
      return { getStatus: () => ({ available: true, hostId: task.hostId, taskId: mountedTask, context: { state: edited ? "missing-or-edited" : "prepared" } }),
        getSubmission: receipt,
        prepareSubmission: input => { prepareCalls++; if(restored) throw Object.assign(Error("Saved draft"),{code:"CONTEXT_EXISTS"}); preparations.push(input); return { state: "prepared", bindingId: `binding-${preparations.length}` }; },
        clearContext: () => { clears++; restored=false; }, unregister: () => {},
      };
    } },
  };
  const controller = new CooperationController(configuration, receipt, () => { if (port) return port; throw Error("No generation in UI tests"); });
  const refreshModels = vi.fn(async () => {});
  const ui = new BridgeUi(document, api, controller, refreshModels); ui.start();
  cleanup.push(() => { ui.stop(); controller.stop(); window.happyDOM.abort(); });
  const fire = (element: Element, type: string): void => { const event = document.createEvent("Event"); event.initEvent(type, false, true); element.dispatchEvent(event); };
  return { window, document, settings, composer, ui, api, controller, refreshModels, configuration, writes, preparations, fire,
    managedChange: (action: "removed" | "edited" | "expanded" | "collapsed", identity = task) => onChange?.({ target: "context", action, revision: "binding-1", identity }),
    accept: () => { accepted = true; }, edit: () => { edited = true; }, navigate: () => { mountedTask = "task-b"; }, clears: () => clears, settingsOpened: () => settingsOpened, prepareCalls: () => prepareCalls };
}

it("leaves restored instructions untouched and retries only after explicit re-preparation", async () => {
  vi.useFakeTimers(); const f=fixture(true,true,undefined,true);
  await vi.advanceTimersByTimeAsync(5000);
  expect(f.prepareCalls()).toBe(1); expect(f.clears()).toBe(0);
  f.composer.querySelector("button")!.click(); await vi.advanceTimersByTimeAsync(0);
  const retry=[...f.document.querySelectorAll<HTMLButtonElement>(".bridge-popover button")].find(b=>b.textContent==="Prepare fresh collaboration instructions")!;
  expect(retry).toBeDefined(); retry.click(); await vi.advanceTimersByTimeAsync(0);
  expect(f.clears()).toBe(1); expect(f.preparations).toHaveLength(1);
  expect(f.ui.compatibility().errorCode).toBeNull();
});

it("Loader Remove turns collaboration off immediately without an API echo or automatic reinsertion", async () => {
  vi.useFakeTimers(); const f = fixture(true);
  await vi.advanceTimersByTimeAsync(1);
  expect(f.preparations).toHaveLength(1);
  f.managedChange("expanded"); f.managedChange("collapsed"); f.managedChange("edited");
  expect(f.configuration.task({ hostId: "local", taskId: "task-a" }).enabled).toBe(true);
  f.managedChange("removed");
  expect(f.configuration.task({ hostId: "local", taskId: "task-a" }).enabled).toBe(false);
  expect(f.composer.textContent).toContain("off"); expect(f.clears()).toBe(0);
  await vi.advanceTimersByTimeAsync(3000); expect(f.preparations).toHaveLength(1);
  f.composer.querySelector<HTMLButtonElement>("button")!.click(); await vi.advanceTimersByTimeAsync(1);
  const enabled = f.document.querySelector<HTMLInputElement>('.bridge-popover input[role="switch"]')!;
  expect(enabled.checked).toBe(false);
  enabled.checked = true; f.fire(enabled, "change"); expect(f.preparations).toHaveLength(2);
  enabled.checked = false; f.fire(enabled, "change"); expect(f.clears()).toBe(2);
});

it("a stale Loader notification cannot disable the mounted task", async () => {
  vi.useFakeTimers(); const f = fixture(true); await vi.advanceTimersByTimeAsync(1);
  f.managedChange("removed", { hostId: "local", taskId: "task-b" });
  expect(f.configuration.task({ hostId: "local", taskId: "task-a" }).enabled).toBe(true);
});

it("the real task-panel end button can finish a busy exchange and clear only its owned context", async () => {
  vi.useFakeTimers();
  let start!: () => void, finishes = 0;
  const started = new Promise<void>(resolve => { start = resolve; });
  const port: BackgroundChatPort = {
    check:async()=>{},send:async()=>"message",finish:async()=>{finishes++;},
    read:async(_id,_wait,signal)=>{start();await new Promise<void>(resolve=>signal!.addEventListener("abort",()=>resolve(),{once:true}));return{state:"waiting"};},
  };
  const f = fixture(true,true,port); await vi.advanceTimersByTimeAsync(1000); f.accept();
  const task = {hostId:"local",taskId:"task-a"};
  const config=f.controller.status({task,bindingId:"binding-1"}).prepared!;
  const pending=f.controller.exchange({task,bindingId:"binding-1",snapshotId:config.id,request:{protocol:"codex-chat-bridge/v1",sessionId:"session",turnId:"turn",kind:"request",objective:"Test stop",state:{phase:"plan",summary:"Waiting",completed:[],blockers:[]},message:"Plan",actionResults:[]}}).catch(error=>error);
  await started;
  f.composer.querySelector("button")!.click(); await vi.advanceTimersByTimeAsync(0);
  const end=[...f.document.querySelectorAll<HTMLButtonElement>(".bridge-actions button")].find(button=>button.textContent==="End and retain")!;
  expect(end).toBeDefined(); end.click(); await vi.advanceTimersByTimeAsync(0);
  expect(await pending).toMatchObject({code:"SESSION_ENDING"});
  expect(finishes).toBe(1);
  expect(f.controller.status({task}).active).toBeNull();
  expect(f.clears()).toBe(1);
  expect(f.document.querySelector(".bridge-popover")).toBeNull();
});

it("registers one settings page and an off task control without sending or preparing a context", async () => {
  const f = fixture(); await Promise.resolve();
  expect(f.settings.querySelector("form")).not.toBeNull();
  expect(f.settings.textContent).toContain("Composer interface: available");
  expect(f.ui.compatibility()).toMatchObject({ bundledSkill: "loader-managed-unverified", bundledSkillNote: expect.stringContaining("not an installation failure") });
  expect(f.settings.textContent).toContain("not an installation failure");
  expect(f.composer.textContent).toContain("off");
  expect(f.preparations).toHaveLength(0);
  expect(f.writes).toHaveLength(0);
});

it("keeps working without batches and updates reply diagnostics through final verification", async () => {
  vi.useFakeTimers();
  let source = "Bridge status: continue\nInspect the source";
  const port: BackgroundChatPort = { check: async () => {}, send: async () => "message", read: async () => ({state:"complete",text:source}), finish: async () => {} };
  const f = fixture(true, true, port); await vi.advanceTimersByTimeAsync(1); f.accept();
  const task = { hostId: "local", taskId: "task-a" };
  const snapshot = f.controller.status({task,bindingId:"binding-1"}).prepared!;
  const request = { protocol:"codex-chat-bridge/v1", sessionId:"session", turnId:"turn-1", kind:"request", objective:"Check", state:{phase:"verify",summary:"Inspect",completed:[],blockers:[]}, message:"Plan", actionResults:[] };
  const call = {task,bindingId:"binding-1",snapshotId:snapshot.id,request};
  await f.controller.exchange(call);
  f.composer.querySelector("button")!.click(); await vi.advanceTimersByTimeAsync(0);
  const panel = f.document.querySelector(".bridge-popover")!;
  expect(panel.textContent).toContain("Working until task completion");
  expect(panel.textContent).not.toContain("Allow next batch");
  expect(panel.textContent).not.toContain("Required confirmation provided");
  for (let i=2;i<=3;i++) {
    await f.controller.exchange({...call,replyToTurnId:`turn-${i-1}`,request:{...request,turnId:`turn-${i}`,kind:"result",actionResults:[{actionId:"plan",outcome:"succeeded",summary:"Checked",evidence:["Verified"]}]}});
    await vi.advanceTimersByTimeAsync(1000);
    expect(panel.textContent).toContain(`request ${i}`);
    expect(panel.textContent).toContain(`Requests sent: ${i}`);
  }
  expect(f.controller.status({task}).active?.usedRequests).toBe(3);
  source = "Bridge status: complete\nEvidence reviewed";
  await f.controller.exchange({...call,replyToTurnId:"turn-3",request:{...request,turnId:"turn-4",kind:"result",state:{phase:"complete",summary:"Verified",completed:["Passed"],blockers:[]},actionResults:[{actionId:"plan",outcome:"succeeded",summary:"Checked",evidence:["Verified"]}]}});
  await vi.advanceTimersByTimeAsync(1000);
  expect(f.controller.status({task}).active).toBeNull();
  expect(f.document.querySelector(".bridge-popover")).toBeNull();
  f.composer.querySelector("button")!.click(); await vi.advanceTimersByTimeAsync(0);
  const completedPanel = f.document.querySelector(".bridge-popover")!;
  expect(completedPanel.textContent).toContain("Last reply:");
  expect(completedPanel.textContent).not.toContain("Remaining rounds:");
});

it("releases the task-panel polling interval on close and stop", async () => {
  vi.useFakeTimers(); const f=fixture(); await vi.advanceTimersByTimeAsync(0);
  const baseline=vi.getTimerCount(), trigger=f.composer.querySelector("button")!;
  trigger.click(); await vi.advanceTimersByTimeAsync(0);
  expect(vi.getTimerCount()).toBe(baseline+1);
  trigger.click(); await vi.advanceTimersByTimeAsync(0);
  expect(vi.getTimerCount()).toBe(baseline);
  await vi.advanceTimersByTimeAsync(3000);
  expect(vi.getTimerCount()).toBe(baseline);
  trigger.click(); await vi.advanceTimersByTimeAsync(0);
  f.ui.stop();
  expect(vi.getTimerCount()).toBe(0);
});

it("keeps cleanup choices while exposing only optional user limits", async () => {
  const f = fixture();
  expect(f.settings.querySelector("select")).toBeNull();
  const trigger = f.settings.querySelector<HTMLButtonElement>('[aria-label="Conversation policy after verified completion"]')!;
  trigger.click(); await Promise.resolve(); await Promise.resolve();
  const archive = [...f.document.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')].find(row=>row.textContent==="Archive")!;
  expect(archive).toBeDefined(); archive.click(); await Promise.resolve(); await Promise.resolve();
  expect(f.configuration.defaults().cleanup).toBe("archive");
  expect(trigger.textContent).toBe("Archive");
  expect(f.writes).toHaveLength(1);
  expect(f.settings.querySelector('[aria-label="Read window"]')).toBeNull();
  expect([...f.settings.querySelectorAll<HTMLInputElement>('input[type="number"]')].every(input=>input.value==="")).toBe(true);
});

it("shows accepted instructions as waiting for Codex, not an active Chat session", async () => {
  vi.useFakeTimers(); const f=fixture(true); await vi.advanceTimersByTimeAsync(1000);
  f.accept(); await vi.advanceTimersByTimeAsync(1000);
  expect(f.composer.textContent).toContain("Waiting for Codex to connect");
  f.composer.querySelector("button")!.click(); await Promise.resolve(); await Promise.resolve();
  expect(f.document.querySelector('.bridge-popover')!.textContent).toContain("No Chat has started");
});

it("uses accessible slider switches in defaults and the task selector", async () => {
  const f = fixture();
  expect(f.settings.querySelector<HTMLInputElement>('[role="switch"]')?.checked).toBe(false);
  f.composer.querySelector("button")!.click(); await Promise.resolve(); await Promise.resolve();
  const toggle = f.document.querySelector<HTMLInputElement>('.bridge-popover [role="switch"]')!;
  expect(toggle).not.toBeNull();
  expect(f.document.defaultView!.getComputedStyle(toggle).appearance).toBe("none");
  toggle.click();
  expect(toggle.checked).toBe(true);
  expect(f.configuration.task({ hostId: "local", taskId: "task-a" }).enabled).toBe(true);
  toggle.click();
  expect(toggle.checked).toBe(false);
});

it("shows model families as hover submenus and selects the exact Pro backend only on explicit action", async () => {
  const f = fixture(); f.composer.querySelector("button")!.click(); await Promise.resolve(); await Promise.resolve();
  const row = f.document.querySelector<HTMLButtonElement>('[data-bridge-model]')!;
  f.fire(row, "pointerenter");
  expect(row.getAttribute("aria-expanded")).toBe("true");
  expect(f.document.querySelectorAll('[role="menuitemradio"]')).toHaveLength(2);
  expect(f.configuration.task({hostId:"local",taskId:"task-a"}).modelKey).toBe(f.configuration.models()[0]!.key);
  const pro = [...f.document.querySelectorAll<HTMLButtonElement>('[data-bridge-model]')][1]!;
  pro.click();
  expect(f.configuration.task({hostId:"local",taskId:"task-a"}).modelKey).toBe(JSON.stringify(["pro-model","pro",null]));
  expect(f.document.querySelectorAll('[data-bridge-model][data-selected="true"]')).toHaveLength(1);
  expect(row.querySelector('.bridge-model-caption')!.textContent).toBe("");
  expect(f.document.querySelector('.bridge-submenu')!.textContent).toContain("no separate thinking level");
  expect(f.writes).toHaveLength(0);
});

it("opens the registered system settings page without creating its own settings dialog", async () => {
  const f = fixture();
  f.composer.querySelector("button")!.click(); await Promise.resolve(); await Promise.resolve();
  const settings = [...f.document.querySelectorAll<HTMLButtonElement>(".bridge-popover button")].find(button => button.textContent === "Bridge settings")!;
  settings.click(); await Promise.resolve(); await Promise.resolve();
  expect(f.settingsOpened()).toBe(1);
  expect(f.document.querySelector("dialog,.bridge-popover")).toBeNull();
  expect(f.writes).toHaveLength(0);
  expect(f.preparations).toHaveLength(0);
});

it("reports missing Loader navigation without falling back to a private settings dialog", async () => {
  const f = fixture(false, false);
  f.composer.querySelector("button")!.click(); await Promise.resolve(); await Promise.resolve();
  [...f.document.querySelectorAll<HTMLButtonElement>(".bridge-popover button")].find(button => button.textContent === "Bridge settings")!.click();
  await Promise.resolve(); await Promise.resolve();
  expect(f.document.querySelector("dialog")).toBeNull();
  expect(f.document.querySelector(".bridge-popover")!.textContent).toContain("SETTINGS_NAVIGATION_UNAVAILABLE");
  expect(f.settingsOpened()).toBe(0);
});

it("opens a compact anchored menu without native dropdown arrows or a separate settings form", async () => {
  const f = fixture(); f.composer.querySelector("button")!.click(); await Promise.resolve(); await Promise.resolve();
  const panel = f.document.querySelector(".bridge-popover")!;
  expect(panel.querySelectorAll("input")).toHaveLength(1);
  expect(panel.querySelector("select,form,input[type=number]")).toBeNull();
  expect(panel.querySelectorAll("[data-bridge-model]")).toHaveLength(2);
  expect(f.document.defaultView!.getComputedStyle(panel).width).toBe("260px");
});

it("inherits the saved thinking level on a whole model row click without an empty intermediate selection", async () => {
  const f = fixture();
  const high = f.configuration.models()[1]!;
  f.configuration.saveDefaults({...f.configuration.defaults(),modelKey:high.key});
  f.composer.querySelector("button")!.click(); await Promise.resolve(); await Promise.resolve();
  f.document.querySelector<HTMLButtonElement>('[data-bridge-model]')!.click();
  expect(f.configuration.task({hostId:"local",taskId:"task-a"}).modelKey).toBe(high.key);
  expect(f.document.querySelector('[aria-checked="true"]')!.textContent).toContain("High");
  expect(f.preparations).toHaveLength(0);
});

it("shows only stable background error codes without resetting an edited settings form", () => {
  const f = fixture();
  const form = f.settings.querySelector("form");
  f.ui.backgroundChanged("APP_UNSUPPORTED");
  expect(f.settings.textContent).toContain("APP_UNSUPPORTED");
  expect(f.settings.querySelector("form")).toBe(form);
  f.ui.backgroundChanged("private data: secret");
  expect(f.settings.textContent).not.toContain("secret");
  f.ui.backgroundChanged(null);
  expect(f.settings.textContent).not.toContain("APP_UNSUPPORTED");
});

it("changing a stale task selector cannot update or clear another task's composer", async () => {
  const f = fixture(); await Promise.resolve();
  f.composer.querySelector("button")!.click(); await Promise.resolve(); await Promise.resolve();
  const enabled = f.document.querySelector<HTMLInputElement>(".bridge-popover input")!;
  f.navigate(); enabled.checked = true; f.fire(enabled, "change");
  expect(f.document.querySelector(".bridge-popover")).toBeNull();
  expect(f.configuration.task({hostId:"local",taskId:"task-a"}).enabled).toBe(false);
  expect(f.clears()).toBe(0);
  expect(f.preparations).toHaveLength(0);
});

it("selects an effort directly from hover without selecting a model first and only updates this task", async () => {
  const f = fixture();
  f.configuration.updateTask({hostId:"local",taskId:"task-a"},{modelKey:null});
  f.composer.querySelector("button")!.click(); await Promise.resolve(); await Promise.resolve();
  f.fire(f.document.querySelector('[data-bridge-model]')!, "pointerenter");
  const high = [...f.document.querySelectorAll<HTMLButtonElement>('[data-bridge-preset]')][1]!;
  high.click();
  expect(f.configuration.task({hostId:"local",taskId:"task-a"}).modelKey).toBe(f.configuration.models()[1]!.key);
  expect(f.configuration.defaults().modelKey).toBeNull();
  expect(f.writes).toHaveLength(0);
  expect(f.document.querySelector(".bridge-popover")).toBeNull();
});

it("dismisses on Escape, outside pointer and repeated trigger without leaving a modal or listeners", async () => {
  const f = fixture(); const trigger = f.composer.querySelector("button")!;
  const open = async () => { trigger.click(); await Promise.resolve(); await Promise.resolve(); };
  await open();
  f.document.dispatchEvent(new f.window.KeyboardEvent("keydown", {key:"Escape",bubbles:true}) as unknown as Event);
  expect(f.document.querySelector(".bridge-popover")).toBeNull();
  expect(f.document.activeElement).toBe(trigger);
  await open(); f.fire(f.settings, "pointerdown");
  expect(f.document.querySelector(".bridge-popover")).toBeNull();
  await open(); await open();
  expect(f.document.querySelector(".bridge-popover")).toBeNull();
  await open(); f.ui.stop();
  expect(f.document.querySelector(".bridge-popover")).toBeNull();
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
});

it("prepares visible instructions once, then never re-adds a user-deleted context on timer updates", async () => {
  vi.useFakeTimers();
  const f = fixture(true); await Promise.resolve(); await vi.advanceTimersByTimeAsync(1000);
  expect(f.preparations).toHaveLength(1);
  expect(f.preparations[0]).toHaveProperty("text", expect.stringContaining("Use the bundled bridge-chat skill"));
  expect((f.preparations[0] as {text:string}).text.length).toBeLessThan(400);
  f.edit(); await vi.advanceTimersByTimeAsync(5000);
  expect(f.preparations).toHaveLength(1);
});

it("puts explicit Pro mode before truncatable model details on the compact control", async () => {
  vi.useFakeTimers();
  const f = fixture(true);
  f.configuration.updateTask({ hostId: "local", taskId: "task-a" }, { modelKey: f.configuration.models().find(model => model.mode === "pro")!.key });
  await vi.advanceTimersByTimeAsync(1000);
  const button = f.composer.querySelector("button")!;
  expect(button.textContent).toMatch(/^Pro · /);
  expect(button.title).toContain("Planner");
});

it("does not persist invalid default values before validating them", () => {
  const f = fixture();
  const rounds = f.settings.querySelector<HTMLInputElement>('input[type="number"]')!;
  rounds.value = "0"; f.fire(rounds, "change");
  f.fire(f.settings.querySelector("form")!, "submit");
  expect(f.writes).toHaveLength(0);
  expect(f.configuration.defaults().maxRequests).toBeNull();
});

it("automatically persists a selected default model without a Save button", async () => {
  const f = fixture();
  expect(f.settings.querySelector("h2")).toBeNull();
  f.settings.querySelector<HTMLButtonElement>(".bridge-preset-trigger")!.click(); await Promise.resolve(); await Promise.resolve();
  const pro = [...f.document.querySelectorAll<HTMLButtonElement>('[data-bridge-model]')][1]!;
  pro.click();
  expect(f.settings.querySelector(".bridge-preset-trigger")!.textContent).toContain("Planner · Pro");
  expect(f.writes).toHaveLength(1);
  expect(f.settings.querySelector('[type="submit"]')).toBeNull();
  expect(f.configuration.defaults().modelKey).toBe(JSON.stringify(["pro-model","pro",null]));
});

it("autosaves each valid field, ignores duplicates and keeps existing task choices", () => {
  const f = fixture(); const before = f.configuration.task({hostId:"local",taskId:"task-a"});
  const toggle = f.settings.querySelector<HTMLInputElement>('[role="switch"]')!;
  toggle.checked = true; f.fire(toggle,"change");
  const rounds = f.settings.querySelector<HTMLInputElement>('input[type="number"]')!;
  rounds.value = "5"; f.fire(rounds,"input"); f.fire(rounds,"change");
  expect(f.writes).toHaveLength(2);
  expect(f.configuration.defaults()).toMatchObject({enabled:true,maxRequests:5});
  expect(f.configuration.task({hostId:"local",taskId:"task-a"})).toEqual(before);
    expect(f.configuration.task({draftId:"new-draft"})).toMatchObject({enabled:true,maxRequests:5});
    expect(f.configuration.task({hostId:"local",taskId:"unrecorded-existing-task"})).toMatchObject({enabled:false,maxRequests:5});
  rounds.value = ""; f.fire(rounds,"input");
  expect(f.writes).toHaveLength(3);
  expect(f.configuration.defaults().maxRequests).toBeNull();
  expect(rounds.getAttribute("aria-invalid")).toBeNull();
  rounds.value = "6"; f.fire(rounds,"input");
  expect(rounds.getAttribute("aria-invalid")).toBeNull();
  expect(f.configuration.defaults().maxRequests).toBe(6);
});

it("reports failed autosave without changing defaults and permits the next valid edit", () => {
  const f = fixture(); const write = f.api.storage.set;
  f.api.storage.set = () => { throw Error("private failure detail"); };
  const rounds = f.settings.querySelector<HTMLInputElement>('input[type="number"]')!;
  rounds.value = "4"; f.fire(rounds,"input");
  expect(f.configuration.defaults().maxRequests).toBeNull();
  expect(f.settings.textContent).toContain("Not saved");
  expect(f.settings.textContent).not.toContain("private failure detail");
  f.api.storage.set = write; f.fire(rounds,"change");
  expect(f.configuration.defaults().maxRequests).toBe(4);
});

it("offers a compact Diagnose action in a native settings row without generating messages", async () => {
  const f = fixture();
  const button = [...f.settings.querySelectorAll('button')].find(b=>b.textContent==='Diagnose')!;
  expect(button).toBeDefined(); expect(button.closest('.bridge-row')).not.toBeNull();
  button.click(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  expect(f.refreshModels).toHaveBeenCalledTimes(1);
  expect(f.writes).toHaveLength(0); expect(f.preparations).toHaveLength(0);
});

it("supports keyboard submenu navigation and Escape closes only one level", async () => {
  const f = fixture(); f.composer.querySelector("button")!.click(); await Promise.resolve(); await Promise.resolve();
  const row = f.document.querySelector<HTMLButtonElement>('[data-bridge-model]')!;
  const key = (target: Element, name: string) => target.dispatchEvent(new f.window.KeyboardEvent("keydown",{key:name,bubbles:true,cancelable:true}) as unknown as Event);
  row.focus(); key(row,"ArrowRight");
  expect(f.document.activeElement?.getAttribute("role")).toBe("menuitemradio");
  key(f.document.activeElement!,"ArrowDown");
  expect(f.document.activeElement?.textContent).toContain("High");
  key(f.document.activeElement!,"Escape");
  expect(f.document.querySelector(".bridge-submenu")).toBeNull();
  expect(f.document.querySelector(".bridge-popover")).not.toBeNull();
  expect(f.document.activeElement).toBe(row);
});
