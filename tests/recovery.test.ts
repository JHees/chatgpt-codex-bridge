import { afterEach, expect, it, vi } from "vitest";
import { Window } from "happy-dom";
import { start, stop, invokeHostCommand } from "../packages/renderer-plugin/src/index.js";
import { discoverAppChatRuntime } from "../packages/renderer-plugin/src/app-chat-runtime.js";
import { BridgeError } from "../packages/renderer-plugin/src/errors.js";
import type { LoaderApi } from "../packages/renderer-plugin/src/loader-interface.js";
import type { NativeCompletionInput } from "../packages/renderer-plugin/src/background-adapter.js";
import type { ExchangeResult, SessionView } from "../packages/renderer-plugin/src/session.js";

vi.mock("../packages/renderer-plugin/src/app-chat-runtime.js", () => ({ appChatEnvironment: vi.fn(), discoverAppChatRuntime: vi.fn() }));
const discover = vi.mocked(discoverAppChatRuntime);
const windows: Window[] = [];
const task = { hostId: "local", taskId: "recovery-test" };
const modelKey = JSON.stringify(["planner", "thinking", "extended"]);
const settings = { enabled: false, modelKey, maxRequests: null, replyTimeoutMinutes: null, cleanup: "retain" as const };
interface RecoveryStatus { instanceId: string; active: SessionView | null; connection: { state: string; stage: string; error: string | null; retryInMs: number }; [key: string]: unknown }
const status = async (): Promise<RecoveryStatus> => await invokeHostCommand("status", { task }) as RecoveryStatus;
async function exchange(requestId: string, message: string, instanceId?: string): Promise<ExchangeResult> {
  return await invokeHostCommand("exchange", { task, instanceId: instanceId ?? (await status()).instanceId, requestId, message }) as ExchangeResult;
}
afterEach(async () => { stop(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetAllMocks(); for (const window of windows.splice(0)) await window.happyDOM.abort(); });

function fixture(options: { enabled?: boolean; emptyModels?: boolean } = {}) {
  vi.useFakeTimers();
  const window = new Window({ url: "app://-/index.html" }); windows.push(window);
  window.document.documentElement.lang = "en"; vi.stubGlobal("document", window.document); vi.stubGlobal("location", window.location);
  const models = vi.fn(async () => ({ options: options.emptyModels ? [] : [{ slug: "planner", lane: "thinking", modelTitle: "Planner", selectedLabel: "High", thinkingEffort: "extended" }] }));
  const client = { models, get: vi.fn(async () => ({})), getConversationStreamStatus: vi.fn(async () => ({ status: "IN_PROGRESS" })),
    startCompletionStream: vi.fn(async (input: NativeCompletionInput) => { input.onRequestStart(); input.onUpdate({ conversationId: "owned-chat" }); }) ,
    delete: vi.fn(async () => ({})), rename: vi.fn(async () => ({})) };
  const runtime = { client, isCurrent: vi.fn(() => true) };
  discover.mockResolvedValue(runtime);
  const settingsRoot = window.document.createElement("section"); window.document.body.append(settingsRoot);
  const taskRecord = { version: 2, origin: "chosen", settings: { ...settings, enabled: options.enabled ?? false } };
  const storage = { get: vi.fn((key: string) => key === "collaboration-defaults-v2" ? settings : key === `task-preferences-v2:${JSON.stringify([task.hostId, task.taskId])}` ? taskRecord : null), set: vi.fn() };
  const api: LoaderApi = { version: "test", storage,
    settings: { registerPage: vi.fn(page => { page.render(settingsRoot); return { unregister: vi.fn(() => settingsRoot.replaceChildren()) }; }) } };
  return { window, runtime, client, api, settingsRoot, storage };
}

it("recovers a cold start without reload, and never sends while this task is disabled", async () => {
  const f = fixture(); discover.mockRejectedValueOnce(new BridgeError("APP_UNSUPPORTED", "Not mounted yet"));
  start(f.api); await vi.advanceTimersByTimeAsync(0);
  expect(await status()).toMatchObject({ connection: { state: "failed", stage: "discover", error: "APP_UNSUPPORTED" }, active: null });
  await vi.advanceTimersByTimeAsync(1000);
  expect(await status()).toMatchObject({ connection: { state: "ready", stage: "ready", error: null }, active: null });
  await expect(exchange("r1", "Begin")).rejects.toMatchObject({ code: "COLLABORATION_DISABLED" });
  expect(f.client.startCompletionStream).not.toHaveBeenCalled(); expect(discover).toHaveBeenCalledTimes(2);
  expect(f.api.settings?.registerPage).toHaveBeenCalledTimes(1);
});

it("bounds a stalled discovery, drops its late result after stop, and does not mount late UI", async () => {
  const f = fixture(); let resolveOld!: (value: typeof f.runtime) => void;
  discover.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
  start(f.api); await vi.advanceTimersByTimeAsync(15_000);
  expect(await status()).toMatchObject({ connection: { state: "failed", stage: "discover", error: "CHAT_CONNECT_TIMEOUT" } });
  stop(); resolveOld(f.runtime); await vi.advanceTimersByTimeAsync(60_000);
  expect(vi.getTimerCount()).toBe(0); expect(discover).toHaveBeenCalledTimes(1); expect(f.client.models).not.toHaveBeenCalled();
});

it("reports an empty Chat model list and never starts a session", async () => {
  const f = fixture({ enabled: true, emptyModels: true }); start(f.api); await vi.advanceTimersByTimeAsync(0);
  expect(await status()).toMatchObject({ connection: { state: "failed", stage: "models", error: "CHAT_MODELS_UNAVAILABLE" }, active: null });
  await expect(exchange("r1", "Review")).rejects.toMatchObject({ code: "CHAT_CONFIGURATION_REQUIRED" });
  expect(f.client.startCompletionStream).not.toHaveBeenCalled();
});

it("shares one in-flight discovery across manual refresh and exchanges", async () => {
  const f = fixture(); let resolve!: (value: typeof f.runtime) => void;
  discover.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  start(f.api); await vi.advanceTimersByTimeAsync(0);
  const instanceId = (await status()).instanceId;
  const first = exchange("r1", "Review", instanceId).catch(error => error);
  const diagnose = [...f.settingsRoot.querySelectorAll("button")].find(button => button.textContent === "Diagnose") as unknown as { click(): void };
  diagnose.click(); await vi.advanceTimersByTimeAsync(0);
  const second = exchange("r2", "Review", instanceId).catch(error => error);
  await vi.advanceTimersByTimeAsync(1000);
  expect(discover).toHaveBeenCalledTimes(1);
  resolve(f.runtime); await vi.advanceTimersByTimeAsync(0);
  await expect(first).resolves.toMatchObject({ code: "COLLABORATION_DISABLED" });
  await expect(second).resolves.toMatchObject({ code: "COLLABORATION_DISABLED" });
  expect(discover).toHaveBeenCalledTimes(1);
});

it("does not remount or start discovery if stopped before the startup microtask", async () => {
  const f = fixture(); start(f.api); stop(); await vi.advanceTimersByTimeAsync(0);
  expect(discover).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0); expect(f.api.settings?.registerPage).not.toHaveBeenCalled();
});

it("defers discovery while a task owns a live native session and never replays its request", async () => {
  const f = fixture({ enabled: true }); start(f.api); await vi.advanceTimersByTimeAsync(0);
  const request = exchange("r1", "Review the current design");
  await vi.advanceTimersByTimeAsync(20_000);
  expect(f.client.startCompletionStream).toHaveBeenCalledOnce();
  const current = await status(); expect(current.active).toMatchObject({ requestId: "r1", state: "waiting" });
  f.runtime.isCurrent.mockReturnValue(false);
  await vi.advanceTimersByTimeAsync(30_000);
  expect(discover).toHaveBeenCalledTimes(1); expect(f.client.startCompletionStream).toHaveBeenCalledOnce();
  await invokeHostCommand("finish", { task, sessionId: current.active!.sessionId, reason: "user-request", policy: "retain" });
  expect(await request).toMatchObject({ state: "waiting", requestId: "r1" });
  await vi.advanceTimersByTimeAsync(30_000);
  expect(discover.mock.calls.length).toBeGreaterThanOrEqual(2);
  expect(discover.mock.calls.length).toBeLessThan(6);
  expect(f.client.startCompletionStream).toHaveBeenCalledOnce();
});

it("cleans partial UI startup and retries after the accessory becomes available", async () => {
  const f = fixture(); const unregister = vi.fn(); f.api.settings!.registerPage = vi.fn(page => { page.render(f.settingsRoot); return { unregister }; });
  let fail = true;
  f.api.composer = { registerAccessory: spec => {
    if (fail) throw new BridgeError("COMPOSER_UNAVAILABLE", "Waiting for host composer.");
    const root = f.window.document.createElement("span"); f.window.document.body.append(root); spec.render(root as unknown as HTMLElement, task);
    return { getStatus: () => ({ available: true, ...task }), prepareContext: vi.fn(), clearContext: vi.fn(), unregister: () => root.remove() };
  } };
  start(f.api); await vi.advanceTimersByTimeAsync(0);
  expect(unregister).toHaveBeenCalledOnce(); expect(f.window.document.querySelectorAll("style")).toHaveLength(0);
  fail = false; await vi.advanceTimersByTimeAsync(1000);
  expect(await status()).toMatchObject({ connection: { state: "ready" }, compatibility: { composer: true } });
  expect(f.api.settings!.registerPage).toHaveBeenCalledTimes(2);
});
