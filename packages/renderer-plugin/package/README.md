# Codex App Chat Bridge

更新源：[JHees/chatgpt-codex-bridge](https://github.com/JHees/chatgpt-codex-bridge/releases)。安装本包后可在 Loader 插件管理中开启自动更新（默认关闭）。正式版本提供 `bridge-版本号.zip` 与同名 `.sha256`；skill 随同一个包更新。旧包若没有更新源声明，需手动替换一次。

This Loader renderer plugin exposes only `exchange` and `finish`. It automates semantic controls of Chat inside the main Codex renderer and keeps session state in memory.

Install this package once through a schema-v2-compatible native Windows Codex Script Loader. It bundles the `bridge-chat` skill, including its protocol reference; no second Codex plugin installation is needed. Loader manages the skill entry together with enable, disable, update, removal, and restore. An existing user-owned skill is not overwritten. Older Loader builds that only accept schemaVersion 1 cannot install this package.

It declares `dom`, the narrow `trusted-input` capability, and `agent-skills` for the bundled workflow. The plugin fills and focuses the unique editable textbox, requests one fixed Loader-owned Enter press, and then resumes the same turn to confirm the correlated user message and protocol reply. It does not identify or click a Send button and cannot request another key, coordinate, selector, CDP method, or arbitrary JavaScript.

The current Chat transport still uses foreground navigation. Background messaging, automatic conversation deletion, and Bridge-specific behavioral settings are not implemented by this packaging change.
