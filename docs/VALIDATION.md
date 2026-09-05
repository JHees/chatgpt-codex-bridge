# Bridge 0.1.0 validation

## GitHub distribution and CI — 2026-09-05

The public update source is `JHees/chatgpt-codex-bridge`. Local `npm run check` passed **50 tests**, typecheck, lint, build, ZIP creation and release-package verification after adding the manifest update contract. The CI workflow YAML was parsed locally; live workflow status is available under [GitHub Actions](https://github.com/JHees/chatgpt-codex-bridge/actions/workflows/ci.yml).

Normal CI publishes test artifacts only. A stable version tag must match every package version and the declared repository before its ZIP and checksum can be published as a Loader update. Initial source publication keeps version **0.1.0** and does not itself create a version tag or Release. No current Loader/plugin installation is changed by this work.

## Single-package installation — 2026-09-05

The current Bridge source builds one `bridge-0.1.0.zip` and its SHA-256 file, plus the unpacked form of the same package. `npm run check` passed typecheck, lint, all **49 tests**, renderer build, and packaging. The relocated `skills/bridge-chat` passed the skill validator. The ZIP contains 7 entries, including its manifest, renderer, skill, and protocol reference; it has no second `.codex-plugin` package. Its generated checksum was verified independently.

An isolated compatibility check passed the **actual ZIP** through the native Loader's public package interface using fresh temporary Loader and user-skill directories. It verified install, disable, enable, same-ID replacement with enable-state preservation, quarantine, and restore. The test removed only its temporary files and link. It did not inject the renderer or exercise Chat.

Loader changes were authorized separately and preserve its pre-existing worktree changes. Native Release solution build passed with **0 warnings / 0 errors**; `CodexScriptLoader.Tests` passed **227 assertions**. Node `npm run check` and all **100 tests** passed independently. New native regressions cover malformed pipe input, bounded response errors, legacy commands during a pending invocation, a full reload against simulated CDP while a plugin Promise remains pending, configuration preservation, per-plugin manifest failures, update/removal serialization, and bundled-skill lifecycle/rollback/conflicts/recovery. A deterministic regression also verifies that status and injection-plan reads cannot overwrite a pending enable change.

Bridge remains **0.1.0** and Loader remains **0.5.9**. No release version, tag, remote, or current installation was changed. Loader installer packaging/signature checks, installation through the live settings UI, skill discovery inside Codex, and live Chat acceptance have **not** been performed for this working tree. This source capability requires a rebuilt native Loader; plugin hot reload cannot update the native binary.

Background transport, automatic Chat deletion, and a Bridge-specific behavior settings page remain unimplemented. The skill is now installed with Bridge from Loader's management page; there is no separate in-page skill installer to complete. See [NEXT_FEATURES.md](NEXT_FEATURES.md).

## Previous implementation review (`12a74ea`) — 2026-09-05

At that checkpoint, `npm run check` passed typecheck, lint, all 49 tests, renderer build, and the then-separate package outputs. The packaged skill passed the skill validator and includes its protocol reference. Regression tests were first observed failing against the previous implementation. A combined test uses the actual controller and DOM adapter through repair, result reporting, duplicate reads, and finish.

Those controller/DOM changes have **not** been installed, hot-reloaded, or accepted against a live Chat. That earlier review did not modify Loader source, version fields, tags, or remotes. Live acceptance of the modified send checks and DOM extraction remains necessary before release.

The subsequently requested transport and distribution work is separate from that checkpoint, as described above.

## Historical installed-runtime acceptance

The previous implementation recorded successful typecheck, lint, unit/DOM-fixture tests, build, package, and installed-runtime acceptance. Those records do not validate the new working-tree changes.

Installed acceptance completed two Medium App Chat turns in one session: the first response returned `continue`, the second returned `complete`, and `finish` restored the originating Codex task. The installed renderer package matched the clean build byte-for-byte. Loader injected two enabled scripts into one exact `app://-/index.html` target with zero failures.

The run used no Bridge daemon, MCP server, Tunnel, listener, web `chatgpt.com` target, worker, or project reader. Local Codex SQLite databases were inspected and rejected as a transport source because they contained Codex task/tool history rather than the authoritative App Chat message stream.

The receive path was separately exercised against syntax-highlighted JSON split across nested elements with no assistant action buttons. The send path requires only one editable textbox and one Loader-gated trusted Enter; it does not locate or click a Send button.

The Archify architecture source passed all 9 showcase checks with zero errors and warnings. The delivered HTML passed containment and readability checks at 1440×900, 1600×1000, 1920×1080, and 2048×1320 in light and dark themes.
