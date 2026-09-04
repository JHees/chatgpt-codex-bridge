import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

describe("vNext package boundary", () => {
  it("publishes every package as the clean 0.1.0 baseline", async () => {
    const paths = [
      "package.json",
      "packages/renderer-plugin/package.json",
      "packages/renderer-plugin/package/manifest.json",
      "plugins/chatgpt-codex-bridge/.codex-plugin/plugin.json",
    ];
    const versions = await Promise.all(paths.map(async (path) => {
      const value = JSON.parse(await readFile(join(root, path), "utf8")) as { version: string };
      return value.version;
    }));
    expect(versions).toEqual(["0.1.0", "0.1.0", "0.1.0", "0.1.0"]);
  });

  it("declares only DOM, one trusted Enter, plus exchange and finish", async () => {
    const manifest = JSON.parse(await readFile(join(root, "packages", "renderer-plugin", "package", "manifest.json"), "utf8")) as Record<string, unknown>;
    expect(manifest.permissions).toEqual(["dom", "trusted-input"]);
    expect(manifest.runAt).toBe("document-end");
    expect(manifest.documentation).toBe("README.md");
    expect(manifest.settings).toEqual({ mode: "none" });
    expect(manifest.hostCommands).toEqual({ operations: ["exchange", "finish"] });
    expect(manifest).not.toHaveProperty("pageCompanion");
  });

  it("ships one skill without an MCP server declaration", async () => {
    const plugin = JSON.parse(await readFile(join(root, "plugins", "chatgpt-codex-bridge", ".codex-plugin", "plugin.json"), "utf8")) as Record<string, unknown>;
    expect(plugin.skills).toBe("./skills/");
    expect(plugin).not.toHaveProperty("mcpServers");
  });
});
