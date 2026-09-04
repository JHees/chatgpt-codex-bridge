import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const renderer = join(root, "packages", "renderer-plugin");
const plugin = join(root, "plugins", "chatgpt-codex-bridge");

const metadata = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { version: string };
const manifestPath = join(renderer, "package", "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { version: string };
if (manifest.version !== metadata.version) throw new Error("Renderer manifest version differs from package version.");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(join(renderer, "package"), join(dist, "loader-plugin"), { recursive: true });
await cp(plugin, join(dist, "codex-plugin"), { recursive: true });
await cp(join(renderer, "dist", "index.cjs"), join(dist, "loader-plugin", "index.js"));
await writeFile(join(dist, "README.txt"), "loader-plugin: install through Codex Script Loader\ncodex-plugin: install through Codex plugin management\n", "utf8");
console.log("BRIDGE_PACKAGE_PASS loader-plugin codex-plugin");
