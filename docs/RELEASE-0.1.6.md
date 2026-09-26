# Bridge 0.1.6

恢复 Codex 更新后 Bridge 后台连接和模型目录，并修复应用启动时界面语言尚未就绪导致的英文控件。

## 兼容性

**支持并实际验证的 Codex 版本：26.924.1866.0（Windows）。** 需要原生 Windows Codex Script Loader 0.5.12+ 和 PowerShell 7。新版 Codex 的设置容器修复由 Loader 独立提供；Bridge 不接管 Loader 页面宿主。其他 Codex 版本未在本轮重新验证。

## 修复

- 跟随原生模块的实际导入与导出关系发现共享 HTTP 客户端，恢复 App Chat 后台服务连接。
- 适配新的模型查询工厂，使用原生普通聊天模型目录，避免误选自定义 GPT 的目录。
- 渲染控件时读取当前应用语言，恢复中文界面的协作入口和设置文字。

## 升级与验证

通过 Loader 安装 `bridge-0.1.6.zip` 及其配套 `.sha256` 校验文件，renderer 与随包 skill 一起更新。插件身份、权限、已保存的模型及任务偏好不变。完成活动协作后再升级；重载不会恢复或重发协作请求。

类型检查、lint、16 个文件共 163 项测试、构建和 ZIP 校验通过。已验收候选通过热加载，实际验证覆盖后台连接、模型目录、输入区入口、设置页及导航。本轮未发起真实模型生成或完整协作往返；以前版本的模型实测不代表本版本端到端验收。

---

## English

This patch restores Bridge's background connection and model catalog after the Codex update, and fixes controls rendered before the app language has settled.

### Compatibility

**Supported and verified Codex version: 26.924.1866.0 on Windows.** Requires native Windows Codex Script Loader 0.5.12+ and PowerShell 7. The updated Codex settings-container fix is supplied independently by Loader; Bridge does not own the settings host. Other Codex versions were not revalidated in this round.

### Fixed

- Follow native imports and exports to locate the shared HTTP client and restore the App Chat background connection.
- Recognize the model-query factory and select the ordinary Chat catalog rather than the custom-GPT catalog.
- Read the current app language when rendering collaboration controls and settings.

### Upgrading and validation

Install `bridge-0.1.6.zip` with its matching `.sha256` through Loader. The renderer and bundled skill update together. Identity, permissions, saved models, and task preferences are unchanged. Finish active collaborations before upgrading; reloads do not restore or replay requests.

Type checks, lint, 163 tests across 16 files, build, and ZIP validation pass. The accepted candidate was hot-loaded and checked for background connectivity, model discovery, composer controls, settings, and navigation. No live model generation or complete collaboration exchange was run in this round; earlier validation does not establish end-to-end coverage for this version.

**Full Changelog:** [v0.1.5...v0.1.6](https://github.com/JHees/chatgpt-codex-bridge/compare/v0.1.5...v0.1.6)
