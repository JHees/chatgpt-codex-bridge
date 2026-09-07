import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const renderer = join(root, "packages", "renderer-plugin");

const metadata = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { version: string };
const manifestPath = join(renderer, "package", "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { version: string };
if (manifest.version !== metadata.version) throw new Error("Renderer manifest version differs from package version.");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(join(renderer, "package"), join(dist, "loader-plugin"), { recursive: true });
await cp(join(root, "skills"), join(dist, "loader-plugin", "skills"), { recursive: true });
await cp(join(renderer, "dist", "index.cjs"), join(dist, "loader-plugin", "index.js"));
await cp(join(root, "node_modules", "lucide", "LICENSE"), join(dist, "loader-plugin", "lucide-LICENSE.txt"));
const archive = join(dist, `bridge-${metadata.version}.zip`);
const pwsh = join(process.env.ProgramFiles ?? "C:\\Program Files", "PowerShell", "7", "pwsh.exe");
const result = spawnSync(pwsh, ["-NoProfile", "-File", join(root, "tools", "package-zip.ps1"), "-Source", join(dist, "loader-plugin"), "-Destination", archive], { stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) throw new Error("Bridge ZIP packaging failed.");
const verificationArgs = ["-NoProfile", "-File", join(root, "tools", "verify-package.ps1")];
if (process.env.GITHUB_REF_TYPE === "tag") {
  verificationArgs.push("-ExpectedTag", process.env.GITHUB_REF_NAME ?? "missing-tag", "-ExpectedRepository", process.env.GITHUB_REPOSITORY ?? "missing-repository");
}
const verification = spawnSync(pwsh, verificationArgs, { stdio: "inherit" });
if (verification.error) throw verification.error;
if (verification.status !== 0) throw new Error("Bridge release package verification failed.");
await writeFile(join(dist, "README.txt"), `Install bridge-${metadata.version}.zip once through a schema-v2-compatible native Codex Script Loader. The bridge-chat skill is bundled and managed automatically.\n`, "utf8");
console.log(`BRIDGE_PACKAGE_PASS bridge-${metadata.version}.zip`);
