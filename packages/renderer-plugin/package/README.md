# Bridge 0.1.5

English · [简体中文](https://github.com/JHees/chatgpt-codex-bridge/blob/main/README.zh-CN.md)

Connect a selected App Chat planner to the current Codex executor. Chat leads technical decisions; Codex reviews proposed actions, executes with its existing permissions, and returns evidence.

## Install and use

Use native Windows Codex Script Loader 0.5.12+ and PowerShell 7. Install this ZIP through Loader; the renderer and `bridge-chat` skill are managed together. Choose a model in Bridge settings, enable collaboration for the task, review the visible instructions, and submit normally.

0.1.5 adds delayed-start and idle-connection recovery with bounded attempts and backoff. Active sessions are preserved; uncertain messages are never replayed. The task menu shows remaining rounds and last-reply statistics. Default budget is 3 business rounds, including final feedback.

[Full English documentation](https://github.com/JHees/chatgpt-codex-bridge#readme) · [Release notes](https://github.com/JHees/chatgpt-codex-bridge/blob/main/docs/RELEASE-0.1.5.md)

## 中文说明

Bridge 把所选 Chat 规划模型连接到当前 Codex 执行任务。Chat 主导技术决策，Codex 审核后按现有权限执行并回传证据。

需要原生 Windows Loader 0.5.12+ 与 PowerShell 7。通过 Loader 安装整个 ZIP，renderer 与 skill 一起管理。在 Bridge 设置中选好模型，在当前任务开启协作，检查可见说明后正常提交。

0.1.5 增加启动延迟和空闲连接失效的自动恢复，带超时及退避。活动会话保留，不自动重发不确定消息。任务菜单提供剩余轮次和最近回复统计；默认3轮包含最终反馈。重载只恢复偏好，不恢复活动会话；有旧草稿说明时可明确选择重新准备。

[完整中文文档](https://github.com/JHees/chatgpt-codex-bridge/blob/main/README.zh-CN.md)
