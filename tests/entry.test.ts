import { afterEach, expect, it, vi } from "vitest";
import { Window } from "happy-dom";
import { invokeHostCommand, start, stop } from "../packages/renderer-plugin/src/index.js";

vi.mock("../packages/renderer-plugin/src/app-chat-runtime.js", () => ({
  appChatEnvironment: vi.fn(),
  discoverAppChatRuntime: () => new Promise(() => {}),
}));

afterEach(() => { stop(); vi.unstubAllGlobals(); });

it("preserves skill diagnostics before background readiness with no Loader UI interfaces", async () => {
  const window = new Window({ url: "app://-/index.html" });
  window.document.documentElement.lang = "en";
  vi.stubGlobal("document", window.document); vi.stubGlobal("location", window.location);
  try {
    start({ version: "test", storage: { get: () => undefined, set: () => {} } });
    expect(await invokeHostCommand("status", {task:{hostId:"local",taskId:"task"}})).toMatchObject({
      compatibility: { settings: false, composer: false, background: false,
        bundledSkill: "loader-managed-unverified", bundledSkillNote: expect.stringContaining("not an installation failure") },
    });
  } finally { stop(); await window.happyDOM.abort(); }
});
