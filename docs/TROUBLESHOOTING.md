# Bridge 故障排查

先检查输入区 Bridge 控件状态和只读 `status`。status 不会发送新消息。

## 无法连接 Chat

- `settings.enabled = false`：在当前已有任务的 Bridge 控件中开启协作并选择模型。草稿没有正式任务 ID，先发送一条普通 Codex 消息创建任务，再开启。
- `CHAT_CONFIGURATION_REQUIRED`：为任务选择一个当前可用的模型。Pro 不会自动替代其他模型。
- `APP_UNSUPPORTED`：当前 Codex renderer 的原生 Chat 接口与 Bridge 适配器不兼容。停在这里，不要重载后猜测或切换模型。
- `CHAT_*` 错误：按实际错误处理账号、服务或模型问题。Bridge 不会尝试其他模型。
- `occupied = true`：另一个任务持有唯一活动 session。先通过原任务检查状态并明确结束或保留。

## Windows helper 和权限

- `POWERSHELL_7_REQUIRED`：用 PowerShell 7 执行随包 `invoke-bridge.ps1`。
- `LOADER_ACCESS_DENIED`：受限执行环境无法访问用户的 Loader 安装或通信通道。对**同一操作、同一 payload**申请正常工具审批；成功后沿用该执行环境。helper 会在已识别的 AppContainer 重定向场景中先返回“未发送”。
- `COMMAND_FAILED`：只读 `status` 可在受限环境中用同一 payload 升权重试。若发生在 `exchange`，不要更换 request ID 或重发；先确认具体结果。
- `LOADER_UNAVAILABLE`：helper 在真实用户安装目录找不到可读的 Loader `active.json`。这不是会话或模型错误；由安装维护人员检查 Loader 安装状态。
- `LOADER_POINTER_INVALID`：活动安装指针格式错误。不要自行重建指针，也不要猜测运行版本。

## 等待与不确定发送

- `waiting`：同一 Chat 请求仍在生成。用**完全相同**的 task、session ID、request ID 和 message 继续读取；不会创建第二条 Chat 消息。
- `paused`：用户设置的时间或请求上限已达到。需要用户在 Bridge 控件明确继续。
- `SEND_UNCERTAIN` 或 `COMMAND_TIMEOUT`：发送结果不确定。先通过 `status` 和同一 request ID 查询；不要更换 ID、创建新 session 或重复发送。
- `failed`：检查状态里的稳定错误码。未解决前不能开始替代会话。
- `occupied`：同一 Loader 的另一个活动 session 正在运行；不会自动排队或中断它。

## 结束与清理

正常完成时，Codex 先核实执行证据并从 Chat 获得验收，再调用 `finish`。用户要求提前停止时用 `reason: user-request`，默认保留 Chat。若原生生成或归属状态未确认，Bridge 会保留会话，不执行清理。插件重载或 Codex 重启会结束易失 session，不会恢复、重复发送或清扫历史 Chat。

不记录或粘贴提示词、回复、账号资料、私有路径或认证数据到公开问题单。反馈时提供 Bridge/Loader/Codex 版本和稳定错误码即可。

[使用指南](USAGE.md) · [架构说明](ARCHITECTURE.md) · [helper 协议](../skills/bridge-chat/references/protocol.md)

## Troubleshooting

Start with the Bridge control in the current task and the read-only `status` operation. `status` never sends a new Chat message.

### Chat unavailable

- `settings.enabled = false`: enable Bridge and select a model in the current existing task. An unsent draft has no task ID; send an ordinary Codex message first, then enable Bridge.
- `CHAT_CONFIGURATION_REQUIRED`: choose a model currently listed for this account. Pro is never substituted automatically.
- `APP_UNSUPPORTED`: this Codex renderer's native Chat interface differs from the adapter. Stop here; do not guess, reload or switch models to bypass it.
- `CHAT_*`: handle the reported account, service or model error. Bridge does not try another model.
- `occupied = true`: another task owns the one active session. Check its status, then explicitly finish or retain it.

### Windows helper and permissions

- `POWERSHELL_7_REQUIRED`: run the bundled `invoke-bridge.ps1` with PowerShell 7.
- `LOADER_ACCESS_DENIED`: the restricted execution environment cannot access the user's Loader installation or command pipe. Request normal approval for the **same operation and payload**, then keep using that approved context. The helper detects known AppContainer path redirection before sending.
- `COMMAND_FAILED`: a read-only `status` can be retried with normal escalation and the same payload. If it came from `exchange`, do not change the request ID or resend; first reconcile status. Repeat the same payload only if status says `retryableRead: true`.
- `LOADER_UNAVAILABLE`: the helper cannot find a readable active pointer in the verified user installation. This is a Loader installation problem, not a Bridge session or model issue.
- `LOADER_POINTER_INVALID`: the active Loader pointer is malformed. Do not recreate it or guess another version.

### Waiting and uncertain sends

- `waiting`: the same Chat request is still running. Continue with exactly the same instance ID, task, session ID, request ID and message. The read continues the existing request; it does not create another Chat message.
- `paused`: a user-selected time or request limit was reached. The user must continue from the Bridge control.
- `SEND_UNCERTAIN` or `COMMAND_TIMEOUT`: delivery is unclear. Check `status` with the original request ID. Do not replace the ID, create a new session, or resend.
- `failed`: inspect the stable error code. Do not start a replacement session while the original is unresolved. Retry the same payload only if status explicitly says `retryableRead: true`. `SESSION_LOST` or a new `instanceId` after reload means the old v2 request cannot be replayed; reconcile native Chat with the user before creating a new session.
- `occupied`: another task in this Loader owns the active session; Bridge will not queue or interrupt it.

### Ending and cleanup

For normal completion, Codex verifies evidence, obtains Chat's review, and calls `finish`. A user stop uses `reason: user-request` and defaults to retaining the Chat. If the result includes `nativeGenerationMayContinue: true`, only local collaboration has ended; native Chat generation may still finish. New tasks default to retaining Chat; existing explicit task cleanup settings are preserved. Unconfirmed native generation or ownership prevents cleanup. Reloading the plugin or Codex ends volatile session state; Bridge never restores a request, resends it, or scans/deletes historical Chats.

Do not put prompts, replies, account data, private paths or authentication data in public issue reports. Share Bridge/Loader/Codex versions and stable error codes instead.
