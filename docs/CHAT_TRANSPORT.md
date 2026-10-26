# Native Chat transport

The Chat adapter connects to the App-owned Chat client in the exact `app://-/index.html` renderer. It discovers the current local assets and service scope, then verifies that the selected client is still the one mounted by the App. It does not open the Chat page, manipulate the composer, extract login credentials or use SQLite.

## Send and read

The session coordinator gives each plain-text message a request ID and registers it before calling the adapter. The adapter sends through the current App client with the frozen model and available model parameters. A successful native completion returns its conversation and message IDs. Repeating a request ID with the same text reuses that message; using a different text is rejected.

Reads poll the existing native generation and return `waiting` or its completed plain-text response. They never send. Completion is accepted only when native stream status, assistant message ID and the expected conversation parent chain agree. User intervention, a changed client or an uncertain send leaves the session unresolved and visible in status.

The command helper keeps each tool call bounded. It retries read windows with the same payload, not native sends. A caller continues with the same `instanceId`, `sessionId`, `requestId` and text. After plugin reload the new `instanceId` rejects the previous request, preventing accidental duplicate generations.

## Model choice and limitations

The adapter reads the native model catalog for the settings menu. Pro is available only when the user selects an available Pro option. If Codex changes its private renderer services, model discovery or send/read returns a clear error; Bridge stops and does not switch models. There is no stable public plugin API for these services.

Bridge never interprets Chat prose as a tool action. Codex inspects suggestions, applies normal permissions, performs the work and sends actual evidence back. The adapter passes plain text in both directions; the skill owns that review loop.

## Cleanup

The selected per-task policy defaults to `retain` for new tasks. Explicitly saved choices for existing tasks are kept. A user-requested stop retains the Chat by default. Delete or archive runs only for the session's confirmed native conversation after generation has finished; failure leaves the target available for the user to keep or resolve.
