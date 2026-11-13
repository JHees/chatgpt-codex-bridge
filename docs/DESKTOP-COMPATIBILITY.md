# Desktop compatibility watch / 桌面兼容性预警

`Desktop compatibility (static)` checks the latest official Windows x64 desktop
MSIX every six hours (02:37, 08:37, 14:37 and 20:37 UTC) and on manual dispatch.
GitHub schedules may run late and require the workflow on the default branch.
The workflow also runs for changes to its checker and tests. Each run checks the
latest package even when its version has not changed, so a repaired Bridge is
checked again. There is no persistent version cache or account credential.

Source: [OpenAI's Windows deployment guide](https://learn.chatgpt.com/docs/enterprise/windows-deployment),
which links the [latest x64 MSIX](https://persistent.oaistatic.com/codex-app-prod/ChatGPT-x64.msix).
This is the desktop distribution, not the Codex CLI release feed.

The job runs the existing Bridge checks and build, tests the offline checker,
and reads the downloaded MSIX/ASAR as data. It does not install the app, execute
its JavaScript, sign in, send a Chat request or modify an installed plugin.
The checker looks for the renderer entry and assets, a bundle format supported
by the checked-out Bridge discovery code, completion-transport methods, model
catalog markers and conversation endpoints. For Rspack model catalogs, it also
parses the module source as data and uses Bridge's production binding matcher.
Unsupported or ambiguous catalog declarations fail this check even when the
keywords remain present. Other checks are lexical signals; none prove that
signed-in service instances resolve at runtime.

The Actions summary and the JSON artifact record the checked commit, desktop
version, architecture, package SHA-256 and individual results:

| Status | Meaning |
| --- | --- |
| `passed-static` | All listed source signals exist. Runtime compatibility remains unverified. |
| `suspected-incompatibility` | A listed signal is missing. The job fails; inspect before changing code. |
| `check-error` | Download, package layout or parsing failed. The job fails; compatibility is unknown. |

Artifacts contain the report only, never the downloaded app or its source.
SHA-256 identifies the tested bytes; it is not an independent authenticity check.
Reports are retained for 14 days. GitHub Actions failure notifications use the
user's GitHub notification settings; this workflow does not post issues or chats.
It does not repair, release or deploy changes automatically.

Run locally with Python 3.11 or newer:

```text
python -m unittest discover -s tests -p "test_desktop_*.py"
python tools/check_desktop_compatibility.py --package downloaded.msix --output report.json
```

Install the repository's locked npm dependencies first; the catalog check uses
the existing Node.js, TypeScript and tsx tools. Without `--package`, the checker downloads the official latest package. Exit
code 0 means `passed-static`; any other status exits 1. Signed-in model access,
live DOM mounting, service identity, sending, streaming and cleanup need a
separate real-desktop acceptance test. Server-side feature flags may change
without a new MSIX and are outside this watch's coverage.

## 中文说明

该工作流每天北京时间 04:37、10:37、16:37、22:37 检查官方最新 Windows x64
桌面安装包，也可在 Actions 页面手动运行。必须合入默认分支才会定时执行；
GitHub 调度可能延迟。每轮都检查最新包，不依赖上次版本缓存。

检查范围是 Bridge 所依赖的入口、打包格式、模型目录和会话接口的源码特征；
Rspack 模型目录还会复用插件实际的绑定匹配逻辑，拒绝无法识别或不唯一的声明。
同时运行现有测试与构建。报告区分“静态通过”“疑似不兼容”“检查出错”，
后两种情况会让工作流失败。报告保留 14 天，不上传安装包、应用源码或账号信息。

静态通过不代表真实协作可用；压缩代码关系、登录权限、页面挂载、流式回复、
清理和服务端开关仍需运行验证。失败通知沿用 GitHub Actions 通知设置，
不会自动修复、发版或替换用户安装的插件。
