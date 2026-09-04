# Bridge vNext architecture

Bridge vNext has one request path and one return path:

```text
Codex task
  -> bridge-chat skill
  -> CodexScriptLoader.Command.exe
  -> current-user Loader named pipe
  -> Loader-owned, verified CDP session
  -> dev.codex-chat-bridge in app://-/index.html
  -> App Chat composer/navigation DOM
  -> correlated protocol JSON text over the same path
```

The Loader interface is business-neutral. A plugin manifest allowlists fixed operation names, and the command client carries one bounded JSON object. Loader retains the random CDP endpoint, exact renderer selection, timeout, and result envelope; no caller can choose CDP details or JavaScript.

The Bridge renderer exposes only `exchange` and `finish`. On the first exchange it captures the visible Codex state, opens a new App Chat, verifies ChatGPT mode and Medium or High reasoning, fills and focuses the composer, and asks Loader for one fixed trusted Enter. Loader dispatches Enter once and resumes the identical operation and payload. The plugin then confirms the unique user marker and finds the reply by parsing visible protocol JSON whose `protocol`, `sessionId`, and `turnId` match the pending request. Assistant toolbar labels and syntax-highlighted element boundaries are not reply identifiers.

One in-memory session is active at a time. Later turns reuse the exact App Chat sidebar identity. `finish` uses the exact Back action and clears session state only after restoration is verified. Missing or ambiguous identity produces a stable error rather than guessing or resending.

There is no daemon, MCP server, Tunnel, web ChatGPT surface, loopback listener, worker, project reader, settings plane, or durable recovery subsystem. Local Codex SQLite databases are explicitly outside the transport: they describe Codex tasks and tool history and are not the authoritative source for App Chat messages.
