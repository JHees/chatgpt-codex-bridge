# Codex App Chat Bridge 0.2.5

修复重载后草稿已有 Bridge 指令、协作无法重新准备的问题。配合 Loader 0.6.4，Bridge 会在当前任务中复用唯一且文本完全相同的指令块。用户已编辑的指令和重复块会保留，并提示手动处理。开启协作时会先核对输入区归属和指令状态。

在 Windows 版 Codex 26.1120.5083.0 上热加载验证。通过 Loader 更新完整的 `bridge-0.2.5.zip` 及随包 skill，并使用配套 SHA-256 文件校验。建议先更新 Loader；较旧宿主可能要求手动移除已有指令。

## English

With Loader 0.6.4, Bridge can prepare an opt-in task again after a reload by reusing a single identical instruction block in its draft. Edited or duplicate instructions remain available for manual review. Enabling collaboration checks the mounted task and prepares the instructions before saving the setting.

The candidate was hot-loaded on Codex Desktop for Windows 26.1120.5083.0. Update Loader first, then update the complete `bridge-0.2.5.zip` package and bundled skill. A matching SHA-256 file is provided.

[Full Changelog](https://github.com/JHees/chatgpt-codex-bridge/compare/v0.2.4...v0.2.5)
