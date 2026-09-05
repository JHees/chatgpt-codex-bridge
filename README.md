# Bridge vNext

[![Bridge CI](https://github.com/JHees/chatgpt-codex-bridge/actions/workflows/ci.yml/badge.svg)](https://github.com/JHees/chatgpt-codex-bridge/actions/workflows/ci.yml)

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
- `finish`: verify the session and use the exact Back action to leave Chat. Returning to the originating task relies on the App's Back navigation.

See [docs/USAGE.md](docs/USAGE.md) for installation, normal use, manual invocation, protocol examples, and failure recovery. The completed acceptance boundary is recorded in [docs/VALIDATION.md](docs/VALIDATION.md).

The renderer fills and focuses the unique editable Chat composer, then requests one fixed trusted Enter from Loader. It does not locate or click a Send button. Loader accepts that continuation only because the package declares `trusted-input`; callers cannot choose a key, coordinate, selector, CDP method, or JavaScript source. The same `exchange` payload is resumed after Enter so the message is never automatically resent.

Reply identity does not depend on the assistant's Copy button, localized button text, or a particular `pre > code` element shape. Reading is bounded to the visible region after the exact sent user marker and before the next user message. Hidden content, composers, and user quotations are excluded; identical duplicate blocks remain ambiguous. Protocol validation checks `protocol`, `sessionId`, and `turnId` after extraction so malformed blocks can trigger the one-repair policy. Local Codex SQLite files are not used as an App Chat transport.

Calls are mutually exclusive. A pending turn cannot be overtaken, a turn ID cannot be reused with changed content, and uncertain sends or failed repairs stop the session until finish. The plugin protects unsent drafts and checks Medium/High reasoning before every send. The installed skill includes its own protocol reference.

This is a narrow adapter over internal App UI, not a stable public Chat API. Navigation/model labels and user-message Edit controls still require Chinese or English support. Generation completion uses visible controls plus stable text; arbitrary prose without a recognizable block may time out. Page identity changes fail closed instead of guessing. See [the implementation review](docs/IMPLEMENTATION_REVIEW.md) for fixes and remaining limits.

## Build and test

```powershell
npm run check
```

One release is written to `dist/bridge-0.1.0.zip` (plus its SHA-256 file). Install this ZIP once through a **schema-v2-compatible native Windows Loader**. The same package contains the renderer and `skills/bridge-chat`; Loader publishes and manages the skill automatically. There is no second Codex plugin to install. `dist/loader-plugin` is the unpacked form of the same package.

This clean redesign starts at version `0.1.0`. Building does not install the package or modify a running Loader or Codex instance. A pre-existing Loader 0.5.9 binary is not enough merely because its version matches: it must include schema-v2 bundled-skill support. Older builds reject the new manifest instead of silently installing only half of Bridge.

## GitHub releases and Loader updates

The canonical repository is [JHees/chatgpt-codex-bridge](https://github.com/JHees/chatgpt-codex-bridge). The plugin declares this public GitHub repository as its update source, using `bridge-{version}.zip` plus the corresponding `.sha256` asset.

After installing an update-aware package once, enable automatic updates for Bridge in Loader's plugin management page. Automatic replacement is opt-in and defaults to off. Packages installed before the update declaration need one manual replacement; the old package cannot discover a source it never declared. Local edits or additional permissions require confirmation, and failed activation rolls back the package and its skill.

Main-branch pushes and pull requests run Windows CI: locked dependency installation, typecheck, lint, tests, renderer build, and ZIP/checksum verification. The downloadable CI artifact is for testing, **not** a Loader update release. Pushing a matching stable `vX.Y.Z` tag additionally publishes the verified package to [GitHub Releases](https://github.com/JHees/chatgpt-codex-bridge/releases). There is no release merely from pushing `main`; release assets appear after the first version tag succeeds. No personal token or separate release service is required by the workflow.

See [the maintainer release guide](docs/RELEASING.md) for versioning, tagging, CI checks, and update troubleshooting.

## Protocol

Every request carries `protocol`, `sessionId`, `turnId`, objective, current state, message, and prior action results. Chat returns exactly one `codex-bridge-response-v1` fenced JSON block. Unknown fields, mismatched IDs, invalid status/action combinations, duplicate blocks, and more than eight actions are rejected.

Chat responses are advice, not authority. The skill executes actions sequentially through the Codex task's existing tools and permissions, stops on failure or user input, and sends the actual result back in the next structured turn.
