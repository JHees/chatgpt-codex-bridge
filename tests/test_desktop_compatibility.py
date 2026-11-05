import io
import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from check_desktop_compatibility import inspect_asar, inspect_package, main


def archive(files):
    tree = {"files": {}}
    payload = bytearray()
    for path, text in files.items():
        content = text.encode()
        node = tree
        parts = path.split("/")
        for part in parts[:-1]:
            node = node["files"].setdefault(part, {"files": {}})
        node["files"][parts[-1]] = {"offset": str(len(payload)), "size": len(content)}
        payload.extend(content)
    header = json.dumps(tree).encode()
    padding = b"\0" * (-len(header) % 4)
    return struct.pack("<4I", 4, 8 + len(header) + len(padding), 4 + len(header) + len(padding), len(header)) + header + padding + payload


def renderer():
    return {
        "webview/index.html": '<div id="root"></div><script type="module" src="./assets/123.abc.js"></script>',
        "webview/assets/123.abc.js": 'export{r as __webpack_require__};',
        "webview/assets/456.def.js": 'prepareCompletionStream(){}createCompletionStreamHandlers(){}startCompletionStream(){};"chatgpt-models";"/models";"/conversation/new_branch";"/conversation/{conversation_id}";"/conversation/id/{conversation_id}";',
    }


class DesktopCompatibilityTests(unittest.TestCase):
    def test_new_and_removed_bundle_shapes(self):
        files = renderer()
        self.assertTrue(all(inspect_asar(io.BytesIO(archive(files)), {"rspack"}).values()))
        self.assertFalse(inspect_asar(io.BytesIO(archive(files)), set())["supportedBundleFormat"])
        files["webview/assets/123.abc.js"] = "export const changed = true;"
        result = inspect_asar(io.BytesIO(archive(files)), {"rspack"})
        self.assertFalse(result["supportedBundleFormat"])
        self.assertTrue(result["completionTransportShape"])

    def test_missing_transport_and_missing_entry_asset(self):
        files = renderer()
        files["webview/assets/456.def.js"] = ""
        self.assertFalse(inspect_asar(io.BytesIO(archive(files)), {"rspack"})["completionTransportShape"])
        del files["webview/assets/123.abc.js"]
        self.assertFalse(inspect_asar(io.BytesIO(archive(files)), {"rspack"})["entryAssetsPresent"])

    def test_ambiguous_renderer_and_broken_archive(self):
        files = renderer()
        files["other/index.html"] = files["webview/index.html"]
        self.assertFalse(inspect_asar(io.BytesIO(archive(files)), {"rspack"})["uniqueRendererEntry"])
        for data in (b"", struct.pack("<4I", 4, 2**31, 0, 0), archive(renderer())[:-20]):
            with self.assertRaises(ValueError):
                inspect_asar(io.BytesIO(data), {"rspack"})

    def test_msix_fingerprint_and_package_identity(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "test.msix"
            for identity in ("OpenAI.Codex", "Unrelated.App"):
                files = renderer()
                files["webview/assets/app-initial-test.js"] = files.pop("webview/assets/123.abc.js")
                files["webview/index.html"] = files["webview/index.html"].replace("123.abc.js", "app-initial-test.js")
                with zipfile.ZipFile(path, "w") as package:
                    package.writestr("AppxManifest.xml", f'<Package xmlns="urn:test"><Identity Name="{identity}" Version="1.2.3.4" ProcessorArchitecture="x64"/></Package>')
                    package.writestr("app/resources/app.asar", archive(files))
                if identity == "OpenAI.Codex":
                    report = inspect_package(path)
                    self.assertEqual(report["desktopVersion"], "1.2.3.4")
                    self.assertEqual(len(report["sha256"]), 64)
                    self.assertTrue(all(report["checks"].values()))
                else:
                    with self.assertRaisesRegex(ValueError, "identity"):
                        inspect_package(path)

    def test_network_failure_is_unknown_and_preserves_a_report(self):
        with tempfile.TemporaryDirectory() as folder:
            report = Path(folder) / "report.json"
            with patch.object(sys, "argv", ["check", "--output", str(report)]), \
                    patch("check_desktop_compatibility.download", side_effect=OSError("unavailable")), \
                    patch("builtins.print"):
                self.assertEqual(main(), 1)
            self.assertEqual(json.loads(report.read_text())["status"], "check-error")
            self.assertNotIn("checks", json.loads(report.read_text()))


if __name__ == "__main__":
    unittest.main()
