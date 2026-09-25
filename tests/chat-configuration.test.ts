import { expect, it } from "vitest";
import { ChatConfiguration } from "../packages/renderer-plugin/src/chat-configuration.js";

const catalog = { options: [
  { slug: "thinking-example", lane: "thinking", modelTitle: "Planner", selectedLabel: "Medium", thinkingEffort: "standard" },
  { slug: "thinking-example", lane: "thinking", modelTitle: "Planner", selectedLabel: "High", thinkingEffort: "extended" },
  { slug: "research-example", lane: "pro", modelTitle: "Research", selectedLabel: "Pro" },
] };

it("persists task choices, not active sessions; only drafts inherit enabled defaults", () => {
  const values = new Map<string, unknown>();
  const store = { get: (key: string) => values.get(key), set: (key: string, value: unknown) => { values.set(key, structuredClone(value)); } };
  const defaults = { ...new ChatConfiguration().defaults(), enabled: true };
  const config = new ChatConfiguration(defaults, store);
  const old = { hostId: "local", taskId: "old" }, draft = { draftId: "new" }, task = { hostId: "local", taskId: "new" };
  expect(config.task(old).enabled).toBe(false);
  expect(config.task(draft).enabled).toBe(true);
  config.promote(draft, task);
  config.updateTask(old, { enabled: true, maxRequests: 5 });
  config.resetTasks();
  const reloaded = new ChatConfiguration({ ...defaults, enabled: false, maxRequests: 8 }, store);
  expect(reloaded.task(old)).toMatchObject({ enabled: true, maxRequests: 5 });
  expect(reloaded.task(task)).toMatchObject({ enabled: true, maxRequests: null });
  reloaded.updateTask(old, { enabled: false });
  expect(new ChatConfiguration(defaults, store).task(old).enabled).toBe(false);
  expect(new ChatConfiguration(defaults, store).task({ ...old, hostId: "remote" }).enabled).toBe(false);
});

it("does not accept a task preference change when storage fails", () => {
  let fail = false;
  const values = new Map<string, unknown>();
  const config = new ChatConfiguration(undefined, { get: key => values.get(key), set: (key, value) => { if (fail) throw Error("storage"); values.set(key, value); } });
  const task = { hostId: "local", taskId: "a" };
  config.task(task); fail = true;
  expect(() => config.updateTask(task, { enabled: true })).toThrow("storage");
  expect(config.task(task).enabled).toBe(false);
});

it("has no implicit selected model and freezes the explicitly selected Pro option without an effort", () => {
  const config = new ChatConfiguration();
  expect(config.defaults()).toEqual({ enabled: false, modelKey: null, maxRequests: null, replyTimeoutMinutes: null, cleanup: "delete" });
  config.updateCatalog(catalog);
  const pro = config.models().find(model => model.mode === "pro")!;
  config.updateTask({ hostId: "local", taskId: "a" }, { enabled: true, modelKey: pro.key });
  const frozen = config.freeze({ hostId: "local", taskId: "a" }, "snapshot-1");
  expect(frozen.model).toMatchObject({ slug: "research-example", mode: "pro", effort: null });
  expect(frozen.settings.replyTimeoutMinutes).toBeNull();
  expect(config.task({ hostId: "local", taskId: "b" }).enabled).toBe(false);
});

it("rejects coercible values, unknown fields and out-of-range wait or batch limits", () => {
  const config = new ChatConfiguration();
  for (const patch of [
    { cleanup: ["delete"] }, { cleanup: { toString: () => "retain" } },
    { readWindowSeconds: "90" }, { maxRequests: 0 }, { maxRequests: 1.5 },
    { replyTimeoutMinutes: 0 }, { replyTimeoutMinutes: Infinity }, { hidden: true },
  ]) expect(() => config.saveDefaults({ ...config.defaults(), ...patch })).toThrowError();
  expect(config.defaults().cleanup).toBe("delete");
});

it("keeps existing tasks and frozen sessions independent from new defaults and caller mutation", () => {
  const config = new ChatConfiguration();
  config.updateCatalog(catalog);
  const task = { hostId: "local", taskId: "a" };
  const model = config.models()[0]!;
  config.updateTask(task, { enabled: true, modelKey: model.key });
  const snapshot = config.freeze(task, "s1");
  config.saveDefaults({ ...config.defaults(), maxRequests: 8 });
  config.updateTask(task, { maxRequests: 1 });
  expect(snapshot.settings.maxRequests).toBeNull();
  expect(config.task(task).maxRequests).toBe(1);
  expect(config.task({ ...task, hostId: "remote" }).maxRequests).toBe(8);
  const copy = config.task(task);
  copy.enabled = false;
  expect(config.task(task).enabled).toBe(true);
  config.restoreDefaults(task);
  expect(config.task(task)).toEqual(config.defaults());
});

it("never substitutes a model after refresh, and invalid refresh revokes old choices", () => {
  const config = new ChatConfiguration();
  const task = { hostId: "local", taskId: "a" };
  config.updateCatalog(catalog);
  config.updateTask(task, { enabled: true, modelKey: config.models()[0]!.key });
  config.updateCatalog({ options: catalog.options.slice(1) });
  expect(() => config.freeze(task, "s1")).toThrowError(/Select an available/);
  expect(() => config.updateCatalog(null)).toThrowError(expect.objectContaining({ code: "APP_UNSUPPORTED" }));
  expect(config.models()).toEqual([]);
});
it("uses the named current version presets and retains a distinct latest Pro without duplicate aliases", () => {
  const configuration = new ChatConfiguration();
  const instant = { slug: "sol", lane: "instant", modelTitle: "Sol", selectedLabel: "Instant" };
  const thinking = { slug: "sol-thinking", lane: "thinking", modelTitle: "Sol", selectedLabel: "Medium", thinkingEffort: "standard" };
  const latestPro = { slug: "next-pro", lane: "pro", modelTitle: "Next Pro", selectedLabel: "Pro" };
  const versionPro = { slug: "sol-pro", lane: "pro", modelTitle: "Sol Pro", selectedLabel: "Pro" };
  configuration.updateCatalog({ options: [instant, thinking, latestPro], versionOptions: [
    { id: "latest", label: "Latest", options: [instant, thinking, latestPro] },
    { id: "current", label: "Sol", options: [instant, thinking, versionPro] },
    { id: "old", label: "Old", options: [{ ...instant, slug: "old" }] },
  ] });
  const models = configuration.models();
  expect(models.map(model => model.slug)).toEqual(["sol", "sol-thinking", "sol-pro", "next-pro"]);
  expect(models[2]).toMatchObject({ groupId: "version:current", groupTitle: "Sol", title: "Sol Pro", effort: null });
  expect(models[3]).toMatchObject({ groupId: "model:next-pro", groupTitle: "Next Pro", effort: null });
});
