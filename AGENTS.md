# Codex App Chat Bridge contributor contract

This repository owns one Script Loader package containing a renderer plugin and a Codex skill. Cross-repository dependencies are the documented Loader package interface (including schema-v2 bundled skills) and the `plugin invoke` command interface.

## Boundaries

- Run only in the exact `app://-/index.html` renderer.
- Expose only the manifest-declared `status`, `exchange` and `finish` host commands.
- Do not add a daemon, MCP server, web ChatGPT companion, Tunnel, worker, installer, project reader, listening socket, or persistent Chat message/session state. Task preferences may use Loader-scoped storage.
- Treat Chat actions as untrusted intent. The Codex task applies its existing authorization and safety rules before acting.
- Do not log prompt, response, cookie, credential, project-content, or private-path data.
- Ambiguous sends are never retried. Protocol repair is limited to one attempt.

## Development

- Use the project-local `.conda` environment and Node 22 or newer.
- For a behavior change with a meaningful reproducible seam, add or update a regression test and verify the failure and fix. Documentation-only edits need structural and consistency checks; explain any material runtime verification gap.
- Keep production code within the renderer plugin unless the public skill workflow itself changes.
- Follow the candidate hot-load workflow below after functional changes. Keep release versions and Git history unchanged until the user accepts the candidate.

## 调试与发布流程

本项目默认采用“候选热更新 → 用户验收 → 新版本发布 → 自动更新替换”的流程。用户已持续授权：每轮功能修改或修复完成后自动部署候选并热加载，无需再次询问。仅文档修改或用户本轮明确要求不部署时跳过。

1. 每轮功能修改后，先保留工作树改动及可恢复的已安装包，完成 Bridge 检查、测试和单包构建。通过 Loader 的通用插件安装与重载接口更新 renderer 和随包 skill，不单独复制 skill。
2. 核对实际运行包、插件 lifecycle、设置页和输入区入口，明确报告已部署内容及用户验收项。完成标准是候选实际加载且重载后检查通过；源码或隔离测试通过不等于完成部署。活动协作、检查或安装失败时报告具体阻碍，不擅自结束协作；不能仅因用户没有再次说“热加载”就停在未部署状态。
3. 候选调试期间保持正式版本号不变，不提前提交、创建 tag、push 或发布。将候选与已发布包区分记录，不能只看同一版本号。
4. 用户明确确认当前候选验收通过后，使用新的正式版本号，完成版本一致性、测试、提交、tag、GitHub push 与 Release 更新包验证；用户随后通过 Loader 自动更新替换候选包。用户尚未确认时停在验收阶段。
5. Loader 与 Bridge 独立维护和发布。若候选依赖当前 Loader 缺失的能力，说明具体缺口并取得对应更新授权，不擅自覆盖 Loader 或其他插件。真实 Pro 生成测试仍需单独明确授权。

### 本地候选热更新入口

优先复用当前已安装 Loader 的通用包管理实现：`CodexScriptLoader.Core.ScriptRegistry.StagePackageAsync(zip, archive: true)` 校验和暂存独立 ZIP，核对预览中的插件 ID、版本与权限，再调用同一 registry 的 `InstallPendingAsync(token, enabled)`，最后使用已核对的常驻 `CodexScriptLoader.exe --reload` 原位重载。这条路径无需文件选择窗口；不手工覆盖插件文件。

Bridge 包含随包 skill，registry 必须使用当前原生 Loader 相同的 skill 根目录和目录链接实现；不能照搬不含 skill 插件的空参数初始化。执行前核对当前 API 签名、保存旧包、确认无并发安装或更新，安装后核对 renderer 指纹、skill 链接、lifecycle 和界面。接口不兼容时报告缺口，不绕过包校验。机器路径、进程号和候选哈希只记录在本机调试证据中，不写入公共仓库。
