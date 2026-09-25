# Bridge 0.1.5

Bridge now keeps Chat and Codex working toward task completion without fixed batches. This release also fixes delayed startup and slow native requests that previously required manual recovery.

## Highlights

- **Task-driven collaboration.** Request limits and hard reply deadlines are optional. Answer Chat questions in the current Codex task without an extra confirmation button.
- **Automatic connection recovery.** Retry while App services are starting, and reconnect an invalid idle connection without interrupting an owned session.
- **Slow startup stays recoverable.** The 10-second startup window now continues waiting for the original request instead of reporting a permanent send failure. Messages are not resent.
- **Completion and cleanup are separate.** Once work is verified, a failed Chat cleanup can be retried separately without blocking the next task.
- **Clearer guidance and controls.** Rewritten planner instructions, request counts, reply timing, and an explicit way to refresh stale collaboration instructions.
- **Simpler project documentation.** Rewritten English and Chinese READMEs with a composer screenshot. Removed the unused foreground adapter and controller.

## Upgrading

Install `bridge-0.1.5.zip` with native Windows **Codex Script Loader 0.5.12+**. The renderer and bundled skill update together; **PowerShell 7** is required. Plugin identity and permissions are unchanged.

Old default limits of 3 rounds and 15 minutes become uncapped operation. Non-default numeric limits are preserved, with an old batch count becoming a total request cap. Model and cleanup preferences remain unchanged.

Finish active collaborations before installing. After a reload, prepare fresh collaboration instructions if an old draft remains. App updates may require future compatibility updates.

## Validation

Type checking, lint, **161 tests across 16 files**, build, and ZIP validation passed. The candidate was hot-loaded and verified in the running App. A live four-exchange Sol High collaboration completed successfully and deleted its test Chat. Details: [validation scope](VALIDATION-0.1.5.md).

Download **`bridge-0.1.5.zip`** and its **`.sha256`** checksum from this release. Use the plugin ZIP rather than GitHub's source-code archives.

[Full Changelog](https://github.com/JHees/chatgpt-codex-bridge/compare/v0.1.4...v0.1.5)

---

# Bridge 0.1.5 中文更新说明

Chat 与 Codex 现在围绕任务持续协作，默认不再按固定批次中断。本版本同时修复启动接入延迟和原生请求较慢时误报失败的问题。

## 主要变化

- **按任务持续推进**：总请求上限和回复硬超时改为可选；Chat 有问题时直接在当前 Codex 任务回答，无须额外点击确认。
- **连接自动恢复**：App 服务尚未就绪时自动重试，空闲连接失效后自动重连，并保留已有协作。
- **慢启动不再误报失败**：超过10秒仍未收到启动确认时，继续等待原请求，不再留下永久发送错误，也不会重发消息。
- **验收与清理分开处理**：任务完成后，Chat 清理失败可以单独重试，不再占住下一项任务。
- **提示词与控制更清晰**：重写规划端说明，显示请求计数和回复耗时，并提供重新准备旧协作说明的入口。
- **精简项目文档**：重写中英文 README，展示输入区入口；移除已停用的前台适配器和控制器。

## 升级方式

使用原生 Windows **Codex Script Loader 0.5.12+** 安装 `bridge-0.1.5.zip`，renderer 与随包 skill 一起更新；需要 **PowerShell 7**。插件身份和权限不变。

旧默认的3轮和15分钟限制会变为不设限。非默认数值继续保留，其中旧批次轮数转为总请求上限；模型与清理偏好保持不变。

安装前请结束正在进行的协作。重载后若草稿中保留旧说明，重新准备协作说明即可。后续 App 更新可能需要适配。

## 验证

类型检查、lint、**16个测试文件共161项测试**、构建和 ZIP 校验通过。候选已在运行中的 App 热加载并验证；一次 Sol 高思考模式的4次业务交互完整结束，测试 Chat 正常删除。详见[验证范围](VALIDATION-0.1.5.md)。

请下载本 Release 中的 **`bridge-0.1.5.zip`** 及其 **`.sha256`** 校验文件，使用插件 ZIP 安装。

[完整变更](https://github.com/JHees/chatgpt-codex-bridge/compare/v0.1.4...v0.1.5)
