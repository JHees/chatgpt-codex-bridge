import { afterEach, expect, it, vi } from "vitest";
import { Window } from "happy-dom";
import { start, stop, invokeHostCommand } from "../packages/renderer-plugin/src/index.js";
import type { LoaderApi } from "../packages/renderer-plugin/src/loader-interface.js";

afterEach(() => { stop(); vi.unstubAllGlobals(); });
function fixture() {
  const window = new Window({ url: "app://-/index.html" });
  vi.stubGlobal("document", window.document); vi.stubGlobal("location", window.location);
  let unregistered = 0;
  const api: LoaderApi = { version: "candidate", storage: { get: () => null, set: () => {} },
    settings: { registerPage: () => ({ unregister() { unregistered++; } }) },
  };
  return { window, api, unregistered: () => unregistered };
}
it("cleans its own style and settings when composer registration fails during startup", () => {
  const f = fixture();
  f.api.composer = { registerAccessory: () => { throw Error("COMPOSER_UNAVAILABLE"); } };
  expect(() => start(f.api)).not.toThrow();
  expect(f.window.document.querySelectorAll("style")).toHaveLength(0);
  expect(f.unregistered()).toBe(1);
});
it("keeps settings and read-only status available when the private App Chat interface cannot be discovered", async () => {
  const f = fixture(); start(f.api);
  await Promise.resolve(); await Promise.resolve();
  const result = await invokeHostCommand("status", { task: { hostId: "local", taskId: "task" } });
  expect(result).toMatchObject({ compatibility: { background: false, settings: true, composer: false }, active: null });
  await expect(invokeHostCommand("continue-waiting", {})).rejects.toMatchObject({ code: "OPERATION_NOT_ALLOWED" });
  stop();
  expect(f.window.document.querySelectorAll("style")).toHaveLength(0);
  await expect(invokeHostCommand("status", { task: { hostId: "local", taskId: "task" } })).rejects.toMatchObject({ code: "PLUGIN_NOT_RUNNING" });
});
