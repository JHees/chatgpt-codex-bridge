# Codex App Chat Bridge

This Loader renderer plugin exposes only `exchange` and `finish`. It automates semantic controls of Chat inside the main Codex renderer and keeps session state in memory.

It declares `dom` plus the narrow `trusted-input` capability. The plugin fills and focuses the unique editable textbox, requests one fixed Loader-owned Enter press, and then resumes the same turn to confirm the correlated user message and protocol reply. It does not identify or click a Send button and cannot request another key, coordinate, selector, CDP method, or arbitrary JavaScript.
