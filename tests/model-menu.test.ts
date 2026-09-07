import { expect, it } from "vitest";
import { preferredModel } from "../packages/renderer-plugin/src/model-menu.js";
import type { ChatModel } from "../packages/renderer-plugin/src/chat-configuration.js";
const preset = (effort: string | null, mode = "thinking", key = `${mode}:${effort}`): ChatModel => ({key,mode,effort,slug:"fixture",title:"Fixture",effortLabel:effort ?? mode});
it("uses Medium by default and the closest lower value on a tie", () => {
  expect(preferredModel([preset("max"),preset("standard")])?.effort).toBe("standard");
  expect(preferredModel([preset("max"),preset("standard")],preset("extended"))?.effort).toBe("standard");
});
it("matches available levels in either direction, including Instant, without inventing backend parameters", () => {
  expect(preferredModel([preset("extended")],preset("standard"))?.effort).toBe("extended");
  expect(preferredModel([preset("standard"),preset(null,"instant")],preset(null,"instant","other"))?.mode).toBe("instant");
});
it("never uses Pro as the closest level or carries Pro across families", () => {
  expect(preferredModel([preset(null,"pro"),preset("standard")],preset("max"))?.mode).toBe("thinking");
  expect(preferredModel([preset(null,"pro"),preset("standard")],preset(null,"pro","other-pro"))?.mode).toBe("thinking");
});
it("preserves an explicitly saved exact Pro preset and permits an explicitly chosen Pro-only family", () => {
  const pro = preset(null,"pro");
  expect(preferredModel([pro,preset("standard")],pro)).toBe(pro);
  expect(preferredModel([pro],preset("extended"))).toBe(pro);
});
it("keeps a matching unfamiliar capability exact and handles an empty catalog", () => {
  const custom = preset("custom");
  expect(preferredModel([custom,preset("standard")],custom)).toBe(custom);
  expect(preferredModel([])).toBeUndefined();
});
