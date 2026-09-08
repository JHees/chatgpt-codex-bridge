# App Chat transport

Production uses the App-owned Chat client inside the exact app://-/index.html renderer, discovered from current local assets and native dependency scope. No separate login, webpage ChatGPT, SQLite access or foreground fallback participates.

## Send and read

The adapter assigns a native user message ID before sending once. Stream events establish conversation identity and observed reply IDs. Later messages reuse the owned conversation and final parent. Changed client identity or uncertain sending stops the session.

Each read window is bounded; the session separately owns the total deadline. Completion requires the final stream callback, native COMPLETE metadata and a unique assistant final message on the expected parent chain. All user messages must match the plugin's sent IDs and text. Late replies remain paused until explicit continuation.

## Readable conversation

Task briefs and evidence use natural-language sections; the collaboration role is introduced once. Replies start with one explicit status line, followed by a plan, question or completion rationale. Local calls remain structured for identity, budget and recovery. See the [protocol reference](../skills/bridge-chat/references/protocol.md).

## Naming and cleanup

After final reply and ownership checks, native rename(id, title) adds [bridge] to the original title once. The adapter reads back the result and reports naming errors separately. A later change to a confirmed owned title is intervention. Missing titles are reported, not invented. Titles are not ownership proofs.

Automatic finish requires a completed executor report plus Chat confirmation. Before delete, the adapter checks all user messages, the current parent and stream completion. An in-flight delete has one reusable promise; timeout never dispatches another delete. Rejected deletion stays retryable. Retain disposes in-memory ownership without deleting.

The old semantic-DOM transport remains inactive historical source, not a runtime fallback. Current candidate limits and acceptance are tracked [separately](UX-CANDIDATE.md).
