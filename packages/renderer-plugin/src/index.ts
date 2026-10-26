import { appChatEnvironment, discoverAppChatRuntime } from "./app-chat-runtime.js";
import { AppChatBackgroundAdapter } from "./background-adapter.js";
import { ChatConfiguration } from "./chat-configuration.js";
import { BridgeSession, commandResponseBytes } from "./session.js";
import { BridgeUi, DEFAULTS_KEY, bundledSkillDiagnostics } from "./bridge-ui.js";
import type { LoaderApi } from "./loader-interface.js";
import { BridgeError } from "./errors.js";

let session: BridgeSession | undefined;
let ui: BridgeUi | undefined;
let runtime: Awaited<ReturnType<typeof discoverAppChatRuntime>> | undefined;
let epoch = 0;
let connecting: Promise<void> | undefined;
let cancelConnection: (() => void) | undefined;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let nextRetryAt = 0;
let connectionError: string | null = null;
let connectionStage: "discover" | "models" | "ready" = "discover";

export function start(api: LoaderApi): void {
  if (globalThis.location?.href !== "app://-/index.html") throw new BridgeError("WRONG_RENDERER", "Bridge only runs in the Codex main renderer.");
  stop();
  const instance = epoch;
  let configuration: ChatConfiguration;
  try { configuration = new ChatConfiguration(api.storage.get(DEFAULTS_KEY) ?? api.storage.get("collaboration-defaults-v1") ?? undefined, api.storage); }
  catch { configuration = new ChatConfiguration(undefined, api.storage); connectionError = "SAVED_CONFIGURATION_INVALID"; }
  let failures = 0;
  const schedule = (): void => {
    if (epoch !== instance) return;
    clearTimeout(retryTimer);
    const delay = runtime ? 30_000 : [1000, 5000, 30_000][Math.min(Math.max(0, failures - 1), 2)]!;
    nextRetryAt = Date.now() + delay;
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      if (epoch !== instance) return;
      if (session?.hasActiveSession() || runtime?.isCurrent()) schedule();
      else void refresh();
    }, delay);
  };
  const mountUi = (): void => {
    if (ui) return;
    const candidate = new BridgeUi(document, api, session!, refresh);
    try { candidate.start(); ui = candidate; }
    catch (error) { candidate.stop(); throw error; }
  };
  const refresh = (): Promise<void> => {
    if (epoch !== instance || session?.hasActiveSession()) return Promise.resolve();
    if (connecting) return connecting;
    clearTimeout(retryTimer); nextRetryAt = 0;
    connectionStage = "discover";
    let timer: ReturnType<typeof setTimeout> | undefined;
    let expired = false;
    connecting = Promise.resolve().then(async () => {
      if (epoch !== instance) return;
      mountUi();
      const result = await Promise.race([
        (async () => {
          const found = await discoverAppChatRuntime(appChatEnvironment(document));
          if (expired || epoch !== instance) throw new BridgeError("SESSION_LOST", "Connection attempt stopped.");
          connectionStage = "models";
          return { found, catalog: await found.client.models() };
        })(),
        new Promise<never>((_, reject) => {
          cancelConnection = () => reject(new BridgeError("SESSION_LOST", "Connection attempt stopped."));
          timer = setTimeout(() => reject(new BridgeError("CHAT_CONNECT_TIMEOUT", "Chat connection did not become ready within 15 seconds.")), 15_000);
        }),
      ]);
      if (epoch !== instance) return;
      if (!result.found.isCurrent()) throw new BridgeError("APP_UNSUPPORTED", "The native Chat service changed during connection.");
      configuration.updateCatalog(result.catalog);
      if (!configuration.models().length) throw new BridgeError("CHAT_MODELS_UNAVAILABLE", "The native Chat model list is empty.");
      runtime = result.found; failures = 0; connectionError = null; connectionStage = "ready";
    }).catch(error => {
      if (epoch !== instance) return;
      runtime = undefined; configuration.updateCatalog({ options: [] }); failures++;
      connectionError = error instanceof BridgeError ? error.code : "APP_UNSUPPORTED";
    }).finally(() => {
      expired = true; clearTimeout(timer);
      if (epoch !== instance) return;
      connecting = undefined; cancelConnection = undefined;
      ui?.backgroundChanged(connectionError, !runtime); schedule();
    });
    return connecting;
  };
  session = new BridgeSession(configuration, () => {
    const selected = runtime;
    if (!selected?.isCurrent()) throw new BridgeError(connectionError ?? "APP_UNSUPPORTED", "The native Chat connection is unavailable. Refresh it in Bridge settings.");
    return new AppChatBackgroundAdapter(selected.client, selected.isCurrent);
  });
  void refresh();
}

export async function invokeHostCommand(operation: string, payload: unknown): Promise<unknown> {
  const active = session;
  if (!active) throw new BridgeError("PLUGIN_NOT_RUNNING", "Bridge plugin has not started.");
  if (new TextEncoder().encode(JSON.stringify(payload)).length > 60 * 1024) throw new BridgeError("REQUEST_TOO_LARGE", "The command exceeds its byte limit.");
  let result: unknown;
  if (operation === "status") {
    const connected = runtime?.isCurrent() ?? false;
    result = { ...active.status(payload), protocolVersion: 2, models: active.configuration.models(),
      connection: { state: connected ? "ready" : connecting ? "connecting" : "failed", stage: connectionStage,
        error: connected ? null : connectionError, retryInMs: Math.max(0, nextRetryAt - Date.now()) },
      compatibility: { ...bundledSkillDiagnostics(), ...ui?.compatibility(), background: connected, backgroundError: connected ? null : connectionError } };
  } else if (operation === "exchange") {
    await connecting;
    if (active !== session) throw new BridgeError("SESSION_LOST", "The plugin changed while connecting.");
    result = await active.exchange(payload);
  } else if (operation === "finish") result = await active.finish(payload);
  else throw new BridgeError("OPERATION_NOT_ALLOWED", "Bridge exposes only status, exchange and finish.");
  if (commandResponseBytes(result) > 60 * 1024) throw new BridgeError("RESULT_TOO_LARGE", "The result exceeds the command response limit.");
  return result;
}

export function stop(): void {
  epoch++;
  clearTimeout(retryTimer); retryTimer = undefined; nextRetryAt = 0;
  cancelConnection?.(); cancelConnection = undefined;
  ui?.stop(); ui = undefined;
  session?.stop(); session = undefined;
  runtime = undefined; connecting = undefined; connectionError = null; connectionStage = "discover";
}
