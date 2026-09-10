# Bridge — background planning and execution

[![Bridge CI](https://github.com/JHees/chatgpt-codex-bridge/actions/workflows/ci.yml/badge.svg)](https://github.com/JHees/chatgpt-codex-bridge/actions/workflows/ci.yml)

Bridge connects a user-selected **App Chat planner** to the **current Codex executor**. It keeps both model choices independent: Chat can plan and revise; Codex uses its existing tools and permissions to execute, verify and deliver.

**Bridge 0.1.3** adds collapsible instructions in drafts and sent messages, two-way synchronization between Remove and the collaboration switch, compact settings menus, and explicit delete/archive/retain handling without a busy local read blocking termination. See [release notes](docs/RELEASE-0.1.3.md) and [validation scope](docs/UX-ITERATION.md). Building this repository does not update an installed package. Historical changes remain documented in the [0.1.2 notes](docs/RELEASE-0.1.2.md) and [0.1.1 notes](docs/RELEASE-0.1.1.md).

## Runtime

```text
Current Codex task → bundled bridge-chat skill + PowerShell helper
→ Loader command client → current-user named pipe
→ Loader-owned CDP → Bridge renderer → App-owned Chat client
```

Three allowlisted operations cover the workflow:

- `status`: read native submission binding, frozen preparation, model catalog and current state.
- `exchange`: send one structured business turn or continue reading that exact turn.
- `finish`: end the owned session and explicitly delete, archive or retain its dedicated Chat. User-requested termination is separate from verified completion; a busy local read is interrupted without cancelling native generation.

The App adapter discovers the current local resource graph and App-owned dependency scope. It sends and reads through the native Chat client, correlates messages and parent nodes, and checks ownership before cleanup. It does not navigate, focus a Chat textbox or request trusted Enter. It does not create a daemon, MCP server, webpage ChatGPT session, database writer, project reader or listening port.

## User controls

A Loader settings page saves defaults. A compact task control uses Loader's generic composer interface to prepare **visible, editable instructions** before normal native submission. Only an accepted, matching native receipt permits background collaboration. A configured switch is not proof that Codex has invoked Bridge.

Defaults: off, no selected Chat model, 3 business rounds, 90-second read windows, 15-minute total reply wait, delete after verified completion. Thinking options come from the selected native model. Pro is explicit and never an automatic fallback. Task preferences persist under host/task identity; active sessions and frozen snapshots remain memory-only. Unknown existing tasks start disabled instead of inheriting an opt-in intended for new tasks.

Long replies use repeated short reads without resending or resetting their deadline. Deadline, user-input and batch-budget pauses require explicit task-panel consent. Chat responses remain untrusted intent; a planner's `complete` is not proof of local verification or user delivery.

Read the [Chinese usage guide](docs/USAGE.md), [bundled protocol reference](skills/bridge-chat/references/protocol.md) and [architecture diagram](docs/bridge-redesign.architecture.html).

## Installation and updates

One ZIP contains the renderer and `skills/bridge-chat`, including the helper. Loader manages the skill with installation, updates and rollback. There is no second installation step.

Use **native Windows Loader 0.5.12 or later** for the complete 0.1.3 experience, including folded drafts and two-way removal notifications. Loader 0.5.11 provides the base schema-v2 skill, settings/storage and native submission interfaces but lacks those UI extensions; older hosts fall back to visible instructions without reverse Remove synchronization. Check Bridge diagnostics before use; this plugin does not update Loader.

The update source remains [JHees/chatgpt-codex-bridge](https://github.com/JHees/chatgpt-codex-bridge). Stable releases use `bridge-{version}.zip` and its `.sha256`. Loader automatic replacement is opt-in; new permissions/local edits require confirmation. Main-branch CI artifacts are test packages, not Loader update releases. See [RELEASING.md](docs/RELEASING.md).

## Development and acceptance

Run `npm run check` for typecheck, lint, tests, build and ZIP validation. Generated artifacts stay under `dist`; builds do not install, publish or change versions.

Live validation includes a three-round **GPT-5.6 Sol / Medium → GPT-5.6 Luna** research loop with actual source checks, evidence feedback, planner confirmation and final delivery. Earlier transport validation exercised verified deletion. Coding/failure-repair, Spark and Pro combinations remain unaccepted; this is not blanket support for every model/task. Pro generation tests need explicit authorization. CI uses simulated clients and clocks.

The old DOM implementation remains temporarily in source/tests pending replacement gates but is no longer imported by the entry or included in its runtime bundle. There is no foreground fallback.
