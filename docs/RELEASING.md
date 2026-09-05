# Bridge 发布与自动更新

## 发布契约

- 仓库：`JHees/chatgpt-codex-bridge`，保持公开；当前 Loader 不支持私有 Release 的鉴权。
- 插件 ID：`dev.codex-chat-bridge`，不能通过自动更新改成另一个 ID。
- 标签：`vMAJOR.MINOR.PATCH`，只发布稳定三段数字版本。
- 附件：`bridge-MAJOR.MINOR.PATCH.zip` 和 `bridge-MAJOR.MINOR.PATCH.zip.sha256`。
- `.sha256` 必须只有一条匹配的记录：`SHA256值  ZIP文件名`。
- ZIP 内同时包含 renderer 和 `skills/bridge-chat`，不是 GitHub 自动生成的源码压缩包。

更新源由 `packages/renderer-plugin/package/manifest.json` 的 `update` 字段声明。更换仓库、插件 ID 或附件模板不属于普通自动更新；此时必须设计明确的手动迁移。

## CI 做什么

`.github/workflows/ci.yml` 对 `main` 推送、PR 和手动运行执行同一组 Windows 检查。Node 版本来自 `.nvmrc`，依赖使用 `npm ci` 按锁文件安装；随后运行 `npm run check`，包含类型检查、lint、全部测试、构建和打包。

打包后自动执行 `tools/verify-package.ps1`，验证实际 ZIP、校验记录、必需文件、清单与更新源。标签构建还要求标签匹配包版本、仓库匹配清单更新源。检查失败不发布。

每次成功检查上传一个保存 14 天的 CI artifact。只有 `push` 版本标签才会进入发布任务：下载同一份已验证的 artifact，创建带两个附件的草稿，然后公开为最新正式 Release。PR、普通提交和手动 CI 都不会发布。草稿/预发布不是 Loader 的正式更新源。

检查任务只有读取仓库的权限。发布任务使用 GitHub 自带的 `GITHUB_TOKEN`，只在该任务授予 `contents: write`，无需配置个人 PAT、npm 凭据或其他发布服务。GitHub 托管 Windows runner 提供 PowerShell 7；CI 不需要本机 conda 路径。

## 发布一个版本

首次公开发布可以使用当前一致的 `0.1.0`；后续更改使用更高版本。以下用 `0.1.1` 举例，执行前替换为实际目标版本。

1. 同步根 `package.json`、`packages/renderer-plugin/package.json` 和 `packages/renderer-plugin/package/manifest.json` 的版本。更新代表当前版本的说明，不改历史验收记录中的旧版本。
2. 运行 `npm install --package-lock-only --ignore-scripts` 更新锁文件。测试会检查根包、workspace、清单和锁文件版本一致，不需要改测试里的版本常量。
3. 运行 `npm run check`，核对输出 ZIP 与 `.sha256`。新功能仍需对应的实机验收；CI 不会启动真实 Codex 或替你进行 Chat 验收。
4. 提交本次发布变更，推送 `main` 并确认 CI 通过。
5. 给最终提交创建 annotated tag，然后单独推送标签：

```powershell
git tag -a v0.1.1 -m v0.1.1
git push origin v0.1.1
```

6. 等待该标签的 `Bridge CI` 检查和 `Publish Loader update` 完成。核对 Release 是正式发布、两个附件都存在且大小合理。没有发布成功前，不把版本标为可自动更新。

不要重复上传不同内容到同一个已发布版本，不移动标签，不使用强制推送覆盖发布。若发布任务在草稿阶段失败，先查明原因；保留已公开版本不变，按实际失败情况处理未公开草稿或发布修复版本。

## 用户端首次接入

用户需要支持 schema-v2 随包 skill 和 host commands 的原生 Loader。单凭“0.5.9”版本号不能确认兼容性。Bridge 仓库不会构建、发布或自动升级 Loader。

从 Release 安装一个含更新源的 Bridge ZIP 后，在 Loader 中开启 Bridge 的自动更新。旧包显示“未提供更新源”时，手动替换一次；相同版本不会触发自动更新。自动更新默认关闭，用户可随时关闭或手动检查。

Loader 会在插件有本地修改或候选版本增加权限时要求确认；不能用发布流程绕过这些提示。一次更新只替换 Bridge 自己的包，skill 同步更新，失败同步回滚。
