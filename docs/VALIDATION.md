# Bridge 0.1.0 validation

## Current working-tree review — 2026-09-05

`npm run check` passed typecheck, lint, all 49 tests, renderer build, and both package outputs. The packaged skill passed the skill validator and includes its protocol reference. Regression tests were first observed failing against the previous implementation. A combined test uses the actual controller and DOM adapter through repair, result reporting, duplicate reads, and finish.

These current working-tree changes have **not** been installed, hot-reloaded, or accepted against a live Chat. No Loader source, version field, Git history, tag, or remote was changed in this review. Live acceptance of the modified send checks and DOM extraction remains necessary before release.

The subsequently requested background transport, automatic conversation deletion, settings page, and in-page skill installation are a new scope, not functionality proven by these 49 tests. See [NEXT_FEATURES.md](NEXT_FEATURES.md).

## Historical installed-runtime acceptance

The previous implementation recorded successful typecheck, lint, unit/DOM-fixture tests, build, package, and installed-runtime acceptance. Those records do not validate the new working-tree changes.

Installed acceptance completed two Medium App Chat turns in one session: the first response returned `continue`, the second returned `complete`, and `finish` restored the originating Codex task. The installed renderer package matched the clean build byte-for-byte. Loader injected two enabled scripts into one exact `app://-/index.html` target with zero failures.

The run used no Bridge daemon, MCP server, Tunnel, listener, web `chatgpt.com` target, worker, or project reader. Local Codex SQLite databases were inspected and rejected as a transport source because they contained Codex task/tool history rather than the authoritative App Chat message stream.

The receive path was separately exercised against syntax-highlighted JSON split across nested elements with no assistant action buttons. The send path requires only one editable textbox and one Loader-gated trusted Enter; it does not locate or click a Send button.

The Archify architecture source passed all 9 showcase checks with zero errors and warnings. The delivered HTML passed containment and readability checks at 1440×900, 1600×1000, 1920×1080, and 2048×1320 in light and dark themes.
