import { expect, it, vi } from "vitest";
import { discoverAppChatRuntime } from "../packages/renderer-plugin/src/app-chat-runtime.js";
import { rspackCatalogExport } from "../packages/renderer-plugin/src/rspack-chat-runtime.js";
import { inspectCatalogBindings } from "../tools/check-rspack-catalog.js";

function fixture() {
  const transport = {}, catalog = {}, gizmo = {};
  const stream = { prepareCompletionStream() {}, createCompletionStreamHandlers() {}, startCompletionStream: vi.fn() };
  const http = { safeGet: vi.fn(), safePost: vi.fn(), safePatch: vi.fn(), safeDelete: vi.fn() };
  const fetch = vi.fn(async () => ({ options: [{ slug: "test" }] }));
  const factory = (source: string) => Object.assign(vi.fn(), { toString: () => source });
  const require = Object.assign(vi.fn(), {
    m: {
      transport: factory('x(e,t,n){n.d(t,{a:()=>G});var h=n("http");class U{prepareCompletionStream(){}createCompletionStreamHandlers(){}startCompletionStream(){}branch(){h.Request.safePost("/conversation/new_branch",{})}}let G=(0,i.vP)(u.u,({scope:e})=>new U(e));}'),
      models: factory('x(e,t,n){var h=n("http");let l=(0,r.RD)(i.u,()=>c("chat")),g=(0,r.RD)(i.u,()=>c("gizmo"));function c(e){return{queryFn:()=>h.Request.safeGet("/models",{}),queryKey:["chatgpt-models"]}}n.d(t,{},{a:l,b:g})}'),
    },
    c: { transport: { exports: { a: transport } }, models: { exports: { a: catalog, b: gizmo } }, http: { exports: { Request: http } } } as Record<string, { exports: unknown }>,
  });
  let current = stream;
  const scope = { get: (key: unknown) => { if (key !== transport) throw Error(); return current; },
    query: { snapshot: (key: unknown) => { if (key !== catalog) throw Error(); return { fetch }; } } };
  return { require, stream, http, fetch, replace: () => { current = { ...stream }; }, environment: {
    rendererUrl: "app://-/index.html", entryUrls: ["app://-/assets/123.abcdef.js"],
    root: { memoizedProps: { scope } },
    readSource: async () => 'export{r as __webpack_require__};',
    importModule: vi.fn(async () => ({ __webpack_require__: require })),
  } };
}

it("discovers cached Rspack services, selects chat models and tracks native instance replacement", async () => {
  const f = fixture();
  const runtime = await discoverAppChatRuntime(f.environment);
  expect(await runtime.client.models()).toEqual({ options: [{ slug: "test" }] });
  expect(f.fetch).toHaveBeenCalledOnce();
  expect(f.require).not.toHaveBeenCalled();
  expect(f.stream.startCompletionStream).not.toHaveBeenCalled();
  const input = { request: {}, onUpdate: vi.fn() };
  await runtime.client.startCompletionStream(input);
  expect(f.stream.startCompletionStream).toHaveBeenCalledExactlyOnceWith(input);
  await runtime.client.get("owned-chat");
  expect(f.http.safeGet).toHaveBeenCalledExactlyOnceWith("/conversation/{conversation_id}", { parameters: { path: { conversation_id: "owned-chat" } } });
  expect(runtime.isCurrent()).toBe(true);
  f.replace();
  expect(runtime.isCurrent()).toBe(false);
});

it("rejects ambiguous runtimes and catalogs without requesting models", async () => {
  const f = fixture();
  await expect(discoverAppChatRuntime({ ...f.environment, entryUrls: [...f.environment.entryUrls, "app://-/assets/456.abcdef.js"] })).rejects.toMatchObject({ code: "APP_UNSUPPORTED" });
  Object.assign(f.require.m, { duplicate: f.require.m.models });
  f.require.c.duplicate = f.require.c.models!;
  await expect(discoverAppChatRuntime(f.environment)).rejects.toMatchObject({ code: "APP_UNSUPPORTED" });
  expect(f.fetch).not.toHaveBeenCalled();
  expect(f.require).not.toHaveBeenCalled();
});

it("rejects missing cached services without executing module factories", async () => {
  const f = fixture();
  delete f.require.c.http;
  await expect(discoverAppChatRuntime(f.environment)).rejects.toMatchObject({ code: "APP_UNSUPPORTED" });
  expect(f.require).not.toHaveBeenCalled();
});

it("discovers a scope-aware chat model catalog without selecting gizmo or merged catalogs", async () => {
  const f = fixture();
  const source = String(f.require.m.models).replace('()=>c("chat")', '({scope:s})=>c(s,"chat")');
  f.require.m.models.toString = () => source;
  const runtime = await discoverAppChatRuntime(f.environment);
  expect(await runtime.client.models()).toEqual({ options: [{ slug: "test" }] });
  expect(f.fetch).toHaveBeenCalledOnce();
  expect(f.require).not.toHaveBeenCalled();
  expect(f.stream.startCompletionStream).not.toHaveBeenCalled();
});

it("the offline check uses the runtime matcher and rejects changed or ambiguous bindings", () => {
  const source = String(fixture().require.m.models);
  const scoped = source.replace('()=>c("chat")', '({scope:s})=>c(s,"chat")');
  for (const text of [source, scoped]) {
    expect(inspectCatalogBindings([`throw Error("must not execute");export const __webpack_modules__={${text}};`])).toBe(true);
    expect(rspackCatalogExport(text)).toBe("a");
  }
  const unsupported = scoped.replace('c(s,"chat")', 'c(other,"chat")');
  expect(inspectCatalogBindings([`export const __webpack_modules__={${unsupported}};`])).toBe(false);
  expect(rspackCatalogExport(unsupported)).toBeUndefined();
  expect(rspackCatalogExport(source + source)).toBeUndefined();
  expect(inspectCatalogBindings([`const modules={${source}};`, `const other={${scoped}};`])).toBe(false);
});
