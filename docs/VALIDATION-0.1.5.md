# Validation scope — 0.1.5

## Automated checks

`npm run check` passed with **16 test files and 161 tests**, including type checking, lint, build, ZIP contents, version consistency, and checksum verification.

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

The README contains a user-supplied screenshot of the Codex composer showing the Bridge entry.

## What this does not establish

- No new real Chat or Pro generation was performed for this version's recovery tests.
- The running desktop app was not fully shut down and restarted during the local agent session. Delayed cold-start readiness was reproduced deterministically; physical startup of each installed App build remains a separate acceptance check.
- Recovery does not resume an interrupted conversation, bypass a pause, or prove quality for all model combinations.

Previous live collaboration evidence is recorded separately in the existing validation documents; it is not a substitute for this version's scope.

## 中文说明

本版本完整检查通过：16个测试文件、161项测试，以及类型、lint、构建和包校验。恢复用例调用生产入口，通过受控的服务就绪顺序和时钟覆盖延迟启动、空目录、超时、过期结果、空闲重连、串行重试、部分注册清理、停止取消和活动会话保护。

原位部署单独核对实际安装与运行指纹、lifecycle、skill链接、重复节点和页面身份。README仅保留用户提供的输入区截图，展示Bridge入口。

最初的恢复测试未执行新的真实Chat/Pro生成，也未关闭当前桌面应用做完整物理冷启动；不将受控复现或热加载等同于所有App版本的完整启动验收。


## Candidate follow-up: slow native startup

A live failed adapter still held a native conversation, 13 observed message nodes, and a completed-stream callback. Its saved error stack mapped specifically to the local 10-second startup timer. This establishes a false terminal timeout in Bridge; it does not establish why the native startup took longer.

The timer now yields without failing or repeating the invocation. Regression coverage includes late completion, a subsequent real rejection/rate-limit error, and controller-level continuation across read windows with and without an explicit reply deadline. The old code failed the three adapter cases; the fix passes them. The full candidate check passes 16 test files / 161 tests, type checking, lint, build, and ZIP validation. Native ownership and final-reply checks remain in place. Previously failed live instances cannot be revived by this source change; deployment requires explicit resolution of the old session.

实机诊断发现：旧适配器已有原生会话、13个消息节点和完成回调，保存的错误栈却指向本地10秒启动计时器。由此确认Bridge误判超时；原生启动慢的具体原因尚未确定。候选修复让该计时器只交还控制权，继续读取原请求，不重发。新增回归覆盖迟到完成、后续真实拒绝/限流、跨读取窗口续读和显式硬超时。旧实例已经进入终止状态的会话不会被源码改动直接恢复，部署前需明确处理。


The slow-start candidate was subsequently installed through Loader's package interface and hot-reloaded. Installed and loaded code matched; the renderer document was unchanged, the plugin was running with a ready background connection and linked skill, and no duplicate controls or reported errors were found. The previous failed Chat was deleted after explicit user authorization and native ownership/completion verification. A subsequent post-reload collaboration successfully returned planning, repair, and evidence-review replies.

该慢启动修复候选已通过 Loader 包管理接口安装并原位热重载，实际安装与运行代码匹配，页面未刷新，插件、连接和 skill 正常，无重复控件或已报告异常。旧失败 Chat 已按用户明确要求、经原生归属及完成状态核验后删除。重载后已成功取得新协作的规划、修复和证据复核回复。


Post-fix live acceptance completed four business exchanges through the selected Sol High planner. Final planner confirmation and an ended/delete receipt were received; active and pending-cleanup state were empty, with no reported connection error. This validates the collaboration path on the current installation, not Pro behavior or attributable quota savings.
