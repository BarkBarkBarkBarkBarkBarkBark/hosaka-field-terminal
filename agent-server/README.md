# hosaka agent-server

A small FastAPI + websocket bridge that exposes **picoclaw** (an agentic CLI)
to the Hosaka web desktop, with a shared-passphrase door on the front.

> It is intentionally boring. Boring is good when you're letting an LLM run
> subprocess commands.

## Threat model

See [`../docs/agent-backend.md`](../docs/agent-backend.md) for the full
table. Minimum built-in protections:

- **Auth**: shared passphrase in `X-Hosaka-Token` header (or `?token=` query
  param), constant-time compared.
- **Sandbox**: every websocket gets a UUID session dir under
  `/workspaces/<sid>/`, wiped on disconnect and after `HOSAKA_SESSION_TTL`
  seconds of idle time.
- **Non-root**: container runs as uid 10001. Picoclaw sees a scrubbed env
  (`PATH`, `HOME`, `TERM` only) — no LLM key bleeding through tool calls.
- **Limits**: per-message timeout (`HOSAKA_MSG_TIMEOUT`, default 45s),
  per-message char cap, per-session RPM rate limit, one-in-flight.
- **Fail closed**: if `HOSAKA_ACCESS_TOKEN` is unset, *all* connections are
  rejected.

## Endpoints

| Method | Path          | What                                            |
|--------|---------------|-------------------------------------------------|
| GET    | `/`           | JSON status + picoclaw availability             |
| GET    | `/healthz`    | Fly health check                                |
| WS     | `/ws/agent`   | Auth-required websocket; bidirectional JSON     |

### Websocket protocol

Client → server:
```json
{ "message": "scan the workspace and list files" }
```
Server → client (in order):
```json
{ "type": "hello", "sid": "…", "picoclaw": true, "model": "gemini/gemini-2.5-flash-lite", "ttl_seconds": 300 }
{ "type": "thinking" }
{ "type": "reply", "stdout": "…", "stderr": "…" }
```
Errors: `{ "type": "error", "error": "…" }`.

## Deploying to Fly.io

The `Dockerfile` and `fly.toml` live at the **repo root**, so run `fly`
commands from there (not from `agent-server/`).

```bash
# from the repo root:
fly launch --no-deploy --copy-config
fly volumes create hosaka_sessions --size 1 --region iad

fly secrets set \
  HOSAKA_ACCESS_TOKEN='choose a long passphrase' \
  GEMINI_API_KEY='AIza...' \
  HOSAKA_ALLOWED_ORIGINS='https://your-vercel-site.vercel.app,https://your-domain.com'

fly deploy
```

Your websocket URL is `wss://<app>.fly.dev/ws/agent`.

### Useful env vars

| Name                      | Default                             | What                                                |
|---------------------------|-------------------------------------|-----------------------------------------------------|
| `HOSAKA_ACCESS_TOKEN`     | *unset (fail closed)*               | passphrase clients must present                    |
| `HOSAKA_ALLOWED_ORIGINS`  | `*`                                 | CORS allowlist, comma-separated                    |
| `HOSAKA_WORKSPACE_ROOT`   | `/workspaces`                       | per-session sandbox root                           |
| `HOSAKA_SESSION_TTL`      | `300`                               | idle seconds before sweep                           |
| `HOSAKA_MSG_TIMEOUT`      | `45`                                | seconds a single picoclaw call may run             |
| `HOSAKA_MSG_MAX_CHARS`    | `4000`                              | prompt size cap                                    |
| `HOSAKA_RATE_PER_MIN`     | `30`                                | messages/min per session                           |
| `GEMINI_API_KEY`          | *unset*                             | provider key; start.sh writes picoclaw config      |
| `OPENAI_API_KEY`          | *unset*                             | alternative provider; same behavior                |
| `PICOCLAW_MODEL`          | `gemini/gemini-2.5-flash-lite`      | picoclaw/litellm model string                      |

### Harden further (recommended)

- Set `HOSAKA_ALLOWED_ORIGINS` to exactly your vercel URL(s).
- Enable Fly `[http_service] force_https = true` (already on in `fly.toml`).
- Give the LLM key a strict daily spending cap in Google's console.
- Consider Fly's [outbound allowlists](https://fly.io/docs/networking/outbound-filters/)
  once they're stable in your region.
- Rotate `HOSAKA_ACCESS_TOKEN` whenever you re-share the site.

## Running locally

```bash
cd agent-server
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# put a key somewhere the shell can see it
export HOSAKA_ACCESS_TOKEN='local-dev-please-change'
export GEMINI_API_KEY='AIza...'

# install picoclaw locally (macOS example):
# grab the right asset from https://github.com/sipeed/picoclaw/releases/latest
# and `chmod +x picoclaw && mv picoclaw /usr/local/bin/`

./start.sh
```

Then point the frontend settings at `ws://localhost:8080/ws/agent`.
