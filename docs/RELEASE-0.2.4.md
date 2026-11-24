# Codex App Chat Bridge 0.2.4

适配 Windows 版 Codex 26.1120.5083.0 的模型目录。此前输入区按钮可以正常显示，但连接会报 `APP_UNSUPPORTED`。本次在主窗口通过随包 helper 验证了任务归属、连接和 14 个可用模型选项；真实消息收发未纳入本轮验证。

- 静态检查器识别封装在对象属性中的 Rspack 模块函数，继续使用与运行时相同的目录匹配规则。
- 没有聊天输入区的分离面板进入待机，原生聊天输入区挂载后再连接。在 Codex 26.1117.4957.0 上也验证了主窗口连接和分离浏览器面板待机。
- 后台任务路由请使用 Loader 0.6.3。通过 Loader 更新完整插件包，或安装 `bridge-0.2.4.zip` 并核对对应的 SHA-256 文件，随包 skill 会一同更新。

## English

Bridge recognizes the model catalog shipped with Codex Desktop for Windows 26.1120.5083.0. The bundled helper resolved the correct task and reported a ready connection with 14 model options. Live message generation and streaming were outside this verification.

The offline checker now recognizes wrapped Rspack module factories. Detached panes wait for a native chat composer before connecting. The main window and detached browser standby state were also checked on 26.1117.4957.0.

Use Loader 0.6.3 for background-tab routing. Update the complete plugin through Loader, or install `bridge-0.2.4.zip` after checking its SHA-256 file.

[Full Changelog](https://github.com/JHees/chatgpt-codex-bridge/compare/v0.2.3...v0.2.4)
