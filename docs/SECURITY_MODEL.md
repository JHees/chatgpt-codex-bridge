# Bridge security model

Bridge is trusted local renderer code coordinating one Codex task with one dedicated App Chat. It does not sandbox arbitrary same-user code or make Chat output trusted.

## Fixed interface

Only manifest-declared status, exchange and finish are callable through Loader's current-user pipe. Loader owns the random loopback CDP endpoint and exact main renderer. Payloads cannot choose ports, targets, methods, selectors or JavaScript. Command size limits and outer timeouts remain Loader-owned.

Settings, scoped storage and composer capabilities use the generic plugin interface. Short instructions remain editable before native submission. There is no global submission replacement, hidden authority injection, foreground Chat input, executor-model change or permission grant.

## Identity and intent

An accepted native submission binds configuration to host/task. One session and one unresolved turn are active. Sent turns cannot change content or resend; reads and clarification retain the original turn. Native IDs, parent ancestry, unique final reply and full user-message ownership checks establish Chat correlation. Navigation does not change ownership; instance replacement stops collaboration.

Natural-language replies require an explicit state header: completion is not inferred from prose. Legacy JSON validates IDs and fields. Plans are untrusted intent. Codex checks each step's scope, permission and actual result; code blocks are not an executable command channel.

## Persistence and disposal

Only defaults and task preferences persist. Prompts, Chat IDs, sessions and execution history do not. Unknown existing tasks start disabled. Pro remains explicit; unavailable models are not replaced.

Automatic deletion requires a completed executor report and planner confirmation, then adapter ownership/generation checks. This report is an attestation, not independent proof that tools ran. User intervention, unresolved generation or uncertain ownership prevents deletion. A [bridge] title alone never authorizes deletion. Failed cleanup of verified work preserves the exact target independently of the active slot; retain releases it. Its verified reply and the latest completion receipt support lost-output recovery without resending or repeating actions.

No restart recovery or historical cleanup runs. The plugin does not extract credentials, write databases, start a daemon/MCP/worker or create web ChatGPT targets. Disabling collaboration cannot retract data already sent.
