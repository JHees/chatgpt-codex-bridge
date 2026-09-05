# Troubleshooting Bridge vNext

## `COMMAND_UNAVAILABLE` or `PLUGIN_NOT_RUNNING`

Confirm the native Loader is running, the `dev.codex-chat-bridge` package is installed and enabled, and Loader reports a running lifecycle. Rebuild/installing a plugin package requires Loader's normal package install followed by `--reload`; changing Loader C# code requires a new native build and restart.

## `CHAT_CONFIGURATION_REQUIRED`

The dedicated App Chat must use ChatGPT mode with Medium or High reasoning. Pro is deliberately rejected. Select Medium or High in the Chat UI and retry with a new session if automatic High selection cannot be verified.

## `SEND_UNCERTAIN`

Bridge could not verify the prepared text/focus or confirm the exact sent user marker after Loader's one trusted Enter. It will not resend, even if another exchange is requested. Inspect the existing Chat without sending more messages; call `finish` only when identity remains valid. Do not assume a timeout means delivery failed.

## `REPLY_TIMEOUT`

The user message was confirmed, but no unique stable reply candidate appeared in its response region before the deadline. The error contains only structural counters and state flags, not control labels, alert text, or message content. Retry reading with the identical saved payload within a bounded time budget; do not resend with a fresh ID. A plain prose response with no recognizable code/protocol object can time out rather than trigger repair.

Do not diagnose this by querying the local Codex SQLite databases. Bridge markers found there are normally records of the Codex task invoking the command client; they are not evidence that the App Chat reply was persisted locally.

## `SESSION_LOST`, `DOM_AMBIGUOUS`, or `RESTORE_REQUIRED`

These errors are intentional fail-closed stops. Do not click a guessed Chat or resend the turn. Return to the originating Codex task manually if necessary, call `finish` only with the matching session ID, and begin a fresh Bridge session after navigation, reload, or restart.

## `CALL_BUSY`, `TURN_PENDING`, `TURN_CONFLICT`

Wait for the current call before invoking again. A pending turn must be read with its original payload or finished before creating a new one. Changing the payload while retaining its ID is a caller error, not an instruction to resend.

## `COMPOSER_NOT_EMPTY`, `CHAT_BUSY`

Bridge preserves user drafts and will not submit while another generation is active. Resolve the draft or wait for generation to finish; do not clear input automatically. These errors do not themselves authorize a new session or another message.

## `PROTOCOL_REPAIR_REQUIRED`, `PROTOCOL_INVALID`

The first invalid recognizable response permits one identical-payload invocation to send a repair request. Repair timeouts can continue reading the same payload. A second invalid response is terminal and no further exchanges will send. Multiple ambiguous DOM blocks stop immediately; do not choose whichever answer looks preferable.
