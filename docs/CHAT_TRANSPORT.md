# App Chat transport

The transport operates only inside the exact Codex main renderer URL `app://-/index.html`.

## Send

1. `exchange` creates or reopens the dedicated App Chat using exact Chinese or English semantic controls.
2. The plugin writes the full structured request and session/turn marker into the unique editable textbox, dispatches its normal input event, and verifies that the composer remains focused. It does not identify or click a Send button.
3. The plugin returns the fixed `$loaderHostAction` `press-enter` continuation.
4. Loader verifies the manifest's `trusted-input` permission, sends one trusted Enter through its existing CDP session, and invokes the same operation again with the same payload.
5. The plugin requires exactly one user message containing the marker. If confirmation is missing, it returns `SEND_UNCERTAIN` and does not request another Enter.

## Receive

The sent user turn is confirmed by its unique session/turn marker. For the reply, the plugin scans visible message text for parseable protocol JSON, climbs only to the smallest container that yields one object, and requires exact matching `protocol`, `sessionId`, and `turnId` fields. This continues to work when JSON syntax highlighting splits content across nested spans and does not rely on the assistant's Copy button, localized assistant action labels, or a fixed `pre > code` tag shape.

Completion requires the correlated JSON content to remain stable and any generation control to be absent. Protocol parsing then requires one exact fenced JSON response with the expected schema. Multiple matching replies, ambiguous containers, unknown fields, or invalid status/action invariants fail closed.

## Navigation and restoration

The plugin records only the exact `data-sidebar-chatgpt-conversation-key` that appears for the new Chat. It may reactivate that exact conversation row after Codex remounts the task view. Ambiguous or missing identity returns `SESSION_LOST`. `finish` activates the exact Back action and verifies that the Bridge anchor disappeared; otherwise it returns `RESTORE_REQUIRED`.

## Why not read SQLite

The local Codex SQLite databases contain Codex task metadata, turns, items, and tool execution history. Bridge markers can appear there because the current Codex task invoked the command client, but the corresponding App Chat conversation is not stored there as an authoritative message stream. Reading those files would therefore return false positives, miss replies, and couple the plugin to an internal schema. Bridge leaves them untouched and reads the live App Chat renderer instead.
