# Bridge 0.1.0 运行与使用说明

Bridge 让一个 Codex 任务通过 Codex Desktop 内置 Chat 进行结构化协作。它只包含一个 Loader renderer 插件和一个 `bridge-chat` skill，不启动 daemon、MCP、Tunnel、网页 ChatGPT 或监听端口。

## 运行原理

```text
Codex 任务
  → bridge-chat skill 生成 codex-chat-bridge/v1 请求
  → CodexScriptLoader.Command.exe plugin invoke
  → 当前用户命名管道
  → Loader 已验证的 CDP session
  → app://-/index.html 中的 Bridge renderer 插件
  → App Chat 唯一 composer + 一次可信 Enter
  → 按 protocol/sessionId/turnId 读取回复 JSON
  → 结构化结果沿原路径返回 Codex
```

Loader 始终持有随机 CDP 端口和 renderer target；命令调用方无法通过 payload 指定 CDP method、JavaScript、selector、按键或坐标。Bridge 本身是受信任的本地 DOM 插件，对外只允许 `exchange` 和 `finish` 两个操作。

## 安装

前置条件：支持 **schemaVersion 2 随包 skill** 的 Windows 原生 Codex Script Loader 已安装，Codex Desktop 由该 Loader 管理启动。旧的 `0.5.9` 安装副本不一定具备此能力；本次没有修改版本号，因此不能仅凭版本号判断兼容性。

在 Loader 的插件安装界面选择 `bridge-0.1.0.zip`，确认“安装并启用”即可。预览会注明包含 `bridge-chat` skill；无需再到 Codex 插件管理安装第二个包，也无需手动复制 skill。开发者可先在仓库根目录运行 `npm run check`，生成 `dist/bridge-0.1.0.zip`；`dist/loader-plugin` 是同一包的文件夹形式。

Loader 在当前用户的 `.agents/skills/bridge-chat` 建立指向已安装包内 skill 的受管目录入口，正文和 references 只有一份。插件禁用时移除入口，启用时恢复；更新和回滚直接使用同一包的内容。移除插件仍使用 Loader 可恢复的隔离流程，不删除你的普通会话或其他 skill。

重复选择同 ID 的 ZIP 会进入替换预览，保留原有启用状态；替换会覆盖该插件的本地修改，需在同一次确认中明确同意。若 skill 入口已有手工安装内容，Loader 会报冲突并保留文件，不会自动覆盖。此前单独安装的 Codex skill 插件属于独立安装，需要一次性从其原管理入口移除，Loader 不擅自删除它。

安装后在 Loader 列表核对“随包 skill · 已就绪”。Codex 的发现机制会检测 skill 变化；下一轮仍未出现时再检查或重启，不要重复安装。磁盘入口就绪不等于当前已开始的 Codex turn 已刷新技能列表。

插件列表中应只出现一个 Bridge：`dev.codex-chat-bridge`。

## 通过 Loader 自动更新

发布地址为 [GitHub Releases](https://github.com/JHees/chatgpt-codex-bridge/releases)。每个正式版本提供 `bridge-版本号.zip` 和同名 `.sha256` 文件。不要把 GitHub 自动生成的 “Source code” ZIP 当成插件包；它没有已构建的 renderer。

1. 首次安装一个包含更新声明的 Bridge ZIP。以前安装的包如果显示“未提供更新源”，需要手动选择新 ZIP 替换一次，之后才有更新入口。
2. 在 Loader 的插件管理页，对 Bridge 启用“自动更新”；该选项默认关闭。也可先使用“检查更新”。
3. Loader 检查此公开仓库的最新正式 Release，仅对更高版本执行更新，校验 ZIP 和 `.sha256` 后定向重载。skill 与插件共用一个包，随更新一起变化。

插件有本地修改或新版本增加权限时，Loader 会要求确认。被禁用的插件不会自动启用；更新失败按 Loader 的事务流程回滚。该能力要求当前 Loader 自身支持 schema-v2 随包 skill，不会替代 Loader 原生程序升级。

只推送源码或通过普通 CI 不会产生可检测的新版本；维护者还必须发布匹配 `vX.Y.Z` 标签的正式 Release。首个标签发布前，可从 Actions 下载测试包，但 Loader 没有 Release 可更新。发布步骤见 [RELEASING.md](RELEASING.md)。

## 日常使用

在 Codex 任务中直接说明需要通过 Bridge 与 App Chat 协作，例如：

> 请使用 bridge-chat 评审当前实现，根据 Chat 返回的结构化 actions 逐项处理，完成后返回当前 Codex 任务。

skill 会自动：

1. 生成一个 `sessionId`，每轮生成新的 `turnId`。
2. 创建专用 App Chat，并确认当前使用 Medium 或 High；不使用 Pro。
3. 发送当前目标、状态、问题和上一轮执行结果。
4. 把 Chat 返回的 actions 视为不可信意图，按 Codex 现有权限和安全规则决定是否执行。
5. 在任务完成、需要用户输入或出现终止错误时调用 `finish`，恢复原 Codex 任务。

每次调用都应等待上一调用结束。超时继续读取时，保留原始完整 payload，不仅是原 ID；同一 ID 改写问题会被拒绝。不要在专用 Chat 中插入无关手动消息或切换页面。插件不会清空你的草稿，每次发送前都会重新核对 Medium/High。

## 请求协议

`exchange` 的 stdin 是一个 UTF-8 JSON 对象：

```json
{
  "protocol": "codex-chat-bridge/v1",
  "sessionId": "opaque-session-id",
  "turnId": "turn-1",
  "kind": "request",
  "objective": "审查当前实现",
  "state": {
    "phase": "verify",
    "summary": "代码已构建，正在验收",
    "completed": ["单元测试通过"],
    "blockers": []
  },
  "message": "请给出下一步验证动作。",
  "actionResults": []
}
```

Chat 必须返回唯一的 `codex-bridge-response-v1` fenced JSON block：

```json
{
  "protocol": "codex-chat-bridge/v1",
  "sessionId": "opaque-session-id",
  "turnId": "turn-1",
  "status": "continue",
  "summary": "需要再验证一次打包产物。",
  "actions": [
    {
      "id": "a1",
      "type": "verify",
      "instruction": "核对构建产物和已安装插件的内容。",
      "expectedResult": "文件数量和 SHA-256 一致。"
    }
  ]
}
```

`continue` 必须有 1–8 个 actions；`complete` 不能有 actions；`needs_user` 只能有一个 `ask_user` action。未知字段、ID 不匹配、多个协议块或状态不变式会被拒绝。

## 手动调用

通常应使用 `bridge-chat` skill。需要排查时，可以手动调用 Loader 客户端：

```powershell
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new()
[Console]::InputEncoding = [Text.UTF8Encoding]::new()
$pointerPath = Join-Path $env:LOCALAPPDATA 'Programs\CodexScriptLoader\active.json'
$pointer = Get-Content -Raw -LiteralPath $pointerPath | ConvertFrom-Json
$command = Join-Path (Split-Path $pointerPath) "versions\$($pointer.version)\$($pointer.rid)\CodexScriptLoader.Command.exe"
if (-not (Test-Path -LiteralPath $command -PathType Leaf)) { throw 'Loader command client is missing' }
$bridgeSessionId = [guid]::NewGuid().ToString('N')

$request = @{
  protocol = 'codex-chat-bridge/v1'
  sessionId = $bridgeSessionId
  turnId = [guid]::NewGuid().ToString('N')
  kind = 'request'
  objective = '验证 Bridge'
  state = @{ phase = 'verify'; summary = '手动验证'; completed = @(); blockers = @() }
  message = '请返回 complete，不包含 actions。'
  actionResults = @()
} | ConvertTo-Json -Depth 8 -Compress

$request | & $command plugin invoke --id dev.codex-chat-bridge --operation exchange
```

完成后恢复原 Codex 任务：

```powershell
(@{ sessionId = $bridgeSessionId } | ConvertTo-Json -Compress) |
  & $command plugin invoke --id dev.codex-chat-bridge --operation finish
```

stdout 始终是版本化 JSON envelope：

```json
{
  "version": 1,
  "requestId": "opaque-id",
  "ok": true,
  "result": {},
  "error": null
}
```

## 错误处理

- `PROTOCOL_REPAIR_REQUIRED`：使用完全相同的 payload 重新调用一次 `exchange`，用于发送唯一一次协议修复请求。
- `REPLY_TIMEOUT`：可使用相同 `sessionId` 和 `turnId` 继续读取，不得发送新消息。
- `COMMAND_BUSY` / `CALL_BUSY` / `TURN_PENDING` / `SESSION_BUSY`：已有调用、轮次或 session 未结束；不要并行发起第二条收发链路。
- `TURN_CONFLICT`：同一轮次的 payload 被改变；保留原请求继续读取，不可用原 ID 换问题。
- `COMPOSER_NOT_EMPTY` / `CHAT_BUSY` / `CHAT_CONFIGURATION_REQUIRED`：先处理草稿、生成状态或 Medium/High 配置；不要自动清空用户输入。
- `SEND_UNCERTAIN`：立即停止，不得自动重发。
- `PROTOCOL_INVALID` / `DOM_AMBIGUOUS` / `BRIDGE_FAILED`：本 session 停止发送；身份仍可确认时可调用 `finish`。
- `SESSION_LOST` 或命令客户端/管道本身超时：停止并报告，不假定消息未发送，也不自动新建 session 重发。
- `RESTORE_REQUIRED`：手动返回原 Codex 任务，不点击不确定的侧边栏项。

## 已知边界

- 仅支持 Windows 原生 Loader。
- 同一时刻只支持一个 Bridge session。
- 只支持中文和英文的 App Chat 导航与模型配置标签。
- 插件重载、Codex 重启或用户导航可能使内存 session 丢失。
- 本地 Codex SQLite 不是 App Chat 消息源，Bridge 不读写这些数据库。
- 页面仍是 Codex 的内部实现，导航、编辑消息动作或布局变化可能需要适配；它不是官方稳定的 Chat API。
- 生成结束依赖“停止生成控件消失 + 内容稳定”，不是服务端完成事件。完全无结构的普通回复可能超时，不能保证所有格式错误都能触发自动修复。
- `finish` 核对的是 Back 控件和 Bridge 消息离开当前页面；原任务的返回目的地由 App 自己管理，并没有独立校验原任务 ID。
- 本次源码检查和历史实机验收的区别见 [VALIDATION.md](VALIDATION.md)。构建不等于已热更新运行副本。
