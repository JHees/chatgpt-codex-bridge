# Bridge architecture

One Loader package contains the renderer and bundled skill/helper. Installation, updates and rollback manage them together.

## Runtime

Current Codex task → bundled helper → Loader command client → current-user pipe → Loader-owned CDP → Bridge controller → App-owned Chat client.

Public operations remain status, exchange and finish. Loader validates the renderer and fixed allowlist; callers cannot supply JavaScript, selectors, ports or CDP methods.

- Configuration and UI: scoped storage holds defaults and host/task preferences. Drafts, frozen snapshots and active sessions stay in memory. The generic composer seam binds a short editable instruction to an accepted native submission.
- Cooperation controller: owns task binding, one active business session and automatic finish after executor completion plus planner confirmation. Failed cleanup of verified tasks is tracked separately by original task/session; it does not occupy the active slot. Final receipts support recovery, not a historical journal.
- Background session: owns immutable turns, action/result accounting, optional total request caps and hard deadlines, internal 90-second read windows, and one clarification. Default execution continues until completion. Actual user answers use accounted feedback; removing a cap or extending an explicit deadline remains UI-only.
- App Chat adapter: discovers native assets and dependency scope; sends and reads via native message IDs, parent nodes and stream completion. It labels the owned Chat and verifies ownership before deletion.
- Entry lifecycle: bounds service discovery/catalog loading, retries startup with backoff, and checks idle client identity. Partial UI registration is cleaned before retry. Recovery preserves the controller and bindings; an active session defers it. Stop cancels timers and invalidates in-flight attempts.

## Communication and persistence

The composer carries a short skill reference, model and configuration ID. Detailed rules live in the skill. No verified native separate-context submission middleware exists in the current Loader; the candidate does not replace global submission functions or hide injected prompt text.

Chat receives readable goal, progress, question and evidence sections. It replies in prose with a small explicit state header. The plugin maps a plan or question into local actions. Legacy JSON remains validated for compatibility. Chat intent is never tool authorization.

Only preferences persist. Accepted Bridge submissions transfer new draft preferences to the real task; unknown existing tasks start disabled. Drafts without submission receipts have no verified migration hook. See [candidate limits](UX-CANDIDATE.md).

Completion report plus Chat confirmation triggers configured cleanup. Generation, user intervention and uncertain ownership prevent automatic deletion. Cleanup failure preserves the target and reason; lost command output does not lose the latest automatic-completion reply. Reload never restores requests or scans historical Chats.

No foreground Chat navigation, trusted Enter, database writes, webpage ChatGPT, daemon, MCP server, tunnel, worker or listening port participates. The retired DOM adapter and controller have been removed.
