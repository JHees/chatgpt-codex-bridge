# Bridge

**0.2.0** 改为更简单的单会话、纯文本交流协议，并随包提供对应的 Loader 管理 skill。请整体更新插件包；旧版命令载荷不再兼容。详情见[发布说明](docs/RELEASE-0.2.0.md)。

**Chat 提建议，Codex 动手实现，Bridge 负责传递进展。**

[![CI](https://github.com/JHees/chatgpt-codex-bridge/actions/workflows/ci.yml/badge.svg)](https://github.com/JHees/chatgpt-codex-bridge/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

[English](README.md) · 简体中文

Bridge 是 Codex Script Loader 插件，可将当前 Codex 任务连接到你选择的 Chat 模型。Chat 评审方案与结果；Codex 核对建议，在项目中执行工作并回传实际证据。

## 使用 Bridge

需要 Windows Codex 桌面版、可用的 Chat、Codex Script Loader 和 PowerShell 7。

1. 通过 Loader 一次性安装 Bridge ZIP。
2. 在 Codex 输入区为当前任务选择 Chat 模型，并开启 Bridge。
3. 正常描述目标。Codex 会检查 Bridge 状态、发送简短背景，并在同一 Chat 中回报进展。
4. 关闭当前任务的 Bridge 可停止新消息；也可以让 Codex 结束协作会话。

模型需要明确选择，包括 Pro。已有任务默认关闭，需由你开启。新任务先创建，再开启 Bridge；未发送的输入草稿不授权协作。

`waiting` 表示 Chat 仍在生成。Codex 会用同一实例、会话和请求编号继续读取，不会重新发送消息。如果回复丢失，Codex 会按原请求编号读取已保存的结果。插件重载会改变实例编号，旧请求无法在新实例中重新启动生成。

![Codex 输入区中的 Bridge 入口](docs/images/bridge-composer.png)

## 工作方式

Bridge 每个 Loader 实例只保留一个内存会话。Loader 提供任务身份以及固定的 `status`、`exchange`、`finish` 命令；原生 Chat 适配器负责读取模型目录、发送和读取消息。任务偏好会保存，但提示词、回复和活动会话不会持久化。插件重载会结束本地会话，不会重放请求。

Chat 适配器依赖 Codex renderer 内部服务，目前没有稳定的第三方扩展接口。如果 Codex 后续调整这些服务，Bridge 会报告连接错误；它不会换模型，也不会重发状态不明的消息。

源码结构和状态流见[架构说明](docs/ARCHITECTURE.md)。Codex 的操作流程见随包 skill。[故障排查](docs/TROUBLESHOOTING.md) · [使用指南](docs/USAGE.md) · [报告问题](https://github.com/JHees/chatgpt-codex-bridge/issues)

## 许可证

[MIT](LICENSE)。
