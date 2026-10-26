# Bridge 0.2.0

Bridge 改为更简单的单会话交流流程：Chat 提供建议，Codex 执行并反馈证据；插件负责请求身份、发送状态和结果读取。

## 升级注意

这是命令协议变更。请通过 Loader **整体更新 renderer 与随包 bridge-chat skill**，不要混用旧版 helper 或命令载荷。新协议使用 `status`、`exchange`、`finish`，按任务、运行实例、会话和请求 ID 关联操作。重载后旧的内存会话不会恢复或重放；请先结束正在进行的协作。

## 改进与修复

- 用纯文本往返替代原先的规划动作协议，并统一为单个活动会话。
- 明确区分发送不确定、等待读取、暂停、回复和失败；相同请求的恢复读取不会重新发送消息。
- 简化任务配置与诊断；新任务默认关闭协作、保留 Chat，并尊重用户明确选择的请求上限和超时。
- 改善新版 Codex 的运行时发现、连接恢复及 Windows 受限进程访问错误处理。
- 将设置入口图标改为双对话气泡，保持原生风格与可访问名称。

## 验证与限制

类型检查、lint、91 项测试、renderer 构建和单包验证通过；候选已安装并热加载，设置入口和随包 skill 链接正常。此次发布未重新执行真实 Pro 生成或完整模型组合矩阵；历史验证记录不等同于本协议的全量实机验证。

资产：`bridge-0.2.0.zip` 与同名 `.sha256` 文件。需要支持 schema-v2 随包 skill 的原生 Loader。

---

Bridge now uses a simpler single-session conversation: Chat advises, Codex executes and reports evidence, and the plugin tracks request identity, delivery state and replies.

## Upgrade notice

The command protocol changes in this release. **Update the renderer and bundled bridge-chat skill together through Loader.** Do not mix old helpers or payloads with the new package. `status`, `exchange` and `finish` are bound to task, runtime instance, session and request IDs. Finish active collaboration before updating: reload clears volatile sessions and never restores or replays them.

## Improvements and fixes

- Plain-text exchanges replace the previous planner-action protocol and use one active session.
- Uncertain delivery, waiting, paused, reply and failed states are distinguished. Recovery reads for an existing request do not send it again.
- Task controls and diagnostics are simpler. New tasks start with collaboration off and Chat retained; explicitly selected request limits and timeouts remain enforced.
- Native runtime discovery, connection recovery and restricted Windows-process access errors are clearer.
- A dual-chat icon replaces the generic document icon in settings.

Typecheck, lint, 91 tests, renderer build and package verification passed. The candidate was installed and hot-loaded, with its settings entry and bundled skill link checked. Fresh Pro generation and the full model matrix were not rerun for this release; historical acceptance does not certify every path in the new protocol.

Assets: `bridge-0.2.0.zip` and its `.sha256` file. Requires a native Loader supporting schema-v2 bundled skills.

[Full Changelog](https://github.com/JHees/chatgpt-codex-bridge/compare/v0.1.7...v0.2.0)
