import type { AppChatEnvironment, Scope } from "./app-chat-runtime.js";
import { bindNativeChatRuntime } from "./bundled-chat-runtime.js";
import { BridgeError } from "./errors.js";

function unsupported(): never { throw new BridgeError("APP_UNSUPPORTED", "The cached App Chat services could not be identified uniquely."); }

/** Read the exported runtime's cache; never execute factories or create a second service. */
export async function discoverRspackChatRuntime(environment: AppChatEnvironment, entries: string[], scopes: () => Set<Scope>) {
  if (entries.length !== 1) unsupported();
  const module = await environment.importModule(entries[0]!) as { __webpack_require__?: { m?: Record<string, unknown>; c?: Record<string, { exports?: Record<string, unknown> }> } };
  const runtime = module?.__webpack_require__;
  if (!runtime?.m || !runtime.c) unsupported();
  const factories = Object.entries(runtime.m);
  if (factories.length > 30_000) unsupported();
  const transports: unknown[] = [], catalogs: unknown[] = [], clients: Record<string, unknown>[] = [];
  let bytes = 0;
  for (const [id, factory] of factories) {
    const exports = runtime.c[id]?.exports;
    if (!exports || typeof factory !== "function") continue;
    const source = String(factory);
    bytes += source.length;
    if (bytes > 64 * 1024 * 1024) unsupported();
    const transport = ["prepareCompletionStream(", "createCompletionStreamHandlers(", "startCompletionStream("].every(marker => source.includes(marker));
    const catalog = source.includes('"chatgpt-models"') && source.includes('.safeGet("/models"');
    if (!transport && !catalog) continue;
    const http = source.match(/([\w$]+)\.Request\.safe(?:Post|Get)\("\/(?:conversation\/new_branch|models)"/)?.[1];
    const dependency = [...source.matchAll(/([\w$]+)=[\w$]+\("([^"\s]+)"\)/g)].find(match => match[1] === http)?.[2];
    const request = dependency ? runtime.c[dependency]?.exports?.Request : undefined;
    if (!request || typeof request !== "object") unsupported();
    clients.push(request as Record<string, unknown>);
    if (transport) {
      const local = source.match(/([\w$]+)=\(0,[\w$.]+\)\([\w$.]+,\(\{scope:([\w$]+)\}\)=>new [\w$]+\(\2\)\)/)?.[1];
      const alias = [...source.matchAll(/([\w$]+):\(\)=>([\w$]+)/g)].filter(match => match[2] === local);
      if (alias.length !== 1) unsupported();
      transports.push(exports[alias[0]![1]!]);
    }
    if (catalog) {
      const local = source.match(/([\w$]+)=\(0,[\w$.]+\)\([\w$.]+,\(\)=>[\w$]+\("chat"\)\)/)?.[1];
      const alias = [...source.matchAll(/([\w$]+):(?:\(\)=>)?([\w$]+)(?=[,}])/g)].filter(match => match[2] === local);
      if (alias.length !== 1) unsupported();
      catalogs.push(exports[alias[0]![1]!]);
    }
  }
  if (transports.length !== 1 || catalogs.length !== 1 || new Set(clients).size !== 1) unsupported();
  return bindNativeChatRuntime(transports[0], catalogs[0], clients[0], scopes);
}
