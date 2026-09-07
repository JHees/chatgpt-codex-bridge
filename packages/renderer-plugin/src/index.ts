import { appChatEnvironment, discoverAppChatRuntime } from "./app-chat-runtime.js";
import { AppChatBackgroundAdapter } from "./background-adapter.js";
import { ChatConfiguration } from "./chat-configuration.js";
import { CooperationController } from "./cooperation-controller.js";
import { BridgeUi, DEFAULTS_KEY } from "./bridge-ui.js";
import type { LoaderApi } from "./loader-interface.js";
import { BridgeError } from "./errors.js";

let controller: CooperationController | undefined;
let ui: BridgeUi | undefined;
let runtime: Awaited<ReturnType<typeof discoverAppChatRuntime>> | undefined;
let epoch = 0;
let ready: Promise<void> | undefined;
let backgroundError: string | null = null;
let refreshSequence = 0;

export function start(api: LoaderApi): void {
  if (globalThis.location?.href !== "app://-/index.html") throw new BridgeError("WRONG_RENDERER", "Bridge only runs in the Codex main renderer.");
  stop();
  const instance = epoch;
  let configuration: ChatConfiguration;
  try { configuration = new ChatConfiguration(api.storage.get(DEFAULTS_KEY) ?? undefined); }
  catch { configuration = new ChatConfiguration(); backgroundError = "SAVED_CONFIGURATION_INVALID"; }
  const refresh = async (): Promise<void> => {
    const sequence = ++refreshSequence;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const discovered = await discoverAppChatRuntime(appChatEnvironment(document));
      const catalog = await Promise.race([discovered.client.models(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new BridgeError("CHAT_CATALOG_TIMEOUT", "Chat model discovery timed out.")), 10_000);
      })]);
      if (epoch !== instance || sequence !== refreshSequence) return;
      configuration.updateCatalog(catalog);
      runtime = discovered; backgroundError = null;
    } catch (error) {
      if (epoch !== instance || sequence !== refreshSequence) return;
      configuration.updateCatalog({ options: [] }); runtime = undefined;
      backgroundError = error instanceof BridgeError ? error.code : "APP_UNSUPPORTED";
      throw new BridgeError(backgroundError, "Background Chat is unavailable; no foreground fallback will be used.");
    } finally {
      clearTimeout(timer);
      if (epoch === instance && sequence === refreshSequence) ui?.backgroundChanged(backgroundError);
    }
  };
  controller = new CooperationController(configuration, bindingId => ui?.receipt(bindingId) ?? { state: "unavailable" }, () => {
    const selected = runtime;
    if (!selected?.isCurrent()) throw new BridgeError("APP_UNSUPPORTED", "Refresh and verify the native Chat capability before starting.");
    return new AppChatBackgroundAdapter(selected.client, selected.isCurrent);
  });
  ui = new BridgeUi(document, api, controller, refresh);
  try { ui.start(); }
  catch (error) { stop(); throw error; }
  ready = refresh().catch(() => { /* Settings and status remain available when the private App interface is unsupported. */ });
}

export async function invokeHostCommand(operation: string, payload: unknown): Promise<unknown> {
  const active = controller;
  if (active === undefined) throw new BridgeError("PLUGIN_NOT_RUNNING", "Bridge plugin has not started.");
  if (new TextEncoder().encode(JSON.stringify(payload)).length > 60 * 1024) throw new BridgeError("REQUEST_TOO_LARGE", "Leave space for the Loader command envelope.");
  if (operation === "status") return { ...active.status(payload), compatibility: { ...ui?.compatibility(), background: runtime?.isCurrent() ?? false, backgroundError, bundledSkill: "loader-managed-unverified" } };
  if (operation === "exchange") await ready;
  if (active !== controller) throw new BridgeError("SESSION_LOST", "The plugin changed while the call was initializing.");
  if (operation === "exchange") return await active.exchange(payload);
  if (operation === "finish") return await active.finish(payload);
  throw new BridgeError("OPERATION_NOT_ALLOWED", "Bridge exposes only status, exchange and finish.");
}

export function stop(): void {
  epoch++;
  ui?.stop(); ui = undefined;
  controller?.stop();
  controller = undefined;
  runtime = undefined; ready = undefined; backgroundError = null;
}
