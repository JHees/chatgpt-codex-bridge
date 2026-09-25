# Troubleshooting Bridge

Start with the diagnostic error code and whether a session is active. The task control being enabled does not prove that a Chat message was sent.

## Startup and automatic recovery

`APP_UNSUPPORTED`, `CHAT_CONNECT_TIMEOUT`, or `CHAT_MODELS_UNAVAILABLE` during startup may mean the App has not mounted its services or loaded the catalog yet. Bridge 0.1.5 retries automatically with backoff, without reloading the App. `compatibility.backgroundRecovery` reports `connecting`, `retrying`, `ready`, or `deferred`, the attempt count, and time until the next check.

- `retrying`: wait for the next connection attempt, or use **Diagnose** for an immediate idle attempt.
- `deferred`: an owned session is still present. Inspect its state and explicitly end or retain it before idle recovery.
- Persistent `APP_UNSUPPORTED`: the installed App may have changed its internal interface; include App, Loader, and Bridge versions in a bug report.

Recovery never replays messages, changes models, or disposes of an active session.

## Configuration and saved drafts

`CHAT_CONFIGURATION_REQUIRED`: select an available model and supported thinking level in Bridge settings. Pro is supported only when explicitly selected; it is never an automatic fallback. Reconnection can refresh a catalog, but cannot grant model access or recover exhausted quota.

`CONTEXT_EXISTS`: an older plugin instance left instructions in the draft. Bridge preserves them and stops automatic preparation attempts. Use **Prepare fresh collaboration instructions** in the task menu when you want to replace that Bridge block, then submit normally. Do not reuse an old binding after reload.

`bundledSkill: loader-managed-unverified` is informational. Loader manages the skill; this field does not independently verify its installation. Read `bundledSkillNote` and Loader's skill status.

## Sending and reading

A slow native startup stays on the same registered request. The 10-second startup window yields to normal waiting; it is not a failure deadline and does not trigger another send. Continue the identical exchange payload. Only an explicitly configured hard reply timeout pauses the session.

`SEND_UNCERTAIN`: the native invocation threw or rejected, so sending was not conclusively acknowledged. Keep the exact session/turn identities; do not assume nothing was sent or create a replacement request.

`CALL_BUSY`, `TURN_PENDING`, `TURN_CONFLICT`: wait for the owning tool process, then continue only with the identical saved payload. Changing a payload while retaining its turn ID is invalid.

`repair-required` is an intermediate state, not a failed connection. The bundled waiter makes the single permitted format clarification. A second invalid reply returns `PROTOCOL_INVALID` and stops. `RESULT_TOO_LARGE` means the reply or result cannot fit the Windows command envelope; it is not permission to resend.

For lost output or `already-delivered`, use [read-only recovery](../skills/bridge-chat/references/protocol.md#read-only-result-recovery). Reconcile recovered actions with the actual tool ledger before executing anything again.

Earlier 0.1.5 candidates incorrectly turned the 10-second startup window into a terminal error. A later native completion could then remain unread, and cleanup would fail with the same underlying error. The candidate fix preserves the in-flight invocation and reads its eventual result. It does not revive already-failed sessions in the old loaded instance: explicitly end and retain that old Chat before installing/reloading, then prepare fresh collaboration instructions. Do not resend the old request.

## Pauses and cleanup

Only an explicitly selected hard reply timeout or total request cap requires task-panel consent to continue. Default long waits remain readable; answer ordinary planner questions in the current task without a second confirmation button. A late reply does not override an explicit hard timeout.

`USER_INTERVENED` or `SESSION_LOST`: preserve the Chat, inspect the state, and end or retain the exact owned session. Automatic recovery is not conversation recovery.

`CLEANUP_UNSAFE`: generation or ownership is unresolved. Wait for it to settle or explicitly retain the Chat. `CLEANUP_PENDING` keeps the original native cleanup request in flight; a retry checks the same target rather than sending another delete. A failed cleanup does not invalidate an already verified reply. Verified work releases the active slot; inspect `pendingCleanup` and retry or retain its exact target separately.

## Loader and helper

`PLUGIN_NOT_RUNNING`: confirm that Loader is running and Bridge is installed and enabled. Use Loader's normal package installation and reload controls.

`LOADER_ACCESS_DENIED`: the execution sandbox could not access the installed command client. Request normal tool approval for the same helper/payload; do not reinstall Loader or weaken directory permissions. `POWERSHELL_7_REQUIRED` means the helper was launched under Windows PowerShell 5.

Do not use SQLite, extracted credentials, foreground clicks, or guessed CDP ports as alternative transports. Share only stable codes and structural diagnostics; remove private prompts, paths, task IDs, and credentials.

## 中文速查

- 启动时连接失败会自动退避恢复；`deferred` 表示活动会话尚未结束，需要先明确保留或结束。
- 旧草稿说明用任务菜单“重新准备协作说明”处理，不自动改写草稿。
- 原生启动超过10秒时，当前候选继续等待同一请求，收到迟到回复后正常核验；不会自动重发。明确设置的回复硬超时仍然有效。
- 早期0.1.5候选把这10秒误判为永久失败，可能出现Chat实际完成但Bridge读不到、清理失败的情况。旧实例已失败的会话需要明确结束并保留后再升级，重新准备协作说明；不要重发旧请求。
- 原生调用真正抛错或拒绝产生的 SEND_UNCERTAIN、超大回复和会话丢失不能通过换ID重发解决。
- 明确设置的请求上限与硬超时仍需明确继续；普通问题直接在任务中回答。默认长等不会暂停。
- Pro需要明确选择；`loader-managed-unverified`本身不是安装失败。
- 详细调用与恢复方法见[协议说明](../skills/bridge-chat/references/protocol.md)。
