# Troubleshooting Bridge vNext

## `COMMAND_UNAVAILABLE` or `PLUGIN_NOT_RUNNING`

Confirm the native Loader is running, the `dev.codex-chat-bridge` package is installed and enabled, and Loader reports a running lifecycle. Rebuild/installing a plugin package requires Loader's normal package install followed by `--reload`; changing Loader C# code requires a new native build and restart.

## `CHAT_CONFIGURATION_REQUIRED`

The dedicated App Chat must use ChatGPT mode with Medium or High reasoning. Pro is deliberately rejected. Select Medium or High in the Chat UI and retry with a new session if automatic High selection cannot be verified.

## `SEND_UNCERTAIN`

Bridge filled and focused the composer but could not prove that the unique user marker appeared after Loader's one trusted Enter. It will not resend. Check that the installed Loader build supports the `trusted-input` permission and that the installed Bridge package includes that permission, then start a new session.

## `REPLY_TIMEOUT`

The user message was confirmed, but no unique stable protocol JSON object with matching `sessionId` and `turnId` appeared before the deadline. The error includes bounded renderer diagnostics such as generation controls, composers, pending indicators, connectivity, visibility, controls, and alerts. Retry reading with the same session and turn ID; do not resend.

Do not diagnose this by querying the local Codex SQLite databases. Bridge markers found there are normally records of the Codex task invoking the command client; they are not evidence that the App Chat reply was persisted locally.

## `SESSION_LOST`, `DOM_AMBIGUOUS`, or `RESTORE_REQUIRED`

These errors are intentional fail-closed stops. Do not click a guessed Chat or resend the turn. Return to the originating Codex task manually if necessary, call `finish` only with the matching session ID, and begin a fresh Bridge session after navigation, reload, or restart.
