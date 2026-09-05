# Bridge vNext architecture

## Distribution

One `bridge-0.1.0.zip` contains the renderer and `skills/bridge-chat`, including its protocol reference. The schema-v2 manifest declares `agentSkill: "bridge-chat"` and the `agent-skills` permission. A compatible native Windows Loader manages one discoverable skill entry pointing into this installed package, so enable, disable, update, rollback, quarantine, and restore apply to both components. There is no separately installed Codex plugin or copied skill version. This does not make the skill an independent service or give the renderer arbitrary filesystem access.

## Runtime

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

The Bridge renderer exposes only `exchange` and `finish`. On the first exchange it records the existing sidebar keys, opens a new App Chat, verifies ChatGPT mode and Medium or High reasoning, fills and focuses an empty composer, and asks Loader for one fixed trusted Enter. Loader dispatches Enter once and resumes the identical operation and payload. The plugin confirms the exact user marker and extracts reply candidates only from the visible region between that marker and the next user message. Strict protocol validation then correlates IDs. Assistant toolbar labels and syntax-highlighted element boundaries are not reply identifiers.

One in-memory session, one in-flight invocation, and one unresolved turn are allowed. Turn payloads are immutable, completed responses are cached only behind a live identity check, and terminal failures prevent further sends. Reset invalidates outstanding waits. Later turns can reactivate the exact App Chat sidebar identity only while the sent anchor remains visible. `finish` uses the exact Back action and clears state after confirming that Chat was left; the original task destination is entrusted to App navigation. Missing or ambiguous identity produces a stable error rather than guessing or resending.

There is no daemon, MCP server, Tunnel, web ChatGPT surface, loopback listener, worker, project reader, settings plane, or durable recovery subsystem. Local Codex SQLite databases are explicitly outside the transport: they describe Codex tasks and tool history and are not the authoritative source for App Chat messages.
