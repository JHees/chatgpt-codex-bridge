# Bridge security model

Bridge is trusted renderer code running as the same Windows user as Codex. Its controls make task scope visible and prevent accidental cross-task use; they are not a sandbox against other code running as that user.

## Authorization

Only Loader's declared `status`, `exchange`, and `finish` commands are available to Codex. Each task starts with collaboration off. A user enables Bridge from that real task's composer and chooses its Chat model. Bridge applies the selected model and session settings to that task and keeps them fixed for the active session. A draft without a real task ID cannot start a session.

The task switch is the authority. Bridge does not treat an instruction string, model reply, task status call or request payload as permission to turn collaboration on. Chat text is untrusted advice. Codex applies its usual authorization checks before running tools. The plugin does not parse suggested actions into executable commands or certify that Codex's reported tests were actually run.

## Identity and request safety

The helper obtains Loader's user installation from the registered user folder. The command client uses Loader's current-user pipe; its allowlist fixes the plugin and operation. The renderer runs only in `app://-/index.html` and uses App-owned Chat services. Callers cannot choose JavaScript, ports, targets, selectors or native API methods.

Every request carries the host/task identity and the current Bridge `instanceId`. A session freezes its task and model. Every message has a `requestId`; changing its text under the same ID is rejected. The coordinator records a request before native send, shares a concurrent read, and caches the reply. Repeating an identical request reads the existing native message. Reload changes the instance ID and rejects old requests, so they cannot accidentally create another generation.

Native Chat correlation uses the returned conversation ID, user message IDs, response events, parent chain and current native-client identity. If sending or ownership is uncertain, Bridge reports that state and retains the Chat. It never assumes a timeout means “not sent”, substitutes another model, or retries under a new ID.

## State and data

Task preferences (enablement, model and user-selected limits/cleanup) use Loader-scoped storage. The active conversation, IDs, prompts and replies stay in memory. Reload or restart drops volatile state and does not restore, replay, enumerate or clean historical Chats.

New tasks default to retaining the Chat. An explicit cleanup choice saved on an existing task remains in effect. `finish` after verified work follows that task's chosen policy; an explicit user stop defaults to retain. Delete or archive still requires a known owned conversation with no unresolved native generation. Ending the local waiter does not stop generation already accepted by Chat. If `finish` returns `nativeGenerationMayContinue: true`, local collaboration ended while native generation may still finish.

No credentials are read or logged. Bridge does not write SQLite, start a daemon, add an MCP service, or connect to web ChatGPT. The helper and plugin never log prompts or replies.
