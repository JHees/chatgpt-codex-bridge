import { appChatEnvironment, discoverAppChatRuntime } from "./app-chat-runtime.js";
import { AppChatBackgroundAdapter } from "./background-adapter.js";
import { ChatConfiguration } from "./chat-configuration.js";
import { CooperationController } from "./cooperation-controller.js";
import { BridgeUi, DEFAULTS_KEY, bundledSkillDiagnostics } from "./bridge-ui.js";
import type { LoaderApi } from "./loader-interface.js";
import { BridgeError } from "./errors.js";
import { commandResponseBytes } from "./protocol.js";

let controller: CooperationController | undefined;
let ui: BridgeUi | undefined;
let runtime: Awaited<ReturnType<typeof discoverAppChatRuntime>> | undefined;
let epoch = 0;
let ready: Promise<void> | undefined;
let backgroundError: string | null = null;
let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
let discoveryTimer: ReturnType<typeof setTimeout> | undefined;
let cancelDiscovery: (() => void) | undefined;
let recoveryState = "connecting";
let recoveryAttempts = 0;
let nextRecoveryAt = 0;

export function start(api: LoaderApi): void {
  if (globalThis.location?.href !== "app://-/index.html") throw new BridgeError("WRONG_RENDERER", "Bridge only runs in the Codex main renderer.");
  stop();
  const instance = epoch;
  let configuration: ChatConfiguration;
  try { configuration = new ChatConfiguration(api.storage.get(DEFAULTS_KEY) ?? api.storage.get("collaboration-defaults-v1") ?? undefined, api.storage); }
  catch { configuration = new ChatConfiguration(undefined, api.storage); backgroundError = "SAVED_CONFIGURATION_INVALID"; }
  let failures = 0;
  const schedule = (): void => {
    if (epoch !== instance) return;
    clearTimeout(recoveryTimer);
    const delay = runtime ? 30_000 : [1000, 2000, 5000, 10_000, 30_000, 60_000][Math.min(Math.max(0, failures - 1), 5)]!;
    nextRecoveryAt = Date.now() + delay;
    recoveryTimer = setTimeout(() => {
      recoveryTimer = undefined;
      if (epoch !== instance) return;
      if (controller?.hasActiveSession()) {
        recoveryState = runtime?.isCurrent() ? "ready" : "deferred";
        schedule(); // Keep the owned session; recovery never replays or discards work.
      } else if (runtime?.isCurrent()) { recoveryState = "ready"; schedule(); }
      else void refresh();
    }, delay);
  };
  const failed = (error: unknown): void => {
    configuration.updateCatalog({ options: [] }); runtime = undefined; failures++;
    backgroundError = error instanceof BridgeError ? error.code : "APP_UNSUPPORTED";
    recoveryState = "retrying";
    ui?.backgroundChanged(backgroundError, true);
  };
  const mountUi = (): void => {
    if (ui) return;
    const candidate = new BridgeUi(document, api, controller!, refresh);
    try { candidate.start(); ui = candidate; }
    catch (error) { candidate.stop(); throw error; }
  };
  const refresh = (): Promise<void> => {
    if (epoch !== instance) return Promise.resolve();
    if (ready) return ready;
    if (controller?.hasActiveSession()) { recoveryState = "deferred"; return Promise.resolve(); }
    clearTimeout(recoveryTimer); recoveryTimer = undefined; nextRecoveryAt = 0;
    recoveryState = "connecting"; recoveryAttempts++;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    ready = Promise.resolve().then(async () => {
      if (epoch !== instance) return;
      mountUi();
      const discovered = await Promise.race([
        (async () => {
          const found = await discoverAppChatRuntime(appChatEnvironment(document));
          if (cancelled || epoch !== instance) throw new BridgeError("SESSION_LOST", "Connection attempt was superseded.");
          return { found, catalog: await found.client.models() };
        })(),
        new Promise<never>((_, reject) => {
          cancelDiscovery = () => reject(new BridgeError("SESSION_LOST", "Connection attempt stopped."));
          timer = discoveryTimer = setTimeout(() => reject(new BridgeError("CHAT_CONNECT_TIMEOUT", "App Chat discovery timed out.")), 15_000);
        }),
      ]);
      if (epoch !== instance) return;
      if (!discovered.found.isCurrent()) throw new BridgeError("APP_UNSUPPORTED", "App services changed during connection.");
      configuration.updateCatalog(discovered.catalog);
      if (!configuration.models().length) throw new BridgeError("CHAT_MODELS_UNAVAILABLE", "The App model catalog is not ready.");
      runtime = discovered.found; failures = 0; backgroundError = null; recoveryState = "ready";
    }).catch(error => { if (epoch === instance) failed(error); }).finally(() => {
      cancelled = true;
      clearTimeout(timer);
      if (epoch !== instance) return;
      discoveryTimer = undefined; cancelDiscovery = undefined; ready = undefined;
      ui?.backgroundChanged(backgroundError, !runtime); schedule();
    });
    return ready;
  };
  controller = new CooperationController(configuration, bindingId => ui?.receipt(bindingId) ?? { state: "unavailable" }, () => {
    const selected = runtime;
    if (!selected?.isCurrent()) throw new BridgeError("APP_UNSUPPORTED", "Refresh and verify the native Chat capability before starting.");
    return new AppChatBackgroundAdapter(selected.client, selected.isCurrent);
  });
  try { mountUi(); }
  catch (error) { recoveryAttempts++; failed(error); schedule(); return; }
  void refresh();
}

export async function invokeHostCommand(operation: string, payload: unknown): Promise<unknown> {
  const active = controller;
  if (active === undefined) throw new BridgeError("PLUGIN_NOT_RUNNING", "Bridge plugin has not started.");
  if (new TextEncoder().encode(JSON.stringify(payload)).length > 60 * 1024) throw new BridgeError("REQUEST_TOO_LARGE", "Leave space for the Loader command envelope.");
  let result: unknown;
  if (operation === "status") result = { ...active.status(payload), compatibility: { ...bundledSkillDiagnostics(), ...ui?.compatibility(), background: runtime?.isCurrent() ?? false, backgroundError,
    backgroundRecovery: { state: recoveryState, attempts: recoveryAttempts, nextCheckInMs: Math.max(0, nextRecoveryAt - Date.now()) } } };
  else {
    if (operation === "exchange") await ready;
    if (active !== controller) throw new BridgeError("SESSION_LOST", "The plugin changed while the call was initializing.");
    if (operation === "exchange") result = await active.exchange(payload);
    else if (operation === "finish") result = await active.finish(payload);
    else throw new BridgeError("OPERATION_NOT_ALLOWED", "Bridge exposes only status, exchange and finish.");
  }
  if (commandResponseBytes(result) > 60 * 1024) throw new BridgeError("RESULT_TOO_LARGE", "The result exceeds the safe command envelope size.");
  return result;
}

export function stop(): void {
  epoch++;
  clearTimeout(recoveryTimer); clearTimeout(discoveryTimer);
  cancelDiscovery?.(); cancelDiscovery = undefined;
  recoveryTimer = undefined; discoveryTimer = undefined; nextRecoveryAt = 0; recoveryAttempts = 0; recoveryState = "stopped";
  ui?.stop(); ui = undefined;
  controller?.stop();
  controller = undefined;
  runtime = undefined; ready = undefined; backgroundError = null;
}
