# Bridge vNext

Bridge vNext is a minimal collaboration bridge between a Codex task and Chat inside the Codex desktop app. It does not automate `chatgpt.com`, start a daemon, expose MCP tools, open a port, or read project files for Chat.

The complete runtime path is:

```text
Codex task → bridge-chat skill → CodexScriptLoader.Command.exe
→ current-user named pipe → Loader-owned CDP session
→ app://-/index.html renderer plugin → App Chat composer/navigation DOM
→ one Loader-gated trusted Enter → correlated protocol JSON text
```

The renderer package exposes exactly two operations:

- `exchange`: open or continue one dedicated App Chat, send a correlated structured turn, and return its validated response.
- `finish`: verify the session, use the exact Back action, and restore the original Codex task.

See [docs/USAGE.md](docs/USAGE.md) for installation, normal use, manual invocation, protocol examples, and failure recovery. The completed acceptance boundary is recorded in [docs/VALIDATION.md](docs/VALIDATION.md).

The renderer fills and focuses the unique editable Chat composer, then requests one fixed trusted Enter from Loader. It does not locate or click a Send button. Loader accepts that continuation only because the package declares `trusted-input`; callers cannot choose a key, coordinate, selector, CDP method, or JavaScript source. The same `exchange` payload is resumed after Enter so the message is never automatically resent.

Reply identity does not depend on the assistant's Copy button, localized button text, or a particular `pre > code` element shape. The renderer searches visible message text for a strict protocol object and accepts it only when `protocol`, `sessionId`, and `turnId` match the pending request. Local Codex SQLite files are not used: they contain Codex task/history records, not the authoritative App Chat conversation stream.

## Build and test

```powershell
npm run check
```

Outputs are written to `dist/loader-plugin` and `dist/codex-plugin`. A Loader folder install uses `dist/loader-plugin`; the Codex skill lives in `dist/codex-plugin`.

This clean redesign starts at version `0.1.0`. Building does not install either output and does not modify a running Loader or Codex instance.

## Protocol

Every request carries `protocol`, `sessionId`, `turnId`, objective, current state, message, and prior action results. Chat returns exactly one `codex-bridge-response-v1` fenced JSON block. Unknown fields, mismatched IDs, invalid status/action combinations, duplicate blocks, and more than eight actions are rejected.

Chat responses are advice, not authority. The skill executes actions sequentially through the Codex task's existing tools and permissions, stops on failure or user input, and sends the actual result back in the next structured turn.
