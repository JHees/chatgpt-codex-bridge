---
name: bridge-chat
description: Use visible Bridge collaboration instructions to consult a selected background Chat planner, execute its bounded actions in the current Codex task, and return verification evidence.
---

# Bridge Chat

Use this workflow when the user requests Bridge collaboration or submits visible Bridge instructions with a Loader submission identity. Chat plans and revises; the current Codex task executes and verifies. Execution model selection remains with the user, including Spark or Luna. Chat intent does not change the task's mode, tool availability or authorization.

## Connect to this submission

**Connection gate:** require an accepted binding and then a validated Chat response before substantive work. If connection fails before sending, report that Chat has not started; after sending, report the actual pending/error state. A completed Codex-only answer is not a successful Bridge collaboration.

1. Read [the local call and Chat protocol](references/protocol.md), including its PowerShell 7 invocation example, before invoking Bridge. Call the bundled [PowerShell helper](scripts/invoke-bridge.ps1) directly in the current PowerShell 7 process with `-PayloadJson`; construct JSON with `ConvertTo-Json`, not quote concatenation. It locates the native Loader client and validates its envelope. Renderer and skill are one Loader-managed package.
2. Obtain the `submission-…` binding ID from the outer visible Loader context and the `snapshot-…` ID from its instructions. Determine the actual host/task from this Codex task's provided context. Call `status` with that task and binding ID. Require an accepted native submission, matching task and prepared snapshot, and compatible background/composer capabilities. If binding is absent, ask the user to enable Bridge in the task panel and submit its visible instructions; do not invent or copy another task's binding.
3. Use the returned **prepared** configuration, not newly changed defaults. The native local task exposes its ID through `CODEX_THREAD_ID`; use that verified value when available rather than parsing a sidebar title or URL. Chat model/mode and thinking parameters are selected in the UI. Keep Pro explicit and never substitute a model. Task creation, executor-model changes, navigation, database writes, credential extraction and separate transports are not part of Bridge.
4. Perform minimal read-only checks to describe the objective, constraints, deliverables, current mode/tools, existing changes, failure baseline and verifiable completion criteria. Send relevant evidence, not the full project or history.

## Plan, execute, report

Generate one session ID and fresh business turn IDs. Keep each complete local exchange object unchanged for continuation. Calls are sequential.

**Use the fixed waiter.** The helper's default `exchange` automatically reads across short windows and performs the plugin's one allowed repair, with the identical payload, until a validated reply, explicit pause or error. It runs only as the attached tool process; it never executes Chat actions. Use `-SingleRead` only for diagnostics. Read the installed skill again on a new submission after an update instead of relying on a previous copy in task history.

**Wait for the tool before interpreting Bridge.** Preserve the full execution-tool result (`text(result)`, not just `text(result.output)`). A `session_id` means the helper process is still running: call `write_stdin` for that exact session until it exits, collecting its output. An outer `Script running with cell ID` requires `functions.wait` for that cell. Empty interim output is not a Bridge error and is not a reason to finish or start another exchange. See the [execution-wait example](references/protocol.md#execution-tool-completion) before using a long-running helper call.

- `response`: process the validated `response` object. Prefer 1–3 coherent actions per round. Each action needs a bounded scope, preserved constraints, expected evidence and a stop condition. Gather information or report ambiguity instead of inventing a major decision.
- `waiting`: call `exchange` again with the **identical saved object**. This reads the same sent turn; no new turn, business round or deadline reset. A short read window is not the entire reply deadline.
- `repair-required`: this is a successful intermediate result, not a connection failure. Continue `exchange` with the identical saved object to dispatch the plugin's single repair, then handle its resulting state. This extra Chat request is not a business round. A second invalid reply returns `PROTOCOL_INVALID` and stops.
- `paused`: report the waiting limit and let the user choose **Continue waiting** or end the session. Late replies do not authorize action. After explicit continuation, reuse the same object.
- `already-delivered` or lost command output: use the [read-only recovery query](references/protocol.md#read-only-result-recovery) for the original binding/session/turn. Recovering a reply is not permission to repeat actions. Reconcile it with the actual tool/action ledger before executing anything not yet done.

Execute actions in order using actual available tools. Chat shell text is not an executable command channel. At the first failed, blocked or user-input action, stop remaining dependent actions and report them as skipped. Record each action under **session + response turn + action ID**, including outcome, actual work and evidence. The next result uses `replyToTurnId` and accounts for every preceding action exactly once and in order.

For code, include actual test/build commands, exit codes and relevant counts/diffs. For documents, data or external operations, use appropriate artifacts and independently checked results. A launched process, generated filename or click alone is not success. Separate pre-existing failures, environment limits and new regressions.

After two feedback rounds without verifiable progress, ask Chat for a different inspection path using the new evidence. If no actionable path results, pause for the user. Do not repeat the same failed action without changed evidence, plan or environment, or weaken tests to hide failure. Reconcile changed user goals before dependent actions or another Chat exchange.

## Pause and finish accurately

The batch budget includes feedback and final confirmation. The last round's authorized actions may run, but do not send an unbudgeted “last report.” On `BUDGET_EXHAUSTED`, ask the user to allow the next batch in the task panel. `needs_user` pauses until the user supplies the required input and confirms in the panel. Preserve the Chat while paused.

`complete` is **the planner's suggestion**, not proof of delivery. Before normal finish require actual actions/verification completed, artifacts checked, evidence reported to Chat and no unresolved failures/blockers. Report verified completion with `state.phase: complete`, actual `state.completed` evidence and empty blockers, then obtain Chat's complete reply. If Chat completes prematurely, send a budgeted result with fresh local evidence and no unknown actions rather than claiming success or silently deleting evidence. `COMPLETION_UNVERIFIED` refuses automatic deletion before the completed report; explicit user termination remains in the task panel. Final delivery states actual changes, evidence, outputs and limits. Commits, pushes, publishing and deployment retain their separate authorization requirements.

After verified completion call `finish` for the owned task/session using the frozen cleanup policy (delete by default). Explicit user termination may retain it instead. Generation in progress, user intervention, uncertain identity or cleanup failure prevents automatic deletion. Cleanup failure keeps the exact target for retry or retention; never scan historical Chats for cleanup. Reload/restart loses in-memory collaboration and does not restore or resend it.

## Errors

- `LOCAL_REQUEST_INVALID`: the business request was rejected before session/turn mutation or sending. Correct the object using the complete feedback example; `replyToTurnId` belongs beside `request`, not inside it. Keep the intended IDs. This is not permission to retry `PROTOCOL_INVALID`, an uncertain send or an already-admitted turn.
- `POWERSHELL_7_REQUIRED` or input validation: no request was sent. Correct the invocation using the example in the protocol reference. Use PowerShell 7, not `powershell.exe`.
- `LOADER_ACCESS_DENIED`: no command was sent. Request the execution tool's normal permission escalation for the **same helper and payload** to access the installed Loader. If approval is unavailable or denied, stop and report the access gap. Do not change installation paths, permissions or execution model, or reinstall Loader to work around the sandbox.

- `SUBMISSION_UNCONFIRMED`, `TASK_MISMATCH`, `CONFIGURATION_MISMATCH`, `CHAT_CONFIGURATION_REQUIRED`, `APP_UNSUPPORTED`: pause at the indicated gap. Do not fall back to foreground clicks or Codex-only execution without the user's choice.
- `CALL_BUSY`, `TURN_PENDING`, `SESSION_OCCUPIED`: read/finish the known owned call; never overlap, steal or queue behind another task.
- `USER_CONFIRMATION_REQUIRED`, `BUDGET_EXHAUSTED`: await task-panel consent. Grants are not host-command options.
- `COLLABORATION_DISABLED`: stop sends and repairs. Switching off does not retract sent data or terminate Codex tools.
- Outer timeout or invalid/missing envelope: the transport did not prove whether the plugin completed. Use only the read-only recovery query first; never start a replacement session or resend based on an empty output. A tool process identifier still available must be waited on instead.
- `SEND_UNCERTAIN`, `SESSION_LOST`, `PROTOCOL_INVALID`, `USER_INTERVENED`, rate/permission errors or unknown error: stop. Do not infer “not sent” or start a replacement session. Preserve the exact state when possible and report the stable code without private content.
