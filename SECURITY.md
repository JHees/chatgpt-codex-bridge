# Security model

Bridge vNext deliberately has one narrow capability: semantic interaction with Chat already present in the Codex main renderer.

- The Loader accepts only manifest-allowlisted operation names through a current-user named pipe.
- Requests and responses are capped at 64 KiB.
- Callers cannot choose a CDP endpoint, target, method, selector, or JavaScript source.
- The Bridge manifest requests `dom`, the narrow Windows-only `trusted-input` capability, and `agent-skills` for its bundled skill; it has no page-companion or loopback transport permission. Loader manages only the declared skill entry and does not expose arbitrary file writes to the renderer.
- `trusted-input` accepts only one exact `press-enter` continuation per allowlisted host command. Loader sends it through its existing verified renderer CDP session and rejects arbitrary keys, extra fields, repeated requests, or plugins lacking the permission.
- The renderer uses exact Chinese and English semantic labels and fails closed on missing or ambiguous controls.
- One in-memory session is allowed. Navigation, reload, restart, or missing message identity produces `SESSION_LOST`.
- A send with uncertain outcome is not retried. A malformed Chat response gets at most one repair request.
- Chat actions are untrusted structured intent and never become an automatic shell-command channel.

No daemon, MCP server, Tunnel, web ChatGPT target, worker, secret store, journal, project-reader service, or listening port exists in vNext.

Release CI runs with read-only repository permissions during dependency installation, checks, tests, and packaging. Only the tag-triggered publish job receives `contents: write`; it downloads the verified artifact and does not run repository source. Official Actions are pinned to commit hashes. Releases attach the exact tested ZIP and its SHA-256 together before making the release public. Checksums detect corruption; they do not make an untrusted publisher trustworthy. Install only from a repository you trust.
