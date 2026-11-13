# Codex App Chat Bridge 0.2.3

修复新版 Codex 中入口正常但模型列表为空、提示 `APP_UNSUPPORTED` 的问题，并加强模型目录结构的自动检查。

## 修复与改进

- 支持接收 `scope` 参数的原生模型目录函数，同时保留旧形式；要求目录声明及导出匹配唯一，不误选 gizmo 或 merged 目录。
- 云端静态检查解析 Rspack 模块源码，复用插件实际的目录匹配逻辑。即使关键词仍存在，不支持或不唯一的目录声明也会使检查失败。
- 新增旧/新函数形式、错误 scope 参数和歧义声明的回归测试；检查过程不执行下载的应用代码。

## 升级与验证范围

通过 Loader 自动更新，或安装完整的 `bridge-0.2.3.zip`；随包 skill 仍由 Loader 管理，使用同名 `.sha256` 文件校验。此版本不要求新增 Loader 能力；分离窗口继续需要 Loader 0.6.2 或更新的兼容宿主。

本地通过类型检查、Lint、98 项回归测试、6 项检查器测试、构建和包校验。候选已在真实主窗口热加载，模型连接恢复为 ready，并读取到 10 个模型选项。真实 Chat／Pro 生成和分离窗口往返未在本轮执行；空白且未挂载原生界面的分离窗口不计为验收通过。

自动检查仍属于静态预警，不能替代登录后服务实例、实际发送和流式回复的验证。详见[桌面兼容性预警](https://github.com/JHees/chatgpt-codex-bridge/blob/v0.2.3/docs/DESKTOP-COMPATIBILITY.md)。

---

This release fixes an empty model catalog and `APP_UNSUPPORTED` on newer Codex builds while the Bridge entry remains available.

- Recognize scope-aware native model catalog factories while retaining the earlier form. Require unique declarations and exports without selecting gizmo or merged catalogs.
- Parse Rspack source as data in the static compatibility watch and reuse the production catalog matcher. Unsupported or ambiguous declarations fail even when familiar keywords remain present.
- Cover legacy and scope-aware factories, mismatched scope arguments and ambiguous declarations in regression tests, without executing downloaded application code.

Update the complete `bridge-0.2.3.zip` package through Loader and verify the matching SHA-256 file. The bundled skill remains Loader-managed. This release needs no new Loader capability; detached windows still require a compatible Loader 0.6.2 or newer host.

Local validation passed typechecking, lint, 98 regression tests, six offline-checker tests, build and package verification. The candidate was hot-loaded in a real main window and restored a ready connection with ten model options. Real Chat/Pro generation and detached-window round trips were not exercised; a blank detached renderer without a mounted native UI was not counted as a pass. Static checks do not replace signed-in runtime acceptance.

[Full Changelog](https://github.com/JHees/chatgpt-codex-bridge/compare/v0.2.2...v0.2.3)
