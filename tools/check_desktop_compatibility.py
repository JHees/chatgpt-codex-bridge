"""Inspect the official desktop MSIX without installing or executing its code."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import struct
import subprocess
import tempfile
import xml.etree.ElementTree as ET
import zipfile

SOURCE = "https://persistent.oaistatic.com/codex-app-prod/ChatGPT-x64.msix"
LIMIT = 2 * 1024**3


def download(destination):
    subprocess.run(["curl.exe", "--fail", "--location", "--silent", "--show-error",
                    "--proto", "=https", "--proto-redir", "=https", "--max-time", "600",
                    "--max-filesize", str(LIMIT), "--output", str(destination), SOURCE], check=True, timeout=620)


def asar_files(stream):
    prefix = stream.read(16)
    if len(prefix) != 16:
        raise ValueError("Truncated ASAR header")
    _, header_size, _, json_size = struct.unpack("<4I", prefix)
    if not 8 <= header_size <= 16 * 1024**2 or not 0 < json_size <= header_size - 8:
        raise ValueError("Invalid ASAR header size")
    tree = json.loads(stream.read(json_size))
    stream.seek(0, 2)
    end = stream.tell()
    base = 8 + header_size
    files = {}

    def walk(node, parent="", depth=0):
        if depth > 32 or len(files) > 100_000:
            raise ValueError("ASAR index exceeds limits")
        for name, entry in node.get("files", {}).items():
            if name in (".", "..") or "/" in name or "\\" in name:
                raise ValueError("Unsafe ASAR member")
            path = f"{parent}/{name}" if parent else name
            if "files" in entry:
                walk(entry, path, depth + 1)
            elif not entry.get("unpacked") and "link" not in entry:
                offset, size = int(entry["offset"]), int(entry["size"])
                if offset < 0 or size < 0 or base + offset + size > end:
                    raise ValueError("ASAR member outside archive")
                files[path] = (base + offset, size)

    walk(tree)
    return files


def inspect_asar(stream, supported_formats):
    files = asar_files(stream)
    total = 0

    def read(path):
        nonlocal total
        offset, size = files[path]
        total += size
        if size > 64 * 1024**2 or total > LIMIT:
            raise ValueError("Renderer scan exceeds size limit")
        stream.seek(offset)
        return stream.read(size).decode("utf-8")

    entries = []
    for path in files:
        if PurePosixPath(path).name == "index.html":
            html = read(path)
            scripts = re.findall(r'<script\b[^>]*\bsrc=["\']([^"\']+)["\']', html)
            if scripts and re.search(r'id=["\']root["\']', html):
                entries.append((path, scripts))
    if len(entries) != 1:
        return {"uniqueRendererEntry": False}
    entry, scripts = entries[0]
    root = str(PurePosixPath(entry).parent)
    root = "" if root == "." else root + "/"
    assets = [path for path in files if path.startswith(root + "assets/") and path.endswith(".js")]
    entry_paths = [root + src.removeprefix("/").removeprefix("./") for src in scripts]
    entry_sources = [read(path) for path in entry_paths if path in assets]
    rspack = any(re.search(r'export\s*\{[^{}]*\bas __webpack_require__\s*\}', source) for source in entry_sources)
    standalone = any(re.fullmatch(r"chatgpt-conversation-client-[\w-]+\.js", PurePosixPath(path).name) for path in assets)
    bundled = any(re.fullmatch(r"app-initial-[\w-]+\.js", PurePosixPath(path).name) for path in assets)
    transport = catalog = branch = False
    catalog_sources = []
    for path in assets:
        source = read(path)
        transport |= all(marker in source for marker in ("prepareCompletionStream(", "createCompletionStreamHandlers(", "startCompletionStream("))
        catalog |= "chatgpt-models" in source and "/models" in source
        if rspack and '"chatgpt-models"' in source and '.safeGet("/models"' in source:
            catalog_sources.append(source)
        branch |= "/conversation/new_branch" in source
    # shortcut: lexical evidence only; use a signed-in desktop runner for service binding and send/receive coverage.
    checks = {
        "uniqueRendererEntry": True,
        "entryAssetsPresent": len(entry_sources) == len(scripts),
        "supportedBundleFormat": (rspack and "rspack" in supported_formats) or (standalone and "standalone" in supported_formats) or (bundled and "bundled" in supported_formats),
        "completionTransportShape": transport,
        "normalizedModelCatalogShape": catalog,
        "conversationBranchEndpoint": branch,
    }
    if rspack:
        tool = Path(__file__).with_name("check-rspack-catalog.ts")
        result = subprocess.run(["node", "--import", "tsx", str(tool.resolve())],
                                input=json.dumps(catalog_sources), text=True, encoding="utf-8",
                                capture_output=True, timeout=60, check=True)
        checks["modelCatalogBinding"] = json.loads(result.stdout)["supported"]
    return checks


def inspect_package(path):
    if path.stat().st_size > LIMIT:
        raise ValueError("Package exceeds size limit")
    with open(path, "rb") as source:
        digest = hashlib.file_digest(source, "sha256").hexdigest()
    with zipfile.ZipFile(path) as package:
        names = package.namelist()
        if len(names) != len(set(names)):
            raise ValueError("Duplicate package members")
        manifest = package.getinfo("AppxManifest.xml")
        if manifest.file_size > 1024**2:
            raise ValueError("Manifest exceeds size limit")
        xml = ET.fromstring(package.read(manifest))
        identity = xml.find("{*}Identity")
        if identity is None or identity.get("Name") != "OpenAI.Codex":
            raise ValueError("Unexpected desktop package identity")
        archives = [info for info in package.infolist() if info.filename.endswith("/resources/app.asar")]
        if len(archives) != 1 or archives[0].file_size > LIMIT:
            raise ValueError("Expected one bounded desktop ASAR")
        with tempfile.TemporaryFile() as asar, package.open(archives[0]) as source:
            while chunk := source.read(1024**2):
                asar.write(chunk)
            asar.seek(0)
            runtime_root = Path(__file__).resolve().parents[1] / "packages/renderer-plugin/src"
            discovery = (runtime_root / "app-chat-runtime.ts").read_text(encoding="utf-8")
            formats = set()
            for kind, marker in (("rspack", "discoverRspackChatRuntime"), ("bundled", "discoverBundledChatRuntime"), ("standalone", "chatGPTConversationClient$")):
                if marker in discovery:
                    formats.add(kind)
            checks = inspect_asar(asar, formats)
        return {"desktopVersion": identity.get("Version"), "architecture": identity.get("ProcessorArchitecture"),
                "sha256": digest, "checks": checks}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--package", type=Path, help="Inspect a local MSIX instead of downloading")
    parser.add_argument("--output", type=Path, default=Path("compatibility-report.json"))
    args = parser.parse_args()
    report = {"component": "Bridge", "source": SOURCE if args.package is None else "local-package",
              "commit": os.environ.get("GITHUB_SHA"), "status": "check-error",
              "limitations": "Static source evidence only; login, model availability, live DOM and send/receive are NOT tested."}
    try:
        with tempfile.TemporaryDirectory() as folder:
            package = args.package or Path(folder) / "desktop.msix"
            if args.package is None:
                download(package)
            report.update(inspect_package(package))
        report["status"] = "passed-static" if all(report["checks"].values()) else "suspected-incompatibility"
    except Exception as error:
        report["error"] = f"{type(error).__name__}: {error}"
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))
    if summary := os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(summary, "a", encoding="utf-8") as out:
            out.write(f"## Bridge desktop compatibility: {report['status']}\n\n{report['limitations']}\n\n```json\n{json.dumps(report, indent=2)}\n```\n")
    return 0 if report["status"] == "passed-static" else 1


if __name__ == "__main__":
    raise SystemExit(main())
