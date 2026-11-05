# Codex App Chat Bridge 0.2.1

修复新版 Codex 中模型列表为空并提示 `APP_UNSUPPORTED` 的问题，并加入独立的云端静态兼容预警。

## 修复与改进

- 识别 Rspack 的数字与哈希入口文件，从已加载模块缓存中定位原生 Chat 服务和模型目录；保留此前的打包格式适配。
- 继续验证服务接口和唯一性，检测实例替换；识别失败时明确报错，不执行模块工厂或重复发送请求。
- 增加官方最新 Windows x64 桌面包的定时静态检查，逐文件扫描异步资源，报告包版本、哈希、缺失特征及检查错误。
- 调整 Windows PowerShell 版本拒绝测试的等待时间，使测试框架与已有限时子进程的等待范围一致。

## 升级与验证范围

通过 Loader 自动更新，或安装 `bridge-0.2.1.zip` 整包；随包 skill 由 Loader 管理。输入区入口需要支持新版控件标记的 Loader，建议搭配 Loader 0.6.1。

本次适配已在正在运行的 Codex 中验证模型目录和入口恢复，并通过类型检查、Lint、回归测试、构建及包校验。未自动发送真实 Chat／Pro 请求；流式回复和清理仍需实际协作验收。

云端检查仅提供源码静态证据，不保证登录权限、运行时绑定或服务端开关兼容，也不会自动修复或发布版本。详情见 [桌面兼容性预警](DESKTOP-COMPATIBILITY.md)。

---

This release fixes an empty model catalog and `APP_UNSUPPORTED` on newer Codex desktop builds, and adds an independent static compatibility watch.

- Discover Rspack entry assets and native Chat services from the existing module cache, while retaining earlier bundle adapters.
- Preserve interface and uniqueness checks, instance replacement detection and fail-closed discovery, without executing module factories or retrying ambiguous sends.
- Inspect the latest official Windows x64 desktop package on a schedule, scanning asynchronous assets one file at a time and reporting version, hash, missing signals and inspection errors.
- Align the legacy Windows PowerShell rejection test's deadline with its already bounded child process.

Update the complete `bridge-0.2.1.zip` package through Loader. Loader 0.6.1 is recommended for the newer composer anchor. The bundled skill remains Loader-managed.

Model discovery and the composer entry were verified in a running desktop session. Typechecking, lint, regression tests, build and package verification are required for this release. Real Chat/Pro generation, streaming and cleanup are not exercised by the static watch and still require signed-in acceptance.

[Full Changelog](https://github.com/JHees/chatgpt-codex-bridge/compare/v0.2.0...v0.2.1)
