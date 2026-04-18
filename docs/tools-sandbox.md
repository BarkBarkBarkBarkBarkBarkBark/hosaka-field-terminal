# Tool sandbox — the watertight set

The hosted build lets Gemini call a tiny set of **inherently-contained**
tools on the client side. No fetch, no eval, no filesystem, no external
services. These are the tools you can leave on for strangers.

Source: [`frontend/src/llm/tools.ts`](../frontend/src/llm/tools.ts).

## Rules we follow (religiously)

1. No `eval`, no `Function`, no dynamic imports, no `fetch`, no DOM writes.
2. Every tool is pure or only touches a namespaced slice of `localStorage`
   (`hosaka.tools.memory.v1.*`).
3. Inputs are validated with hand-written guards. No runtime deps.
4. Outputs are plain JSON-safe objects.
5. Errors are **values**, not exceptions: `{ ok: false, error: "..." }`.

## Tools currently shipped

| Tool               | Effect                                                           | Storage |
|--------------------|------------------------------------------------------------------|---------|
| `get_time`         | ISO-UTC + local time + timezone                                  | none    |
| `calculate`        | `+ - * / % ( )`, decimals, no variables, 200-char cap, safe parser | none  |
| `get_lore_fragment`| returns a canonical lore blurb                                   | none    |
| `list_commands`    | the `/commands` taxonomy                                         | none    |
| `whoami`           | user-agent, language, timezone (already visible to the page)     | none    |
| `remember(k, v)`   | save a value under a key                                         | `localStorage` |
| `recall(k)`        | read back a saved value                                          | `localStorage` |
| `list_memory`      | list saved keys                                                  | `localStorage` |

### `calculate` — how it stays safe

- It's **not** `eval`. The implementation tokenizes, then Pratt-parses.
- Only numbers and the operators `+ - * / % ( )`.
- No identifiers, no function calls, no property access.
- Rejects expressions over 200 chars.
- Division/modulo by zero returns a typed error.
- Non-finite results (`Infinity`, `NaN`) are refused.

### `remember` / `recall` — storage rules

- Keys: `[a-z0-9_-]+`, max 40 chars.
- Values: max 1000 chars.
- Hard cap of 64 keys per operator.
- Stored under a namespace prefix so other app state is untouchable.
- The operator can inspect everything under `localStorage`; Gemini cannot
  reach anything not under the prefix.

## What we deliberately **did not** ship

- `fetch(url)` — even with an allowlist, an LLM-chosen URL is too easy to
  abuse (SSRF, unbounded responses, quota burn).
- `run_code(js)` — sandboxed wasm is non-trivial; "safe eval" is a lie.
- `read_file(path)` / `list_dir(path)` — the browser has no filesystem
  unless we reach for the File System Access API, which is Chromium-only
  and delegates prompt responsibility to the operator anyway.
- Anything with side effects outside this browser tab.

Everything in that list is the province of the **agent backend**
(`docs/agent-backend.md`), which enforces its own, heavier isolation.

## Adding a new tool

Don't, unless you can argue in one sentence why it's inherently safe for a
stranger on the internet to invoke.

If you must:

1. Add a `GEMINI_TOOL_DECLARATIONS` entry with a tight JSON schema.
2. Add an impl to `TOOL_IMPLS` that validates its inputs, returns a plain
   object, and catches all errors.
3. Update this doc with the row in the table above.
4. Think about the threat model again. Then don't add the tool.
