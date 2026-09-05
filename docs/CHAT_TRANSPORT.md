# App Chat transport

The transport operates only inside the exact Codex main renderer URL `app://-/index.html`.

## Send

1. `exchange` creates a dedicated App Chat using exact Chinese or English semantic controls. It permits one active invocation and one pending turn. Reusing an ID with changed payload is rejected.
2. The plugin writes the full structured request and session/turn marker into the unique editable textbox, dispatches its normal input event, and verifies that the composer remains focused. It does not identify or click a Send button.
3. The plugin returns the fixed `$loaderHostAction` `press-enter` continuation.
4. Loader verifies the manifest's `trusted-input` permission, sends one trusted Enter through its existing CDP session, and invokes the same operation again with the same payload.
5. The plugin requires exactly one user message beginning with the complete marker, with a whitespace/end boundary. Longer IDs and repair suffixes are distinct. If confirmation is missing, it returns `SEND_UNCERTAIN` and does not request another Enter. The controller keeps this failure terminal until finish.

Before every new send, generation must have ended, the composer must be empty, and ChatGPT mode with Medium/High reasoning must be verified. Existing user drafts are never cleared. The first composer must remain the same until the posted marker establishes conversation identity.

## Receive

The sent user turn is confirmed by its unique session/turn marker. Reply extraction is limited to visible content following that user container and preceding the next user message. It excludes all user containers, editable content, navigation, and hidden ancestors. Containers are deduplicated by DOM identity, not response text, so two identical blocks remain two candidates. This supports JSON split across highlighted spans without requiring an assistant Copy button or a fixed `pre > code` tag shape.

The smallest recognized block is passed to strict protocol validation. Extraction does not pre-filter valid IDs or valid JSON: doing so would turn malformed responses into misleading timeouts and bypass repair. Markdown fences are often no longer text nodes in the rendered UI; rendered code content is wrapped for the parser. Multiple candidate code blocks are rejected. Text with neither a recognizable protocol object nor a rendered code block may still time out.

Completion requires candidate text to remain stable and generation controls to be absent. This is a UI heuristic, not a server completion event. Protocol parsing then requires one exact fenced JSON response with the expected schema. Multiple matching replies, ambiguous containers, unknown fields, or invalid status/action invariants fail closed. Waits are cancelled by reset/reload or loss of the visible sent turn. Timeout diagnostics contain counters and booleans, not message, alert, or action text.

## Navigation and restoration

The plugin records only the exact `data-sidebar-chatgpt-conversation-key` that appears for the new Chat. If the sent anchor remains visible but the composer is unmounted, it may reactivate that exact row once. It never substitutes another new row, and does not reactivate Chat after the anchor disappears. Missing identity returns `SESSION_LOST`; ambiguous evidence returns `DOM_AMBIGUOUS`.

`finish` activates the exact Back action and requires both the Back control and Bridge anchor to disappear; otherwise it returns `RESTORE_REQUIRED`. This confirms leaving Chat, not an independently captured original task ID. App Back navigation remains responsible for choosing the return destination.

## Why not read SQLite

The local Codex SQLite databases contain Codex task metadata, turns, items, and tool execution history. Bridge markers can appear there because the current Codex task invoked the command client, but the corresponding App Chat conversation is not stored there as an authoritative message stream. Reading those files would therefore return false positives, miss replies, and couple the plugin to an internal schema. Bridge leaves them untouched and reads the live App Chat renderer instead.
