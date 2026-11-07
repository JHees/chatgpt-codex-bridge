# Codex App Chat Bridge 0.2.2

本版修复快捷面板的 Escape 关闭行为，并允许插件运行于经过校验的本机分离聊天窗口。

## 修复与兼容性

- 在窗口捕获阶段处理 Escape，即使原生处理器提前标记按键已处理，打开的 Bridge 面板仍能关闭；关闭时清理监听器。
- 主入口与原生 Chat 发现使用一致的聊天页允许列表，排除头像浮层、外部网页及意外 URL 参数。
- 分离窗口注入和按任务选择窗口需要 Loader 0.6.2 的原生宿主支持。主窗口使用方式不变。

## 升级与验证范围

通过 Loader 自动更新或安装完整的 `bridge-0.2.2.zip`；随包 skill 继续由 Loader 管理，同名 `.sha256` 文件用于校验。

类型检查、lint、96 项测试、构建和包校验通过。真实主窗口验证了 Escape 关闭及设置入口。分离窗口的真实 Chat 往返尚未验证；本轮没有新增模型请求，不把此前单次往返当作分离窗口验收。

---

This release fixes Escape dismissal of the quick panel and allows Bridge to run in validated local detached chat windows.

- Handle Escape during window capture so the open panel closes even when native handlers already prevented the key's default action. Remove listeners when the panel closes.
- Share the same chat-page allowlist between the plugin entry point and native Chat discovery, excluding avatar overlays, external pages and unexpected URL parameters.
- Detached-window injection and task-based window routing require the native Loader 0.6.2 host. Main-window usage remains unchanged.

Update the complete `bridge-0.2.2.zip` package through Loader; the bundled skill remains Loader-managed. A matching SHA-256 file is supplied.

Type checking, lint, 96 tests, build and package verification passed. Live main-window checks cover Escape dismissal and the settings entry point. A real Chat round trip in a detached window has not been verified; no additional model request was sent for this release.

[Full Changelog](https://github.com/JHees/chatgpt-codex-bridge/compare/v0.2.1...v0.2.2)
