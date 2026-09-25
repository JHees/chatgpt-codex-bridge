# Bridge 0.1.5

Bridge now recovers from App services arriving after plugin startup, and refreshes an invalid idle connection automatically. This version also improves planner instructions, diagnostics, and the recovery of saved draft controls.

## Fixed

- Replaced one-shot native Chat discovery with serialized retries: 1, 2, 5, 10, 30, then at most one retry per 60 seconds. Discovery and catalog loading share a 15-second deadline.
- Clean up partial UI registration before retrying. Stopped or timed-out work cannot overwrite a newer connection; healthy idle connections are checked every 30 seconds.
- Preserve active sessions during recovery. No automatic resend, conversation replacement, cleanup, or model switch occurs.
- Stop repeated preparation attempts for restored draft instructions; provide an explicit action to prepare fresh instructions.
- Remove superseded unsent bindings, account for Windows JSON escaping in response limits, and recognize status examples inside code fences correctly.

## Improved

- Show remaining rounds, final-verification reminders, and the last validated reply's elapsed time and repair count.
- Rewrite the default planner prompt and shorten the bundled skill: Chat leads decisions; Codex reviews and executes under existing permissions. Prompts include the remaining feedback budget.
- Remove the unused foreground DOM adapter/controller and their dedicated tests.
- Add English and Chinese READMEs with anonymized previews of the actual UI components. Preview timing values are examples, not benchmarks.

## Upgrade and validation

Install `bridge-0.1.5.zip` through native Windows Loader 0.5.12+; renderer and skill update together. PowerShell 7 is required for the helper. Permissions and plugin identity are unchanged. Reload clears active session state, so finish or retain active work before installing.

Recovery is validated with controlled delayed-service, timeout, stale-result, partial-registration, idle-reconnection, and active-session tests. In-place runtime checks verify the installed package separately. This does not claim a new Pro generation test or a complete shutdown/startup test of every App build. See [validation scope](VALIDATION-0.1.5.md).

Assets: `bridge-0.1.5.zip` and `bridge-0.1.5.zip.sha256`.

[Full Changelog](https://github.com/JHees/chatgpt-codex-bridge/compare/v0.1.4...v0.1.5)

---

# Bridge 0.1.5 中文更新说明

修复 App 服务晚于插件启动时无法自动接入的问题，并在空闲连接失效后自动恢复。同时改进默认协作提示词、诊断信息和恢复草稿的处理。

## 修复

- 将一次性 Chat 服务发现改为串行退避重试：1、2、5、10、30 秒，随后每次间隔最长60秒；服务发现与模型目录读取合计最多15秒。
- 部分界面注册失败时先清理再重试；过期或已停止的尝试不能覆盖新连接。健康空闲连接每30秒检查一次。
- 恢复期间保留活动会话，不自动重发、替换会话、清理或切换模型。
- 恢复草稿存在旧协作说明时停止反复准备，提供明确的重新准备入口。
- 回收被替代且确定未发送的绑定，按Windows JSON转义后的大小校验回复，修正代码块中状态示例的误判。

## 改进

- 显示剩余轮数、最终验收提醒、最近有效回复耗时和格式修复次数。
- 重写默认规划提示词，精简随包skill：Chat主导技术决策，Codex审核后按现有权限执行；每轮带入剩余反馈预算。
- 删除已停用的前台DOM适配器、旧控制器及其专属测试。
- 重写中英文README，加入真实组件的匿名预览图；图中耗时为示例，不是性能数据。

## 升级与验证

使用原生Windows Loader 0.5.12+安装`bridge-0.1.5.zip`，renderer与skill一起更新。helper需要PowerShell 7。插件身份和权限不变。重载会清空活动会话状态，请先结束或保留正在进行的协作。

恢复流程已通过延迟就绪、超时、过期结果、部分注册、空闲重连和活动会话保护的受控测试；实际安装包另做原位运行核验。没有宣称本次新增了Pro生成验收或覆盖所有App版本的完整退出再启动测试。详见[验证范围](VALIDATION-0.1.5.md)。

安装产物：`bridge-0.1.5.zip`和`bridge-0.1.5.zip.sha256`。

[完整变更](https://github.com/JHees/chatgpt-codex-bridge/compare/v0.1.4...v0.1.5)
