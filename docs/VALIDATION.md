# Bridge validation history

Current unreleased UX work is tracked in [UX-CANDIDATE.md](UX-CANDIDATE.md). Entries below are historical results, not evidence that later candidates passed live acceptance.

## Protocol compatibility and live Luna research loop — 2026-09-06

The next reported failure was different from the lost-output failure below. The executor correctly waited for the command process, which returned `PROTOCOL_INVALID` after one repair. Both Chat replies used research-oriented action types absent from the canonical enum. The outgoing prompt had omitted that enum, and the repair prompt gave only a generic schema reminder. This was a protocol-contract defect, not an established transport timeout.

- Initial and repair prompts now share the complete response contract, exact identities, allowed actions, role boundaries and a valid example. Repair includes the specific sanitized validation reason; it remains limited to one attempt.
- Following explicit user direction, the receiver accepts a single canonical or `json` fence, or a single bare JSON object. It removes only the redundant `kind: "response"` field and maps a finite set of research/analysis synonyms to `inspect`. IDs, unknown fields/types, action association, status invariants, ambiguity checks and execution authorization are not relaxed. Regression tests cover accepted equivalents and rejected ambiguous or conflicting inputs.
- The existing research Work kept its **GPT-5.6 Luna / light** executor and used **GPT-5.6 Sol / thinking / Medium** as its background Chat planner. A visible native submission carried a fresh accepted task binding. The operator prepared that bounded test submission, but did not correct, resend or send follow-up instructions during the execution loop.
- In the same dedicated Chat, turn one returned three inspection actions. Luna actually searched and opened public sources, then reported evidence in turn two. Chat returned three further verification/inspection actions; Luna opened the sources again and reported the verification results in turn three. Chat returned `complete` with no actions, `finish` returned `ended / retain`, and Luna delivered its final cited answer in the original Work. The Chat contains exactly three business requests and three replies, without a repair request or duplicate business send.
- This establishes one real **non-Pro Sol → Luna non-coding research loop**, including tool-result feedback and final delivery. It does not certify coding/failure-repair, Spark, Pro, a real 15-minute response, or the entire submission/visual matrix. Research conclusions remain subject to their cited evidence; this record certifies the collaboration sequence, not a general claim that model conclusions are correct.
- Typecheck, lint, **133 tests / 14 files**, renderer build and single-package verification passed. The candidate was installed with the native Loader package interface and hot-reloaded; the failed Chat and successful verification Chat were retained. Loader source/binaries, executor model, versions, Git commits and releases were not changed. Bridge remains a local **0.1.0 candidate**, pending user acceptance and a separately authorized release.

## Fixed turn waiter and read-only reply recovery — 2026-09-06

The follow-up research Work again printed only the execution tool's output and finalized after an empty intermediate chunk. Read-only native status confirmed an accepted binding, one business round, no error, no active call, and `awaiting-verification` with no completed executor report. This is a validated planner reply waiting for local verification, not an established Chat timeout. The task had reused its earlier invocation pattern despite the preceding skill update.

- Default helper exchanges now continue successful short-window waits and the single permitted repair using unchanged JSON. Each native command remains short; the plugin owns the total deadline. Pauses, errors and lost transport stop the helper; it never runs actions or grants consent. `-SingleRead` preserves diagnostic access to an individual window.
- `status.read` is bound to the original task, submission, session and turn and reads only validated in-memory replies. It never sends or repairs. Wrong ownership is rejected; accounted replies do not return old actions; deadline/disabled/terminal states do not expose pending raw content. Callers must reconcile recovered replies with actual tool evidence, since reading is not an execution acknowledgment.
- The original lost-result regression failed on the old status interface and passed after the change. Tests cover repeat readback with one send, ownership, feedback accounting, cloned responses, disabled and deadline gates, and the real PowerShell wait loop stopping on pause/error/transport failure. **130 tests / 14 files**, typecheck, lint, build, ZIP verification and skill validation passed.
- UI wording distinguishes an available Chat reply from proof of executor receipt. Each newly prepared visible instruction points to the current installed skill and to readback recovery. These controls do not wake an already-ended Codex turn or prove unattended Luna/Spark compliance.
- After explicit approval, the exact research collaboration returned `ended / retain`, and the candidate renderer plus bundled skill were transactionally installed with a recoverable backup and hot-reloaded. Native checks confirmed `running`, one accessory, available composer/settings/background capabilities, no error, no active session, linked matching skill resources, and zero injection failures. The research Chat was retained, not resent or continued. No new Chat generation, research execution, deletion, Loader modification, version change, commit or release occurred. This is source/isolated and runtime-installation validation, not a new unattended Luna loop or recovery across plugin instances.

## Exchange completion handling and automatic settings — 2026-09-06

This follow-up supersedes the Save-button behavior recorded below. Inspection of the reported research Work showed a successful submission binding and a started background exchange. The executor printed only a running command's `output`, discarding its process session identifier, then reported failure without waiting for completion. The command later exited successfully with `repair-required`; an empty intermediate tool output was not evidence of a failed send.

- The bundled skill now preserves complete execution-tool results, waits on the owning process/cell, and interprets the completed command envelope. It explicitly continues the identical saved turn for the one permitted protocol repair. A delayed, non-generating command reproduced an empty initial output with a process identifier, then completed through the same process wait. This verifies tool mechanics, not unattended model compliance.
- Public session status and the task panel distinguish a reply requiring protocol repair from a reply still being generated. Regression coverage verifies one repair, unchanged business-round count, and no duplicate send on rereading the delivered turn.
- Defaults save immediately on valid changes, without a Save button. Invalid numbers are not persisted; storage failures report an unsaved state and retain the last valid defaults. Existing task choices and active snapshots remain independent. Diagnostics uses a compact right-aligned button in the existing settings-row style and does not generate a Chat request.
- Typecheck, lint, **126 tests / 14 files**, renderer build, single-ZIP verification and official skill validation passed. Native checks changed the round limit, verified persistence after reopening, and restored its original value. The light-theme screenshot confirms the removed Save button and compact diagnostics row; the diagnostic button measures **48 CSS pixels** wide. This scoped check does not replace the remaining full visual/product matrix.
- With explicit approval, the pending collaboration was ended with **retain**, then the renderer and bundled skill were transactionally hot-updated with a recoverable backup. The existing research Chat was not deleted, repaired, resent or continued. Reload does not restore its old in-memory binding. Loader reported zero injection failures. Default values were restored after testing.
- Bridge remains **0.1.0** as a local candidate. Loader was not modified in this follow-up. No fresh Chat generation, executor-model change, Pro use, commit, push or release occurred. A fresh unattended Luna/Spark loop remains unverified; clearer skill instructions alone do not establish that acceptance.

## Work-to-background-Chat connection fixes — 2026-09-06

The earlier native-submission acceptance Work deliberately prohibited tools and Chat. It proved a Work submission receipt only, not creation of a Chat or a planner/executor loop. Its executor model is independent of the selected Chat planner; Bridge does not change it.

The reported research Work did receive the visible Bridge instructions and read the bundled skill. It failed before any exchange: incorrect PowerShell invocation, then a sandbox installation-read denial mislabeled as an invalid installation pointer. The executor subsequently proceeded alone. The helper now distinguishes PowerShell 7, explicit process stdin and access denial; the skill includes direct invocation examples, normal tool-approval handling, and an explicit pause-on-connection-failure gate. Accepted submissions awaiting an executor are visibly distinguished from an active Chat.

Live acceptance additionally exposed literal newline text nodes collapsing into spaces when the native composer reparsed an edited draft. Loader's generic composer adapter now uses native hard-break nodes and retains exact serialized-context verification. The regression failed before the fix; the actual edited-and-submitted draft then produced an accepted receipt with matching task, native turn and snapshot. No fuzzy matching or binding bypass was introduced.

- Bridge: typecheck, lint, **122 tests / 14 files**, renderer build, single ZIP validation and official skill validation passed.
- Loader: syntax checks and **135 Node tests** passed; independent native Release build had **0 warnings / 0 errors**, with **274 native tests** passing. Only its external composer resource was hot-updated, not binaries.
- Authorized live loop: the existing Work retained its Astra High executor and selected **GPT-5.6 Sol / thinking / Medium** for background Chat. First Chat reply returned one verification action; the Work actually ran an in-memory arithmetic check, producing `6 * 7 = 42`, `equals_42 = True`, exit code **0**. The second business turn reported that evidence to the same Chat, received matching `complete` with no actions, then `finish` returned `ended / delete`.
- The initial feedback object incorrectly nested `replyToTurnId` inside `request`; strict validation rejected it before sending. After source-verified correction to the top-level local envelope, the same intended feedback turn completed without repeating the first turn/action. The current source adds a complete feedback example and a tested `LOCAL_REQUEST_INVALID` pre-send error distinct from invalid Chat replies. **This live loop required that correction; it is not evidence of fully unattended execution.**
- Only the test's dedicated Chat was deleted. No project files were changed by the executor, no new Work was created, no Pro generation ran, and no executor model changed. No front-end Chat navigation was used for transport.
- Bridge and its bundled skill were transactionally hot-updated with recoverable backups; Loader's generic external resource was separately backed up and reloaded. Versions remain **0.1.0 / 0.5.10**. No commit, push, tag or release occurred; existing unrelated worktree changes were preserved.

Non-Pro → Spark/Luna and Pro → Spark/Luna remain separate unaccepted combinations. This bounded arithmetic loop does not certify coding, long-wait or all submission-method acceptance.

## Cascading model menu and native settings redesign — 2026-09-06

Supersedes the prerequisite/partial-selection behavior below. The current user request explicitly allows default and nearest-supported effort selection after a user chooses a model family. This is a UI choice only: runtime snapshots, unavailable-model rejection and the background protocol are unchanged.

- Task controls now use whole model rows with hover/right-arrow submenus. Clicking a family picks its default/closest supported preset; a user can also choose a preset directly from hover. Pro is excluded from distance matching; explicit Pro-only families and exact saved Pro presets remain allowed. Ties prefer the lower level.
- The defaults page uses the native settings heading, grouped 20px-radius rows, native text/color tokens, and the same model picker. It removes the duplicate heading and inherited flex gaps. Changes persist only on Save; task selections do not write defaults. The settings shortcut still uses the Loader page-opening interface.
- Bridge typecheck, lint, **117 tests / 14 files**, build and ZIP verification passed. Lucide's two library icons are bundled, with their license; no runtime package import is required. A read-only dependency audit reports one low-severity existing esbuild development-server advisory, not a Lucide/runtime dependency issue; no development server is started.
- Native candidate validation: one running plugin instance; model-row hover expands the preset submenu without selecting; system settings navigation works; desktop light/dark screenshots compared with native/Better UI references in the same image input. An 800px settings viewport wraps without clipping. Temporary theme and viewport checks restore their prior values. Detailed visual scope and remaining checks are in `design-qa.md`.
- No Chat messages or Pro generations were sent. Existing settings and other plugins are retained. Bridge stays at **0.1.0** as a candidate; no commit, push, tag or release. Loader source/resources were not changed in this UI iteration. The four real planner/executor combinations remain separate, incomplete product acceptance gates.

## Partial selection and native settings navigation — 2026-09-06

Supersedes the pending Loader-navigation limitation below. The user authorized both repositories and runtime hot updates. Native reproduction showed that selecting a model without an effort and dismissing the quick selector lost the model group; reopening disabled the dependent select with an unhelpful placeholder. The native dropdown itself opened normally once a model was selected. Task-scoped in-memory group retention fixes the reproduced path; an unselected model now has an explicit prerequisite label.

- Bridge: **111 tests / 13 files**, typecheck, lint, build and single-package verification passed. A regression failed before the state fix and passed afterward.
- Loader: syntax checks and **134 Node tests** passed; independent Release build had **0 warnings / 0 errors**, with **274 native tests** passing. Only the shared settings-host resource was deployed, not native binaries. New generic tests cover page opening, shared pending calls, existing settings, unavailable/ambiguous entry, timeout, busy ownership and revoked registration.
- Runtime: Bridge package and bundled skill were updated transactionally after backup. Loader's settings-host resource was backed up and hot-reloaded. Native UI verification selected a model, dismissed/reopened the selector, selected Medium with real input events, then used the Bridge settings button. The host reported the exact Bridge page active in the native settings shell; a screenshot confirmed it. No standalone Bridge dialog remained.
- No Chat generation, Pro usage, default-settings save, version increment, commit or publication occurred. A final reload cleared temporary task selections. Existing unrelated worktree changes were preserved. Full dark/narrow visual acceptance and planner/executor generation matrix remain separate outstanding gates.

## Versioned model selector — 2026-09-06

Read-only native catalog inspection identified the previous omission: root `options` describes the latest presets, whereas `versionOptions` also provides a named current version with its own Pro model. The current named version exposes `gpt-5-6-pro`; latest Pro is `gpt-6-pro`. These must remain distinct requests.

The selector now groups named versions containing current non-Pro presets, adds their native supported presets, and retains remaining latest models separately. It does not invent options from unrelated historical model metadata. The duplicate latest alias is not rendered. Existing tuple keys and explicit parameter selection are preserved. Both UI surfaces use slider switches.

Typecheck, lint, **110 tests across 13 files**, build and package checks pass. Tests exercise version grouping, version-specific Pro selection, distinct latest Pro selection, both selector surfaces and the switch. No real Pro generation was performed. The system-settings navigation caller is present, but existing Loader lacks the optional page-opening capability; that separate Loader extension is still unapproved and not deployed. No standalone settings-dialog fallback is retained.

The user-authorized independent ZIP was installed with a pre-update backup and linked bundled skill. A waited native reload succeeded; subsequent public `status` returned all six presets in exactly two groups, available/mounted composer support, no error and no active session. Loader logged two injected scripts with zero failures. Configuration remained unchanged. This confirms the live directory and runtime update, not a new screenshot-based visual acceptance.

## Compact selector candidate — 2026-09-06

This supersedes the task-modal UI below. The task entry now uses an anchored, non-modal 300px popover containing only enablement, model and thinking controls. Advanced defaults use native-token grouped settings rows. Active-session management is collapsed separately.

- Typecheck, lint, **105 tests across 13 files**, build and ZIP/package verification passed. Tests cover the three-control surface, task-only immediate changes, invalidated thinking selection, stale-owner protection, Escape/outside dismissal, repeated trigger and teardown.
- The independent Bridge ZIP was installed using the native registry and bundled-skill link provider. The old candidate was backed up. A waited `--reload` exited successfully, and Loader logged one target, two scripts and zero failures. The public `status` command reports settings/composer/background support, no error and no active session. The input accessory is unmounted while the App is on its settings page; this is not a fresh mounted-layout assertion.
- No Loader source/resource change, model generation, version change, commit or publication occurred in this UI iteration.
- Product Design reference capture used the native Codex selector and settings. Automated local-file preview was blocked by browser policy; no alternate preview route was attempted. **Visual QA remains blocked**, including new light/dark and narrow-window comparison. See `design-qa.md`; user acceptance remains required before release.

## Installed candidate UI acceptance — 2026-09-06

The user-authorized candidate is now installed through the current native Loader's `ScriptRegistry.StagePackageAsync` and `InstallPendingAsync`, with the native bundled-skill link provider, followed by `--reload`. The separately authorized composer resource was hot-updated; the Loader executable was not replaced and Codex was not restarted. Bridge remains **0.1.0** and Loader **0.5.10**; no commit, tag, push or release was performed.

- Bridge checks, **103 tests across 13 files**, build, ZIP creation and package verification passed. A new regression first reproduced host-wide margin resets pinning the task dialog to the upper-left; scoped modal margins fixed it and a live screenshot confirmed centering.
- Loader checks and **129 Node tests** passed; Release build completed with **0 warnings / 0 errors**, and **274 native tests** passed.
- The running Bridge fingerprint matches the candidate renderer. Loader reports `running`, a registered settings page, and a linked bundled skill. The candidate composer reports submission support and one mounted Bridge accessory; runtime errors are empty.
- Live inspection opened the task panel and its default-settings view. The account-backed model catalog loaded without generation. The compact button remained off, no session was started, no configuration was saved, and Loader's configuration was unchanged. Other plugins retained their enable states.
- Package and resource backups were preserved privately. This verifies installation and UI availability, not the four planner/executor combinations, Pro generation, or the full submission matrix below. User acceptance and a separately versioned release remain pending.

Local candidate installation does not itself publish a release or establish a new remote update baseline. The release handoff must check whether Loader requests confirmation before replacing a locally modified candidate.

## Background collaboration candidate — 2026-09-06

This section records the source verification before the installed-candidate check above and supersedes the older implementation-status claims below. At that checkpoint, versions remained Bridge **0.1.0** and Loader **0.5.10**, and neither installed copy had been updated. There was no commit, tag, push, release or executor-model change.

### Automated verification

- Bridge `npm run check`: **102 tests in 13 files**, typecheck, lint, renderer build, single ZIP packaging and release-package verification passed. The ZIP includes the renderer, skill, protocol reference and UTF-8 PowerShell helper; missing the helper now fails package verification.
- Loader `npm run check` and `npm test`: **129 tests** passed. The native Release solution build had **0 warnings and 0 errors**, followed by **274 passing native tests**. These are independent repository checks, not a joint version or deployment.
- New regressions cover partial-start cleanup, task navigation without dropping in-flight native receipts, pending contexts not blocking another task, settings-panel edits not clearing a different task's composer, accepted-draft promotion, explicit override preservation, command payloads unable to grant consent, deadline-derived UI pause, and premature planner completion unable to trigger automatic deletion.
- The bundled skill passed the official skill validator. Helper tests reject malformed, non-object and oversized UTF-8 input before starting a client. Tests use simulated Chat clients and do not consume Pro quota.

The real controller, session and background adapter are also tested together against a simulated native client. A previously failing integration case demonstrated that a cached, paused reply could be delivered after manual Chat intervention. Resume now revalidates all owned user messages, the final branch and native generation state. Manual messages, regeneration and changed branches stop delivery; an unchanged conversation resumes once without resending. A second previously failing test covers native completion metadata lag: an incomplete metadata snapshot now respects the read window rather than returning into a tight caller retry loop. These tests are not live model acceptance.

### Bounded live evidence

A separately authorized, no-project-operation Codex test task confirmed an existing task's outgoing native request against its accepted response and actual completed turn. The temporary probe and accessory were removed. This proves that observed native submission shape, not the complete new-draft, keyboard, IME, queued or chunked-response matrix.

Candidate background modules completed two non-Pro Medium turns in one dedicated App Chat without navigation or changing the foreground model. The planner requested a fresh check; the current executor actually ran the then-current **80-test** suite, typecheck and lint, reported exit code 0, and received a strict `complete` reply. That historical live count is intentionally distinct from the current 102-test source suite. The dedicated Chat was deleted after exact user-message, parent-chain and stream-completion checks. No other conversation was deleted.

This is transport and evidence-feedback acceptance, **not** Spark/Luna model-combination acceptance. Non-Pro → Spark, non-Pro → Luna, Pro → Spark and Pro → Luna are all still **unaccepted** as complete combinations. No real Pro generation was authorized or performed. A discovered catalog option is not a certification of that model.

### Isolated browser UI check

The actual Bridge UI and configuration/controller modules were bundled into an isolated Chromium fixture. Only Loader registration and the model directory were replaced; no native Chat client was supplied. Chinese/English and light/dark settings and task panels were inspected at 420×800 and 1280×900. Horizontal overflow checks passed; the narrow task dialog stayed within the viewport (left 16px, right 404px at 420px width). Tab advanced within the modal; Escape removed it, restored focus to the original task button and left the unrelated draft unchanged. The fixture control stayed between its context indicator and executor control. This does **not** validate Loader's mounting in the actual App.

Two defects were observed and fixed with failing-then-passing regressions: synchronous settings registration left a stale unavailable-composer label, and narrow buttons truncated the explicit Pro mode behind model details. Diagnostics now update without recreating the edited form; enabled Pro controls put `Pro` first and keep full details in their accessible label/title. The simulated Pro option correctly showed thinking as not applicable. No Pro generation occurred. Final-page console inspection had zero errors/warnings; an earlier missing fixture favicon and CLI argument-quoting errors were tooling issues, not product acceptance successes. The dedicated browser and temporary loopback fixture server were stopped after inspection.

### Architecture delivery

The Chinese architecture showcase passed **9/9** checks with no errors or warnings, then `deliver`. Visual checks passed 1440×900, 1600×1000, 1920×1080 and 2048×1320 without document overflow. The four captured small/large light/dark images were manually inspected; visual review passed. Two label-position corrections preceded the final frozen delivery, with no later geometry changes.

- Specification SHA-256: `90e230c3b064b177d7216c2109ac32eeebbf23da6613294d85cba728cb18e137`.
- HTML SHA-256: `0e9a0a80bd9fe94822f5b1a05330cdbc36468b2dae6a936164609982a2e4a0b9`.

### Remaining release gates

Full Bridge UI placement, themes, keyboard and narrow-window checks in the actual App; native new-draft acceptance; every requested executor/planner combination with actual code and non-code tool evidence; real multi-window slow replies; account-change behavior; and candidate install/update/rollback remain outstanding. The real Pro cases require separate explicit authorization. Current-runtime deployment is also outside this implementation authorization. See [the detailed acceptance gate](BACKGROUND_IMPLEMENTATION_GATE.md).

Old DOM modules remain only as source/test history pending replacement acceptance; the candidate entry neither imports nor bundles them and has no foreground fallback. Do not publish the unchanged-version candidate as a verified replacement or infer a minimum released Loader version from a local candidate build.

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
