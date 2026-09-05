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

前置条件：Windows 版 Codex Script Loader `0.5.9` 或兼容版本已安装，Codex Desktop 由该 Loader 管理启动。

1. 在 Bridge 仓库根目录执行 `npm run check`。
2. 通过 Loader 的插件安装界面安装 `dist/loader-plugin`。
3. 通过 Codex 插件管理安装 `dist/codex-plugin`，使 `bridge-chat` skill 可用。
4. 使用 Loader 的 `--reload` 原位重载插件，无需刷新页面或重启 Codex。

插件列表中应只出现一个 Bridge：`dev.codex-chat-bridge`。

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
- `CALL_BUSY` / `TURN_PENDING` / `SESSION_BUSY`：已有调用、轮次或 session 未结束；不要并行发起第二条收发链路。
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
