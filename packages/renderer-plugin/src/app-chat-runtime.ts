import { BridgeError } from "./errors.js";
import { discoverBundledChatRuntime } from "./bundled-chat-runtime.js";

export interface AppChatClient {
  models(): Promise<unknown>;
  get(id: string): Promise<unknown>;
  startCompletionStream(input: unknown): Promise<unknown>;
  getConversationStreamStatus(id: string): Promise<unknown>;
  delete(id: string): Promise<unknown>;
  rename?(id: string, title: string): Promise<unknown>;
  setArchived?(id: string, archived: boolean): Promise<unknown>;
}

/** App resources and React state are external dependencies, never a second CDP client. */
export interface AppChatEnvironment {
  rendererUrl: string;
  entryUrls: readonly string[];
  root: unknown;
  currentRoot?(): unknown;
  readSource(url: string): Promise<string>;
  importModule(url: string): Promise<unknown>;
}

export interface Scope {
  query: unknown;
  get(key: unknown): unknown;
}

const MAX_SOURCE_BYTES = 24 * 1024 * 1024;
const MAX_SOURCES = 8;
const assetPattern = /^app:\/\/-\/assets\/[A-Za-z0-9_-]+\.js$/;
const clientPattern = /^chatgpt-conversation-client-[A-Za-z0-9_-]+\.js$/;
const initialPattern = /^app-initial-[A-Za-z0-9_-]+\.js$/;

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

function scopesFrom(root: unknown): Set<Scope> {
  const scopes = new Set<Scope>();
  const seen = new Set<unknown>();
  const pending: unknown[] = [root];
  let found: boolean;
  const consider = (value: unknown): void => {
    const candidate = object(value);
    if (candidate !== undefined && typeof candidate.get === "function" && candidate.query !== undefined) { scopes.add(candidate as unknown as Scope); found = true; }
  };
  while (pending.length > 0 && seen.size < 5000) {
    const next = pending.pop();
    const node = object(next);
    if (node === undefined || seen.has(next)) continue;
    seen.add(next);
    found = false;
    pending.push(node.sibling);
    consider(object(node.memoizedProps)?.scope);
    let hook = object(node.memoizedState);
    for (let depth = 0; hook !== undefined && depth < 40; depth += 1) {
      const value = hook.memoizedState;
      consider(value);
      consider(object(value)?.current);
      consider(object(value)?.scope);
      hook = object(hook.next);
    }
    // Resolve through outer App scopes, not route-local descendants or a visible composer.
    if (!found) pending.push(node.child);
  }
  if (pending.length > 0) throw new BridgeError("APP_UNSUPPORTED", "App state discovery exceeded its bounded search.");
  return scopes;
}

function asClient(value: unknown): AppChatClient | undefined {
  const candidate = object(value);
  const methods = ["models", "get", "startCompletionStream", "getConversationStreamStatus", "delete"];
  return candidate !== undefined && methods.every(key => typeof candidate[key] === "function") ? candidate as unknown as AppChatClient : undefined;
}

export async function discoverAppChatRuntime(environment: AppChatEnvironment): Promise<{
  client: AppChatClient;
  isCurrent(): boolean;
}> {
  if (environment.rendererUrl !== "app://-/index.html") throw new BridgeError("WRONG_RENDERER", "Bridge requires the exact App main renderer.");
  const queue = [...new Set(environment.entryUrls.filter(url => assetPattern.test(url)))];
  if (queue.length === 0 || queue.length > MAX_SOURCES) throw new BridgeError("APP_UNSUPPORTED", "App entry resources could not be identified uniquely within limits.");
  const visited = new Set<string>();
  const clients = new Set<string>();
  const bundledSources = new Map<string, string>();
  let bytes = 0;
  while (queue.length > 0) {
    const url = queue.shift()!;
    if (visited.has(url)) continue;
    if (visited.size >= MAX_SOURCES) throw new BridgeError("APP_UNSUPPORTED", "App resource discovery exceeded its bounded search.");
    visited.add(url);
    const basename = url.slice(url.lastIndexOf("/") + 1);
    if (clientPattern.test(basename)) { clients.add(url); continue; }
    let source: string;
    try { source = await environment.readSource(url); }
    catch { throw new BridgeError("APP_UNSUPPORTED", "An App resource could not be read."); }
    bytes += new TextEncoder().encode(source).length;
    if (bytes > MAX_SOURCE_BYTES) throw new BridgeError("APP_UNSUPPORTED", "App resources exceeded the discovery size limit.");
    if (initialPattern.test(basename)) bundledSources.set(url, source);
    // Follow only local, literal references in the observed entry graph; never evaluate source text.
    for (const match of source.matchAll(/["'`]\.\/([A-Za-z0-9_-]+\.js)["'`]/g)) {
      const name = match[1]!;
      if (clientPattern.test(name)) clients.add(`app://-/assets/${name}`);
      else if (initialPattern.test(name)) queue.push(`app://-/assets/${name}`);
    }
  }
  if (clients.size === 0) return discoverBundledChatRuntime(environment, bundledSources,
    () => scopesFrom(environment.currentRoot ? environment.currentRoot() : environment.root));
  if (clients.size !== 1) throw new BridgeError("APP_UNSUPPORTED", "Exactly one referenced App Chat client module is required.");
  let module: Record<string, unknown> | undefined;
  try { module = object(await environment.importModule([...clients][0]!)); }
  catch { throw new BridgeError("APP_UNSUPPORTED", "The App Chat client module could not be loaded."); }
  const descriptor = module?.chatGPTConversationClient$;
  if (descriptor === undefined) throw new BridgeError("APP_UNSUPPORTED", "The App Chat client descriptor is unavailable.");
  const resolve = (): Set<AppChatClient> => {
    const result = new Set<AppChatClient>();
    for (const scope of scopesFrom(environment.currentRoot ? environment.currentRoot() : environment.root)) {
      try { const client = asClient(scope.get(descriptor)); if (client !== undefined) result.add(client); }
      catch { /* Not every mounted App scope supplies the Chat client. */ }
    }
    return result;
  };
  const instances = resolve();
  if (instances.size !== 1) throw new BridgeError("APP_UNSUPPORTED", "Exactly one App-owned Chat client instance is required.");
  const client = [...instances][0]!;
  return {
    client,
    // Client identity only. Account binding is a separate acceptance requirement.
    isCurrent() { try { const current = resolve(); return current.size === 1 && current.has(client); } catch { return false; } },
  };
}

/** Capture only the native React root; never inspect a draft or depend on the active route. */
export function appChatEnvironment(document: Document): AppChatEnvironment {
  const currentRoot = (): unknown => {
    const roots = document.querySelectorAll("#root");
    if (roots.length !== 1) throw new BridgeError("APP_UNSUPPORTED", "The App root is unavailable or ambiguous.");
    const element = roots[0]!;
    const keys = Object.getOwnPropertyNames(element).filter(key => key.startsWith("__reactContainer$"));
    if (keys.length !== 1) throw new BridgeError("APP_UNSUPPORTED", "The native App root cannot be identified.");
    const container = object((element as unknown as Record<string, unknown>)[keys[0]!]);
    const root = object(container?.stateNode)?.current;
    if (!object(root)) throw new BridgeError("APP_UNSUPPORTED", "The native App root is not mounted.");
    return root;
  };
  return {
    rendererUrl: document.location.href,
    entryUrls: [...document.scripts].map(script => script.src),
    root: currentRoot(), currentRoot,
    async readSource(url) {
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error("App resource unavailable");
      return await response.text();
    },
    importModule: url => import(/* @vite-ignore */ url) as Promise<unknown>,
  };
}
