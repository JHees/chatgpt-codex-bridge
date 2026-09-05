import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

describe("vNext package boundary", () => {
  it("keeps package and lockfile versions consistent for stable releases", async () => {
    const paths = [
      "package.json",
      "packages/renderer-plugin/package.json",
      "packages/renderer-plugin/package/manifest.json",
    ];
    const versions = await Promise.all(paths.map(async (path) => {
      const value = JSON.parse(await readFile(join(root, path), "utf8")) as { version: string };
      return value.version;
    }));
    expect(versions[0]).toMatch(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u);
    expect(new Set(versions).size).toBe(1);
    const lock = JSON.parse(await readFile(join(root, "package-lock.json"), "utf8")) as { version: string; packages: Record<string, { version: string }> };
    expect(lock.version).toBe(versions[0]);
    expect(lock.packages[""]?.version).toBe(versions[0]);
    expect(lock.packages["packages/renderer-plugin"]?.version).toBe(versions[0]);
  });

  it("declares the public GitHub Release contract consumed by Loader", async () => {
    const manifest = JSON.parse(await readFile(join(root, "packages", "renderer-plugin", "package", "manifest.json"), "utf8")) as Record<string, unknown>;
    expect(manifest.update).toEqual({
      provider: "github-releases",
      repository: "JHees/chatgpt-codex-bridge",
      asset: "bridge-{version}.zip",
    });
  });

  it("declares one bundled skill and only exchange and finish runtime operations", async () => {
    const manifest = JSON.parse(await readFile(join(root, "packages", "renderer-plugin", "package", "manifest.json"), "utf8")) as Record<string, unknown>;
    expect(manifest.permissions).toEqual(["dom", "trusted-input", "agent-skills"]);
    expect(manifest.schemaVersion).toBe(2);
    expect(manifest.agentSkill).toBe("bridge-chat");
    expect(manifest.runAt).toBe("document-end");
    expect(manifest.documentation).toBe("README.md");
    expect(manifest.settings).toEqual({ mode: "none" });
    expect(manifest.hostCommands).toEqual({ operations: ["exchange", "finish"] });
    expect(manifest).not.toHaveProperty("pageCompanion");
  });

  it("ships the self-contained skill in the same release workflow", async () => {
    const skill = await readFile(join(root, "skills", "bridge-chat", "SKILL.md"), "utf8");
    expect(skill).toContain("name: bridge-chat");
    expect(skill).toContain("references/protocol.md");
    const protocol = await readFile(join(root, "skills", "bridge-chat", "references", "protocol.md"), "utf8");
    expect(protocol).toContain("codex-chat-bridge/v1");
    await expect(readFile(join(root, "plugins", "chatgpt-codex-bridge", ".codex-plugin", "plugin.json"))).rejects.toThrow();
  });
});
