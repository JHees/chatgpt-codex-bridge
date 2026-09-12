import type { AppChatClient, AppChatEnvironment, Scope } from "./app-chat-runtime.js";
import { BridgeError } from "./errors.js";

interface Bindings { transport: string; http: string; catalog: string }
interface StreamClient { startCompletionStream(input: unknown): Promise<unknown> }
interface NativeHttp {
  safeGet(path: string, options: unknown): Promise<unknown>;
  safePost(path: string, options: unknown): Promise<unknown>;
  safePatch(path: string, options: unknown): Promise<unknown>;
  safeDelete(path: string, options: unknown): Promise<unknown>;
}
interface Catalog { fetch(): Promise<unknown> }

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : undefined;
}
function unsupported(): never { throw new BridgeError("APP_UNSUPPORTED", "The bundled App Chat services could not be identified uniquely."); }

/** Follow relationships in the observed bundle; never pin a hash/minified name
 * or evaluate source text. Only explicitly exported native values are used. */
function bindings(source: string): Bindings | undefined {
  const exports = [...source.matchAll(/\bexport\s*\{([^{}]+)\}/g)];
  if (exports.length !== 1) return;
  const aliases = exports[0]![1]!.split(",").map(value => value.trim().split(/\s+as\s+/));
  const exported = (name: string | undefined): string | undefined => {
    const names = aliases.filter(([local]) => local === name);
    return names.length === 1 ? names[0]!.at(-1) : undefined;
  };
  const candidates: Bindings[] = [];
  for (const match of source.matchAll(/([\w$]+)=[\w$]+\([\w$]+,\(\{scope:([\w$]+)\}\)=>new ([\w$]+)\(\2\)\)/g)) {
    const start = source.lastIndexOf(`${match[3]}=class{`, match.index);
    if (start < 0 || match.index - start > 40_000) continue;
    const body = source.slice(start, match.index);
    if (!["prepareCompletionStream(", "createCompletionStreamHandlers(", "startCompletionStream("].every(marker => body.includes(marker))) continue;
    const httpName = body.match(/([\w$]+)\.safePost\(`\/conversation\/new_branch`/)?.[1];
    const catalogs = [...source.matchAll(/([\w$]+)=[\w$]+\([\w$]+,\(\)=>\(\{placeholderData:[\w$]+,queryFn:\(\)=>([\w$]+)\.safeGet\(`\/models`,[^;]{0,300}?queryKey:\[`chatgpt-models`\]/g)]
      .filter(entry => entry[2] === httpName);
    const transport = exported(match[1]), http = exported(httpName), catalog = catalogs.length === 1 ? exported(catalogs[0]![1]) : undefined;
    if (transport && http && catalog) candidates.push({ transport, http, catalog });
  }
  return candidates.length === 1 ? candidates[0] : undefined;
}

export async function discoverBundledChatRuntime(environment: AppChatEnvironment, sources: Map<string, string>, scopes: () => Set<Scope>): Promise<{ client: AppChatClient; isCurrent(): boolean }> {
  const candidates = [...sources].flatMap(([url, source]) => { const found = bindings(source); return found ? [{ url, ...found }] : []; });
  if (candidates.length !== 1) unsupported();
  const selected = candidates[0]!;
  let module: Record<string, unknown> | undefined;
  try { module = object(await environment.importModule(selected.url)); } catch { unsupported(); }
  const descriptor = module?.[selected.transport], catalogDescriptor = module?.[selected.catalog];
  const rawHttp = object(module?.[selected.http]);
  if (descriptor === undefined || catalogDescriptor === undefined || !rawHttp || !["safeGet", "safePost", "safePatch", "safeDelete"].every(key => typeof rawHttp[key] === "function")) unsupported();
  const http = rawHttp as unknown as NativeHttp;
  const resolve = (): Map<StreamClient, Catalog> => {
    const results = new Map<StreamClient, Catalog>();
    for (const scope of scopes()) {
      try {
        const stream = object(scope.get(descriptor));
        if (!stream || !["startCompletionStream", "prepareCompletionStream", "createCompletionStreamHandlers"].every(key => typeof stream[key] === "function")) continue;
        const query = scope.query as { snapshot(key: unknown): unknown };
        const catalog = object(query.snapshot(catalogDescriptor));
        if (typeof catalog?.fetch !== "function") continue;
        results.set(stream as unknown as StreamClient, catalog as unknown as Catalog);
      } catch { /* Only a mounted App scope can supply these services. */ }
    }
    return results;
  };
  const instances = resolve();
  if (instances.size !== 1) unsupported();
  const [stream, catalog] = [...instances][0]!;
  const parameters = (id: string) => ({ path: { conversation_id: id } });
  return {
    client: {
      models: () => catalog.fetch(),
      get: id => http.safeGet("/conversation/{conversation_id}", { parameters: parameters(id) }),
      getConversationStreamStatus: id => http.safeGet("/conversation/{conversation_id}/stream_status", { parameters: parameters(id) }),
      startCompletionStream: input => stream.startCompletionStream(input),
      delete: id => http.safeDelete("/conversation/id/{conversation_id}", { parameters: parameters(id) }),
      rename: (id, title) => http.safePost("/conversation/id/{conversation_id}/rename", { parameters: parameters(id), requestBody: { title } }),
      setArchived: (id, archived) => http.safePatch("/conversation/{conversation_id}", { parameters: parameters(id), requestBody: { is_archived: archived } }),
    },
    isCurrent() { try { const current = resolve(); return current.size === 1 && current.has(stream); } catch { return false; } },
  };
}
