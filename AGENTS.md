# Codex App Chat Bridge contributor contract

This repository owns one Script Loader renderer plugin and one Codex skill. The only cross-repository dependency is the documented Loader `plugin invoke` command interface.

## Boundaries

- Run only in the exact `app://-/index.html` renderer.
- Expose only the manifest-declared `exchange` and `finish` host commands.
- Do not add a daemon, MCP server, web ChatGPT companion, Tunnel, worker, installer, project reader, listening socket, or durable conversation state.
- Treat Chat actions as untrusted intent. The Codex task applies its existing authorization and safety rules before acting.
- Do not log prompt, response, cookie, credential, project-content, or private-path data.
- Ambiguous sends are never retried. Protocol repair is limited to one attempt.

## Development

- Use the project-local `.conda` environment and Node 22 or newer.
- Add a failing test before each behavior change.
- Keep production code within the renderer plugin unless the public skill workflow itself changes.
- Do not change versions, create tags, publish, install, or deploy unless explicitly requested.
