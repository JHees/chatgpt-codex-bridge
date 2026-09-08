import { afterEach, expect, it, vi } from "vitest";
import { Window } from "happy-dom";
import { BridgeUi } from "../packages/renderer-plugin/src/bridge-ui.js";
import { ChatConfiguration } from "../packages/renderer-plugin/src/chat-configuration.js";
import { CooperationController } from "../packages/renderer-plugin/src/cooperation-controller.js";
import type { LoaderApi } from "../packages/renderer-plugin/src/loader-interface.js";

const cleanup: Array<() => void> = [];
afterEach(() => { for (const stop of cleanup.splice(0)) stop(); vi.useRealTimers(); });
function fixture(enabled = false, navigation = true) {
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
  let mountedTask = task.taskId, clears = 0, settingsOpened = 0;
  const api: LoaderApi = {
    version: "test", storage: { get: () => null, set: (_key, value) => { writes.push(value); } },
    settings: { registerPage: page => { page.render(settings); return { ...(navigation ? { open: async () => { settingsOpened++; } } : {}), unregister() { settings.replaceChildren(); } }; } },
    composer: { registerAccessory: spec => {
      spec.render(composer, task);
      return { getStatus: () => ({ available: true, hostId: task.hostId, taskId: mountedTask, context: { state: edited ? "missing-or-edited" : "prepared" } }),
        getSubmission: receipt,
        prepareSubmission: input => { preparations.push(input); return { state: "prepared", bindingId: `binding-${preparations.length}` }; },
        clearContext: () => { clears++; }, unregister: () => {},
      };
    } },
  };
  const controller = new CooperationController(configuration, receipt, () => { throw Error("No generation in UI tests"); });
  const refreshModels = vi.fn(async () => {});
  const ui = new BridgeUi(document, api, controller, refreshModels); ui.start();
  cleanup.push(() => { ui.stop(); controller.stop(); window.happyDOM.abort(); });
  const fire = (element: Element, type: string): void => { const event = document.createEvent("Event"); event.initEvent(type, false, true); element.dispatchEvent(event); };
  return { window, document, settings, composer, ui, api, refreshModels, configuration, writes, preparations, fire, accept: () => { accepted = true; }, edit: () => { edited = true; }, navigate: () => { mountedTask = "task-b"; }, clears: () => clears, settingsOpened: () => settingsOpened };
}

it("registers one settings page and an off task control without sending or preparing a context", async () => {
  const f = fixture(); await Promise.resolve();
  expect(f.settings.querySelector("form")).not.toBeNull();
  expect(f.settings.textContent).toContain("Composer interface: available");
  expect(f.composer.textContent).toContain("off");
  expect(f.preparations).toHaveLength(0);
  expect(f.writes).toHaveLength(0);
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
  rounds.value = "99"; f.fire(rounds, "change");
  f.fire(f.settings.querySelector("form")!, "submit");
  expect(f.writes).toHaveLength(0);
  expect(f.configuration.defaults().maxRounds).toBe(3);
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
  expect(f.configuration.defaults()).toMatchObject({enabled:true,maxRounds:5});
  expect(f.configuration.task({hostId:"local",taskId:"task-a"})).toEqual(before);
    expect(f.configuration.task({draftId:"new-draft"})).toMatchObject({enabled:true,maxRounds:5});
    expect(f.configuration.task({hostId:"local",taskId:"unrecorded-existing-task"})).toMatchObject({enabled:false,maxRounds:5});
  rounds.value = ""; f.fire(rounds,"input");
  expect(f.writes).toHaveLength(2);
  expect(rounds.getAttribute("aria-invalid")).toBe("true");
  rounds.value = "6"; f.fire(rounds,"input");
  expect(rounds.getAttribute("aria-invalid")).toBeNull();
  expect(f.configuration.defaults().maxRounds).toBe(6);
});

it("reports failed autosave without changing defaults and permits the next valid edit", () => {
  const f = fixture(); const write = f.api.storage.set;
  f.api.storage.set = () => { throw Error("private failure detail"); };
  const rounds = f.settings.querySelector<HTMLInputElement>('input[type="number"]')!;
  rounds.value = "4"; f.fire(rounds,"input");
  expect(f.configuration.defaults().maxRounds).toBe(3);
  expect(f.settings.textContent).toContain("Not saved");
  expect(f.settings.textContent).not.toContain("private failure detail");
  f.api.storage.set = write; f.fire(rounds,"change");
  expect(f.configuration.defaults().maxRounds).toBe(4);
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
