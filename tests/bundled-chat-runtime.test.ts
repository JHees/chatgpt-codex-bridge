import { expect, it, vi } from "vitest";
import { discoverAppChatRuntime } from "../packages/renderer-plugin/src/app-chat-runtime.js";

// Minimal observed Rolldown output; hashes and export aliases deliberately
// differ from the desktop build. The old standalone client no longer exists.
const bundledSource = 'transportClass=class{prepareCompletionStream(){}createCompletionStreamHandlers(){}startCompletionStream(){}branch(){return http.safePost(`/conversation/new_branch`,{})}},transportState=scopeValue(app,({scope:s})=>new transportClass(s));catalogState=query(app,()=>({placeholderData:empty,queryFn:()=>http.safeGet(`/models`,{parameters:{query:{iim:!1,include_icons:!1}}}).then(normalize),queryKey:[`chatgpt-models`]}));export{transportState as a,http as b,catalogState as c};';

function fixture(source = bundledSource) {
  const stream = { startCompletionStream: vi.fn(async (input: unknown) => input), prepareCompletionStream() {}, createCompletionStreamHandlers() {} };
  const http = { safeGet: vi.fn(async () => ({})), safePost: vi.fn(async () => ({})), safePatch: vi.fn(async () => ({})), safeDelete: vi.fn(async () => ({})) };
  const transport = {}, catalog = {};
  const fetchModels = vi.fn(async () => ({ options: [] }));
  let current = stream;
  const scope = { get: (key: unknown) => { if (key !== transport) throw Error("Unexpected descriptor"); return current; },
    query: { snapshot: (key: unknown) => { expect(key).toBe(catalog); return { fetch: fetchModels }; } } };
  const readSource = vi.fn(async (url: string) => url.includes("app-initial") ? source : 'import "./app-initial-new.js";');
  const importModule = vi.fn(async () => ({ a: transport, b: http, c: catalog }));
  return { stream, http, fetchModels, scope, replace: () => { current = { ...stream }; }, environment: {
    rendererUrl: "app://-/index.html", entryUrls: ["app://-/assets/index-new.js"],
    root: { memoizedProps: { scope } }, readSource, importModule,
  } };
}

it("discovers bundled native services and reads the native normalized model query", async () => {
  const f = fixture();
  const runtime = await discoverAppChatRuntime(f.environment);
  expect(f.environment.importModule).toHaveBeenCalledExactlyOnceWith("app://-/assets/app-initial-new.js");
  expect(f.fetchModels).not.toHaveBeenCalled();
  expect(f.stream.startCompletionStream).not.toHaveBeenCalled();
  expect(await runtime.client.models()).toEqual({ options: [] });
  expect(f.fetchModels).toHaveBeenCalledOnce();
  expect(runtime.isCurrent()).toBe(true);
  f.replace();
  expect(runtime.isCurrent()).toBe(false);
});

it("adapts existing stream callbacks and native conversation routes without a second transport", async () => {
  const f = fixture();
  const { client } = await discoverAppChatRuntime(f.environment);
  const input = { request: { messages: [] }, onUpdate: vi.fn(), onComplete: vi.fn() };
  await client.startCompletionStream(input);
  expect(f.stream.startCompletionStream).toHaveBeenCalledExactlyOnceWith(input);
  await client.get("owned-chat");
  await client.getConversationStreamStatus("owned-chat");
  const parameters = { path: { conversation_id: "owned-chat" } };
  expect(f.http.safeGet.mock.calls).toEqual([
    ["/conversation/{conversation_id}", { parameters }],
    ["/conversation/{conversation_id}/stream_status", { parameters }],
  ]);
  await client.rename!("owned-chat", "Chat_Codex");
  await client.setArchived!("owned-chat", true);
  await client.delete("owned-chat");
  expect(f.http.safePost).toHaveBeenCalledExactlyOnceWith("/conversation/id/{conversation_id}/rename", { parameters, requestBody: { title: "Chat_Codex" } });
  expect(f.http.safePatch).toHaveBeenCalledExactlyOnceWith("/conversation/{conversation_id}", { parameters, requestBody: { is_archived: true } });
  expect(f.http.safeDelete).toHaveBeenCalledExactlyOnceWith("/conversation/id/{conversation_id}", { parameters });
});

it("rejects missing and ambiguous bundled bindings before importing or sending", async () => {
  for (const source of [bundledSource.replace("catalogState as c", "unrelated as c"), bundledSource + bundledSource]) {
    const f = fixture(source);
    await expect(discoverAppChatRuntime(f.environment)).rejects.toMatchObject({ code: "APP_UNSUPPORTED" });
    expect(f.stream.startCompletionStream).not.toHaveBeenCalled();
  }
});

it("rejects different stream instances in outer App scopes", async () => {
  const f = fixture();
  const root = { ...f.environment.root, sibling: { memoizedProps: { scope: { ...f.scope, get: () => ({ ...f.stream }) } } } };
  await expect(discoverAppChatRuntime({ ...f.environment, root })).rejects.toMatchObject({ code: "APP_UNSUPPORTED" });
});
