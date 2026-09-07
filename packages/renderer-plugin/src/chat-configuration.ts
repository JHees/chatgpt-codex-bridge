import { BridgeError } from "./errors.js";

export interface TaskIdentity { hostId: string; taskId: string }
export type ComposerIdentity = TaskIdentity | { draftId: string };
export interface ChatSettings {
  enabled: boolean;
  modelKey: string | null;
  maxRounds: number;
  readWindowSeconds: 30 | 60 | 90;
  totalWaitMinutes: number;
  cleanup: "delete" | "retain";
}
export interface ChatModel {
  key: string;
  slug: string;
  mode: string;
  title: string;
  effort: string | null;
  effortLabel: string;
  groupId?: string;
  groupTitle?: string;
}
export interface ConfigurationSnapshot {
  id: string;
  task: Readonly<TaskIdentity>;
  settings: Readonly<ChatSettings>;
  model: Readonly<ChatModel>;
}
export type PreparedConfiguration = Omit<ConfigurationSnapshot, "task">;

const initial: ChatSettings = { enabled: false, modelKey: null, maxRounds: 3, readWindowSeconds: 90, totalWaitMinutes: 15, cleanup: "delete" };

function record(value: unknown, code = "INVALID_CONFIGURATION"): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new BridgeError(code, "Expected a configuration object.");
  return value as Record<string, unknown>;
}
function string(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= 256; }
function taskKey(task: ComposerIdentity): string {
  if ("draftId" in task) {
    if (Object.keys(task).length !== 1 || !string(task.draftId)) throw new BridgeError("TASK_MISMATCH", "A valid draft identity is required.");
    return JSON.stringify(["draft", task.draftId]);
  }
  if (!string(task.hostId) || !string(task.taskId)) throw new BridgeError("TASK_MISMATCH", "A confirmed host and task identity is required.");
  return JSON.stringify([task.hostId, task.taskId]);
}
function settings(value: unknown): ChatSettings {
  const input = record(value);
  if (Object.keys(input).some(key => !(key in initial)) || Object.keys(input).length !== Object.keys(initial).length
    || typeof input.enabled !== "boolean" || !(input.modelKey === null || string(input.modelKey))
    || !Number.isInteger(input.maxRounds) || Number(input.maxRounds) < 1 || Number(input.maxRounds) > 8
    || ![30, 60, 90].includes(Number(input.readWindowSeconds)) || typeof input.readWindowSeconds !== "number"
    || !Number.isInteger(input.totalWaitMinutes) || Number(input.totalWaitMinutes) < 1 || Number(input.totalWaitMinutes) > 60
    || !(input.cleanup === "delete" || input.cleanup === "retain")) throw new BridgeError("INVALID_CONFIGURATION", "Configuration values are invalid or unsupported.");
  return { enabled: input.enabled, modelKey: input.modelKey, maxRounds: Number(input.maxRounds), readWindowSeconds: input.readWindowSeconds as 30 | 60 | 90, totalWaitMinutes: Number(input.totalWaitMinutes), cleanup: input.cleanup as "delete" | "retain" };
}

/** One configuration source for settings and task controls; no model calls or persistence side effects. */
export class ChatConfiguration {
  private global: ChatSettings;
  private readonly tasks = new Map<string, ChatSettings>();
  private readonly overrides = new Set<string>();
  private catalog: ChatModel[] = [];

  constructor(savedDefaults: unknown = initial) { this.global = settings(savedDefaults); }
  defaults(): ChatSettings { return { ...this.global }; }
  saveDefaults(input: unknown): void { this.global = settings(input); }
  models(): ChatModel[] { return this.catalog.map(model => ({ ...model })); }

  updateCatalog(value: unknown): void {
    // A failed refresh must not leave stale choices eligible for a new session.
    this.catalog = [];
    const root = record(value, "APP_UNSUPPORTED");
    if (!Array.isArray(root.options) || root.options.length > 128) throw new BridgeError("APP_UNSUPPORTED", "The Chat model catalog has an unsupported shape.");
    const parse = (values: unknown): ChatModel[] => {
      if (!Array.isArray(values) || values.length > 128) throw new BridgeError("APP_UNSUPPORTED", "The Chat model options exceed supported limits.");
      const models: ChatModel[] = [];
      const keys = new Set<string>();
      for (const value of values) {
      const option = record(value, "APP_UNSUPPORTED");
      if (!string(option.slug) || !string(option.lane) || !string(option.modelTitle) || !string(option.selectedLabel)
        || !(option.thinkingEffort === undefined || option.thinkingEffort === null || string(option.thinkingEffort))) throw new BridgeError("APP_UNSUPPORTED", "A Chat model option is not supported.");
      const effort = typeof option.thinkingEffort === "string" ? option.thinkingEffort : null;
      const key = JSON.stringify([option.slug, option.lane, effort]);
      if (key.length > 256 || keys.has(key)) throw new BridgeError("APP_UNSUPPORTED", "Chat model options are ambiguous or too large.");
      keys.add(key);
      models.push({ key, slug: option.slug, mode: option.lane, title: option.modelTitle, effort, effortLabel: option.selectedLabel });
      }
      return models;
    };
    const latest = parse(root.options);
    if (root.versionOptions === undefined) { this.catalog = latest; return; }
    if (!Array.isArray(root.versionOptions) || root.versionOptions.length > 32) throw new BridgeError("APP_UNSUPPORTED", "The Chat version catalog is unsupported.");
    const selected = new Map<string, ChatModel>();
    const ids = new Set<string>();
    for (const value of root.versionOptions) {
      const version = record(value, "APP_UNSUPPORTED");
      if (!string(version.id) || !string(version.label) || ids.has(version.id)) throw new BridgeError("APP_UNSUPPORTED", "The Chat version identity is ambiguous.");
      ids.add(version.id);
      if (version.id === "latest") continue;
      const options = parse(version.options);
      // Native named versions that contain current non-Pro presets supply their own Pro.
      // Older unrelated families are not enabled merely because metadata mentions them.
      if (!options.some(option => option.mode !== "pro" && latest.some(current => current.key === option.key))) continue;
      for (const option of options) {
        if (selected.has(option.key)) throw new BridgeError("APP_UNSUPPORTED", "A Chat preset belongs to multiple current families.");
        selected.set(option.key, { ...option, groupId: `version:${version.id}`, groupTitle: version.label });
      }
    }
    for (const option of latest) if (!selected.has(option.key)) selected.set(option.key, { ...option, groupId: `model:${option.slug}`, groupTitle: option.title });
    if (selected.size > 128) throw new BridgeError("APP_UNSUPPORTED", "The combined Chat catalog exceeds supported limits.");
    this.catalog = [...selected.values()];
  }

  task(identity: ComposerIdentity): ChatSettings {
    const key = taskKey(identity);
    let value = this.tasks.get(key);
    if (value === undefined) { value = { ...this.global }; this.tasks.set(key, value); }
    return { ...value };
  }
  updateTask(identity: ComposerIdentity, patch: Partial<ChatSettings>): void {
    this.tasks.set(taskKey(identity), settings({ ...this.task(identity), ...record(patch) }));
    this.overrides.add(taskKey(identity));
  }
  restoreDefaults(identity: ComposerIdentity): void { this.tasks.set(taskKey(identity), { ...this.global }); this.overrides.add(taskKey(identity)); }
  promote(draft: { draftId: string }, task: TaskIdentity): void {
    const key = taskKey(task);
    if (!this.overrides.has(key)) this.tasks.set(key, this.task(draft));
  }
  freeze(identity: TaskIdentity, id: string): Readonly<ConfigurationSnapshot> {
    return Object.freeze({ ...this.prepare(identity, id), task: Object.freeze({ ...identity }) });
  }
  prepare(identity: ComposerIdentity, id: string): Readonly<PreparedConfiguration> {
    if (!string(id)) throw new BridgeError("INVALID_CONFIGURATION", "A snapshot identity is required.");
    const selected = this.task(identity);
    if (!selected.enabled) throw new BridgeError("COLLABORATION_DISABLED", "This task has not enabled Chat collaboration.");
    const model = this.catalog.find(model => model.key === selected.modelKey);
    if (model === undefined) throw new BridgeError("CHAT_CONFIGURATION_REQUIRED", "Select an available Chat model and supported parameters explicitly.");
    return Object.freeze({ id, settings: Object.freeze(selected), model: Object.freeze({ ...model }) });
  }
  resetTasks(): void { this.tasks.clear(); this.overrides.clear(); }
}
