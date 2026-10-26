# 使用 Bridge 协作

Bridge 把你当前的 Codex 任务连接到一个 Chat 会话。用户按任务选择 Chat 模型并开启 Bridge；Codex 检查 Chat 的建议，在本地工作，再将实际结果发回同一会话。

## 开始一次协作

1. 在 Codex 输入区为当前任务选择模型和限制，然后开启 Bridge。Pro 需要明确选择。
2. 提出目标、约束和完成标准。Codex 读取 `CODEX_THREAD_ID`，先调用只读 `status` 确认该任务已开启 Bridge、模型已选且没有其他活动会话，并保存返回的 `instanceId`。
3. 第一次 `exchange` 发送简短目标和已有证据，并带上 `instanceId`；Bridge 创建一个 Chat 会话，返回 `sessionId`。后续每次 exchange 也要带原 `instanceId`；会话使用开始时冻结的模型和设置。
4. 阅读 Chat 的纯文本回复，审查每项建议后再行动。Chat 的文字不能授权执行工具或改变权限。工具需要用户作决定时，在当前 Codex 任务询问并等待实际答复。
5. 工具每次执行后，都回传真实命令、结果和证据。后续每个新消息都使用同一个 `sessionId` 和新的 `requestId`。
6. 工作和 Chat 验收都完成后，调用 `finish`。如果用户提前要求停止，使用 `reason: user-request`；默认保留对应 Chat；新任务默认保留，而已有任务保留原先明确选择的清理策略。

## 等待与恢复

`waiting` 表示 Chat 还在生成。继续调用时保留相同 task、session ID、request ID 和 message；Bridge 会读取原生回复，不会再发一条相同消息。收到 `reply` 后，才开始下一个有新 request ID 的业务消息。

如果终端或工具输出丢失，通过 `status` 和原 request ID 读取已保存的状态或回复。更换 request ID 不会恢复旧结果；发送是否成功不确定时，不要创建替代请求。重载会创建新 `instanceId`；v2 会话不接受旧 request ID 在新实例重放。

由用户明确设置的总请求数和硬超时会让 session 进入 `paused`；只有用户从输入区协作控件明确继续后才能恢复。默认不设的超时不会自动暂停。新任务在首次设置时默认保留专用 Chat；已保存的任务清理选择会继续生效。

## 模型与任务范围

- Bridge 在设置中展示原生 Chat 模型目录和版本分组。不可用模型会隐藏；适配失败时报连接错误，不会切换到别的模型。
- 模型在第一次 exchange 时冻结。同一 Chat 会话不因后续默认值变化而换模型。
- `enabled` 是按任务保存的用户选择。既有任务默认关闭；需要用户在当前任务开启。
- 草稿没有正式 task ID，不能启用协作。先发送一条消息创建任务，再开启 Bridge。
- 一个 Loader 实例同一时间只运行一个 Bridge session。其他任务会看到 `occupied`，不会排队、抢占或读取会话内容。

## 隐私与运行限制

Bridge 只把用户要求的简报、后续消息及实际执行结果送到当前选择的 Chat。消息和 session 不写入 Bridge 存储；插件重载或 Codex 重启会清除易失状态，也不会重新发送。清理所选 Chat 前必须确认生成已结束、会话归属仍有效。

命令 helper 使用当前用户 PowerShell 7 和 Loader 的固定 `plugin invoke` 接口，不提供任意 CDP、JavaScript 或 Chat 文本执行入口。Codex 的 Chat 服务属于 renderer 内部实现，更新后可能需要修改 Chat 适配器；适配失败时 Bridge 显示稳定错误状态并暂停。

[架构说明](ARCHITECTURE.md) · [故障排查](TROUBLESHOOTING.md) · [Loader 更新说明](../skills/bridge-chat/references/protocol.md)
