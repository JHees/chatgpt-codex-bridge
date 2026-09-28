# Bridge 0.1.7

精简模型名称显示，并在 Chat 清理失败时提供直接结束 Bridge 的入口，避免协作一直占用。

## 改进

- 输入区入口和默认模型选择器显示模型名称，仅在存在独立思考参数时附加思考程度，移除重复的 Pro 前缀与模式标签。协作运行中仍显示必要的状态和等待时间。
- 无独立思考参数的单选模型不再显示多余的思考子菜单；模型组内不同模式的选择保持可用。
- 管理区统一提供“结束”，按点击时的全局默认设置删除、归档或保留 Chat。

## 修复

- Chat 清理失败后显示“直接结束 Bridge”。该操作只释放本地会话、作废旧协作绑定并移除待清理记录，不再调用 Chat 清理接口，也不影响其他任务的新协作。
- 手动结束后关闭本任务协作并清除其协作说明；清理待处理期间不再自动准备新的说明。

## 升级与验证

需要原生 Windows Codex Script Loader 0.5.12+ 和 PowerShell 7。完成活动协作后，通过 Loader 自动更新，或安装 `bridge-0.1.7.zip` 并使用配套 `bridge-0.1.7.zip.sha256` 校验。renderer 与随包 skill 一起更新；插件身份、权限及保存的偏好保持兼容，无需迁移。

类型检查、lint、16 个文件共 169 项测试、构建和 ZIP 验证通过。已验收候选在 Windows Codex 26.924.2738.0 与 Loader 0.5.13 上完成热加载，核对了运行指纹、插件生命周期、后台连接、输入区入口及 skill 链接，未发现新增异常或重复入口。清理失败及直接结束流程通过模拟测试验证；本轮未发起真实模型生成或真实 Chat 删除失败测试。

“直接结束 Bridge”不会撤回已经发出的 Chat 请求；该请求仍可能在后台完成。重载不会恢复或重发协作请求。

---

## English

This release simplifies model labels and adds a local exit when Chat cleanup fails, so a stuck cleanup need not keep Bridge occupied.

### Improved

- Composer controls and the default model picker show the model name, adding a thinking level only when an independent effort parameter exists. Repeated Pro prefixes and mode labels are removed; active collaboration status and wait time remain visible.
- Single-choice models without a thinking parameter no longer open a redundant submenu. Distinct modes within a model family remain selectable.
- The management area has one **End** button that uses the current global default to delete, archive, or retain Chat.

### Fixed

- Failed cleanup exposes **End Bridge only**. It releases the local session, invalidates its old binding, and removes its pending cleanup record without calling Chat cleanup again or disturbing another task's newer collaboration.
- Manual termination disables collaboration for that task and clears its instructions. Pending cleanup no longer triggers automatic preparation of new instructions.

### Upgrading and validation

Requires native Windows Codex Script Loader 0.5.12+ and PowerShell 7. Finish active collaborations, then update through Loader or install `bridge-0.1.7.zip` with its matching `bridge-0.1.7.zip.sha256`. The renderer and bundled skill update together. Plugin identity, permissions, and saved preferences remain compatible; no migration is required.

Type checks, lint, 169 tests across 16 files, build, and ZIP validation pass. The accepted candidate was hot-loaded on Windows Codex 26.924.2738.0 with Loader 0.5.13. Runtime fingerprints, lifecycle, background connectivity, composer controls, and the skill link were checked without new errors or duplicate controls. Cleanup failure and local termination were verified with simulated tests; no live model generation or real Chat deletion-failure test was run in this round.

**End Bridge only** cannot retract a Chat request already sent; that request may still complete. Reloads do not restore or replay collaboration requests.

**Full Changelog:** [v0.1.6...v0.1.7](https://github.com/JHees/chatgpt-codex-bridge/compare/v0.1.6...v0.1.7)
