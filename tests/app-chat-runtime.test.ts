import { expect, it } from "vitest";
import { discoverAppChatRuntime, type AppChatEnvironment } from "../packages/renderer-plugin/src/app-chat-runtime.js";

it("discovers the App-owned client after resource hashes change without a page or model request", async () => {
  const descriptor = {};
  const client = {
    models: async () => ({ options: [] }), get: async () => ({}),
    startCompletionStream: async () => {}, getConversationStreamStatus: async () => ({}), delete: async () => {},
  };
  const scope = { query: {}, get: (key: unknown) => { expect(key).toBe(descriptor); return client; } };
  const sources: Record<string, string> = {
    "app://-/assets/index-new.js": 'import "./app-initial-new.js";',
    "app://-/assets/app-initial-new.js": 'import("./chatgpt-conversation-client-new.js")',
  };
  const runtime = await discoverAppChatRuntime({
    rendererUrl: "app://-/index.html",
    entryUrls: ["app://-/assets/index-new.js"],
    root: { memoizedProps: { scope } },
    readSource: async url => { if (!(url in sources)) throw Error("Unexpected source"); return sources[url]!; },
    importModule: async url => { expect(url).toBe("app://-/assets/chatgpt-conversation-client-new.js"); return { chatGPTConversationClient$: descriptor }; },
  });
  expect(runtime.client).toBe(client);
  expect(runtime.isCurrent()).toBe(true);
});

function environment(): AppChatEnvironment {
  return {
    rendererUrl: "app://-/index.html",
    entryUrls: ["app://-/assets/index-test.js"],
    root: { memoizedProps: { scope: { query: {}, get: () => client() } } },
    readSource: async () => 'import("./chatgpt-conversation-client-test.js")',
    importModule: async () => ({ chatGPTConversationClient$: {} }),
  };
}

function client() {
  return { models: async () => ({}), get: async () => ({}), startCompletionStream: async () => {}, getConversationStreamStatus: async () => ({}), delete: async () => {} };
}

it("rejects webpage and secondary renderer targets before any resource access", async () => {
  const env = environment();
  env.readSource = async () => { throw Error("must not fetch"); };
  for (const rendererUrl of ["https://chatgpt.com/", "app://-/index.html?initialRoute=overlay"]) {
    await expect(discoverAppChatRuntime({ ...env, rendererUrl })).rejects.toMatchObject({ code: "WRONG_RENDERER" });
  }
});

it("never follows a remote client reference or imports multiple candidates", async () => {
  const env = environment();
  let imported = false;
  env.importModule = async () => { imported = true; return {}; };
  env.readSource = async () => 'import("https://example.test/chatgpt-conversation-client-test.js")';
  await expect(discoverAppChatRuntime(env)).rejects.toMatchObject({ code: "APP_UNSUPPORTED" });
  env.readSource = async () => 'import("./chatgpt-conversation-client-a.js");import("./chatgpt-conversation-client-b.js")';
  await expect(discoverAppChatRuntime(env)).rejects.toMatchObject({ code: "APP_UNSUPPORTED" });
  expect(imported).toBe(false);
});

it("does not choose a client when separate App scopes resolve different instances", async () => {
  const env = environment();
  const first = client(), second = client();
  env.root = { memoizedProps: { scope: { query: {}, get: () => first } }, sibling: { memoizedProps: { scope: { query: {}, get: () => second } } } };
  await expect(discoverAppChatRuntime(env)).rejects.toMatchObject({ code: "APP_UNSUPPORTED" });
});

it("detects client replacement without claiming that a cached runtime is still valid", async () => {
  const env = environment();
  let current = client();
  env.root = { memoizedProps: { scope: { query: {}, get: () => current } } };
  const runtime = await discoverAppChatRuntime(env);
  expect(runtime.isCurrent()).toBe(true);
  current = client();
  expect(runtime.isCurrent()).toBe(false);
});

it("requires background deletion and streaming capabilities together", async () => {
  const env = environment();
  env.root = { memoizedProps: { scope: { query: {}, get: () => ({ models: async () => ({}) }) } } };
  await expect(discoverAppChatRuntime(env)).rejects.toMatchObject({ code: "APP_UNSUPPORTED" });
});

it("bounds cyclic dependency graphs and does not expose resource errors", async () => {
  const env = environment();
  env.readSource = async url => url.includes("app-initial")
    ? 'import "./app-initial-test.js";import "./chatgpt-conversation-client-test.js";'
    : 'import "./app-initial-test.js";';
  await expect(discoverAppChatRuntime(env)).resolves.toHaveProperty("client");
  env.readSource = async () => { throw Error("private-path-or-token"); };
  await expect(discoverAppChatRuntime(env)).rejects.toMatchObject({ code: "APP_UNSUPPORTED", message: "An App resource could not be read." });
});

it("rejects excessive resource data and excessive initial candidates", async () => {
  const env = environment();
  env.readSource = async () => "x".repeat(24 * 1024 * 1024 + 1);
  await expect(discoverAppChatRuntime(env)).rejects.toMatchObject({ code: "APP_UNSUPPORTED" });
  env.entryUrls = Array.from({ length: 9 }, (_, i) => `app://-/assets/index-${i}.js`);
  await expect(discoverAppChatRuntime(env)).rejects.toMatchObject({ code: "APP_UNSUPPORTED" });
});

it("discovers outer App scopes without traversing the task UI below a scope", async () => {
  const env = environment();
  let child: unknown = {};
  for (let i = 0; i < 6000; i++) child = { child };
  env.root = { memoizedProps: { scope: { query: {}, get: () => client() } }, child };
  await expect(discoverAppChatRuntime(env)).resolves.toHaveProperty("client");
});
