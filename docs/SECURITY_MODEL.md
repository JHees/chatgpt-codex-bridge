# Bridge vNext security model

Bridge vNext is trusted local renderer code with deliberately small authority. It coordinates one Codex task with one Chat conversation already present in the Codex desktop main renderer. It does not attempt to sandbox a malicious same-user process or treat Chat output as trusted instructions.

## Fixed boundaries

- The only external entry point is `CodexScriptLoader.Command.exe plugin invoke` over Loader's current-user named pipe.
- The plugin manifest allowlists exactly `exchange` and `finish`; request and result JSON are each capped at 64 KiB.
- Loader owns and validates the random loopback CDP endpoint and requires the exact `app://-/index.html` renderer. The caller cannot supply a port, target, method, selector, coordinate, key, or JavaScript source.
- The renderer package declares only `dom` and `trusted-input`. It has no loopback WebSocket or browser page companion capability.
- `trusted-input` is a fixed continuation handshake. After the plugin fills and focuses the semantic App Chat composer, it may request exactly one Enter key press. Loader rejects missing permission, malformed or extended directives, and a second request in the same command.
- The resumed invocation uses the identical operation and payload. The turn marker prevents retransmission once the user message is visible; an uncertain send stops with `SEND_UNCERTAIN`.

## Session and DOM rules

- Only one in-memory Bridge session may be active.
- The plugin uses exact Chinese or English labels only for navigation and Chat configuration. The composer is the unique editable textbox, independent of its localized label, and no Send button is located or clicked.
- User turns are confirmed by their Edit action and unique marker. Replies are parsed directly from visible protocol JSON and must match the pending protocol, session, and turn IDs; assistant action labels are irrelevant.
- Navigation, renderer replacement, plugin reload, Codex restart, or loss of the dedicated Chat identity produces `SESSION_LOST`. Bridge does not guess, reopen an unrelated conversation, or resend automatically.
- `finish` uses the exact Back action. If restoration cannot be verified it returns `RESTORE_REQUIRED` and does not click a guessed sidebar item.

## Structured-response trust

Chat must return exactly one `codex-bridge-response-v1` fenced JSON block. The schema rejects unknown fields, mismatched IDs, invalid status/action combinations, multiple blocks, and more than eight actions. One malformed reply permits only one protocol-repair turn.

Returned actions are untrusted intent. They do not grant permissions and are never interpreted as a raw shell channel. The Codex task decides whether and how each action can be performed under the user's authorization and its existing safety rules, executes actions in order, and stops on failure, blocking, or required user input.

## Explicit non-goals

vNext has no daemon, MCP server, Tunnel, web `chatgpt.com` target, worker, project-reader service, listener, secret store, durable journal, multi-profile support, concurrent sessions, or cross-restart recovery. It cannot protect content already sent to Chat or defend a desktop account already compromised by arbitrary same-user code.
