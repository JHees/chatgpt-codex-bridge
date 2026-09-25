# Validation scope — 0.1.5

## Automated checks

`npm run check` passed with **15 test files and 145 tests**, including type checking, lint, build, ZIP contents, version consistency, and checksum verification.

Recovery tests exercise the production entry point with controlled App-service readiness and clocks:

| Scenario | Verified behavior |
| --- | --- |
| Services missing at first startup | Retries and connects without a plugin reload |
| Empty initial model catalog | Remains unavailable until a later nonempty catalog |
| Discovery never resolves | Times out and retries; late results do not replace newer state |
| Client identity changes while idle | Reconnects without remounting healthy UI |
| Repeated failures and manual Diagnose | Backs off and keeps one discovery attempt in flight |
| Partial UI registration fails | Cleans the partial registration before retrying |
| Plugin stops before/during discovery | Cancels timers and releases waiting callers |
| Owned session is waiting | Defers recovery and does not resend its message |

The four initial recovery tests failed against the previous one-shot implementation and passed after the fix. Existing tests retain message ownership, uncertain-send handling, permission/budget boundaries, cleanup, UTF-8/Windows JSON sizes, and saved-draft behavior.

## Runtime and documentation checks

The final plugin package is installed through the native Loader's generic package interface, followed by in-place reload. Local runtime checks compare installed/loaded fingerprints, verify lifecycle and bundled-skill linkage, check for duplicate controls/styles, and confirm that the document is not refreshed. Machine-specific evidence stays outside the public repository.

README previews are screenshots of the actual Bridge UI components in an isolated browser harness. Models, task content, and timing values are sample data. They contain no real account, task, prompt, credential, or local-path information and are not latency benchmarks.

## What this does not establish

- No new real Chat or Pro generation was performed for this version's recovery tests.
- The running desktop app was not fully shut down and restarted during the local agent session. Delayed cold-start readiness was reproduced deterministically; physical startup of each installed App build remains a separate acceptance check.
- Recovery does not resume an interrupted conversation, bypass a pause, or prove quality for all model combinations.

Previous live collaboration evidence is recorded separately in the existing validation documents; it is not a substitute for this version's scope.

## 中文说明

本版本完整检查通过：15个测试文件、145项测试，以及类型、lint、构建和包校验。恢复用例调用生产入口，通过受控的服务就绪顺序和时钟覆盖延迟启动、空目录、超时、过期结果、空闲重连、串行重试、部分注册清理、停止取消和活动会话保护。

原位部署单独核对实际安装与运行指纹、lifecycle、skill链接、重复节点和页面身份。截图来自真实组件的匿名预览，所有任务与耗时值均为示例。

本次未执行新的真实Chat/Pro生成，也未关闭当前桌面应用做完整物理冷启动；不将受控复现或热加载等同于所有App版本的完整启动验收。
