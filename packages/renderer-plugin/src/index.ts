import { BridgeController } from "./controller.js";
import { AppChatDomAdapter } from "./dom-adapter.js";
import { BridgeError } from "./errors.js";

let controller: BridgeController | undefined;

export function start(): void {
  if (globalThis.location?.href !== "app://-/index.html") throw new BridgeError("WRONG_RENDERER", "Bridge only runs in the Codex main renderer.");
  controller = new BridgeController(new AppChatDomAdapter(document));
}

export async function invokeHostCommand(operation: string, payload: unknown): Promise<unknown> {
  const active = controller;
  if (active === undefined) throw new BridgeError("PLUGIN_NOT_RUNNING", "Bridge plugin has not started.");
  if (operation === "exchange") return await active.exchange(payload);
  if (operation === "finish") return await active.finish(payload);
  throw new BridgeError("OPERATION_NOT_ALLOWED", "Bridge exposes only exchange and finish.");
}

export function stop(): void {
  controller?.reset();
  controller = undefined;
}
