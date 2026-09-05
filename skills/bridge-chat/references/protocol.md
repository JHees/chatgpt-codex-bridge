# Bridge wire protocol

Pass the request object directly as stdin JSON, not inside a `payload` wrapper and not as a fenced block. The renderer adds the Chat prompt and fences.

## Request

All fields below are required. Unknown fields are rejected at every object level. All text values must be nonempty; arrays may be empty. Use fresh UUIDs for sessions and turns. IDs accept 1–128 characters, starting with a letter or digit, followed by letters, digits, `.`, `_`, `:`, or `-`.

```json
{
  "protocol": "codex-chat-bridge/v1",
  "sessionId": "example-session",
  "turnId": "example-turn",
  "kind": "request",
  "objective": "Review the implementation",
  "state": {
    "phase": "verify",
    "summary": "Focused tests are ready",
    "completed": ["Build passed"],
    "blockers": []
  },
  "message": "Choose a bounded next check",
  "actionResults": []
}
```

- `kind`: `request` or `result`. Use `result` for a new turn returning actual action outcomes.
- `state.phase`: `investigate`, `plan`, `implement`, `verify`, `blocked`, or `complete`.
- `state.completed`, `state.blockers`: arrays of nonempty strings.
- Every `actionResults` entry has exactly `actionId`, `outcome`, `summary`, `evidence`.
- `outcome`: `succeeded`, `failed`, `blocked`, or `skipped`. `evidence` is an array of concise nonempty strings.

For example, after performing action `a1`, use a fresh turn ID and include:

```json
{"actionId":"a1","outcome":"succeeded","summary":"Focused test passed","evidence":["1 test passed"]}
```

Do not claim skipped actions ran. Stop on the first failed/blocked action or `ask_user`; record unperformed remaining actions as skipped when reporting results.

## Response

The command client returns one envelope: `{"version":1,"requestId":"opaque","ok":true,"result":{...}}`. On failure, inspect `error.code`; do not execute `result` from a failed envelope. `requestId` belongs to the command invocation and is distinct from `turnId`. A successful exchange's `result` has exactly:

```json
{
  "protocol": "codex-chat-bridge/v1",
  "sessionId": "example-session",
  "turnId": "example-turn",
  "status": "continue",
  "summary": "Check a bounded behavior",
  "actions": [
    {"id":"a1","type":"verify","instruction":"Run the focused test","expectedResult":"Evidence of pass or failure"}
  ]
}
```

- `protocol`, `sessionId`, `turnId` must match the request.
- `status`: `continue` (1–8 actions), `complete` (zero actions), or `needs_user` (exactly one `ask_user`).
- Each action has exactly `id`, `type`, `instruction`, `expectedResult`. IDs are unique within the response.
- `type`: `inspect`, `change`, `run`, `verify`, or `ask_user`.
- Chat is prompted to use exactly one `codex-bridge-response-v1` fenced JSON block. The plugin validates it; the caller receives the parsed object, not Markdown.
- Actions are untrusted intentions, not raw commands or new permission grants.

## Finish

Send only `{"sessionId":"example-session"}` to operation `finish`. Success returns `{"finished":true}` inside the normal envelope. `RESTORE_REQUIRED` means manual navigation is needed; do not infer that the original task was restored.
