# Agent backend (picoclaw on Fly.io)

> An LLM with a real filesystem and real shell, behind a passphrase door.
> You are choosing, on purpose, to point a gun at your foot. Here's how to
> point it in the safest direction.

The agent backend is **optional**. The default Hosaka web experience runs
entirely on Gemini with client-side tool calls (see [`llm.md`](./llm.md) and
[`tools-sandbox.md`](./tools-sandbox.md)). This document covers the
more-capable picoclaw path.

## What it is

- Tiny FastAPI service (`agent-server/server.py`).
- Receives one websocket connection per browser tab.
- On each message, spawns `picoclaw agent -m "…" --session hosaka:<sid>`
  inside a per-session scratch dir, returns stdout/stderr.
- Passphrase-gated at the websocket upgrade. Fails closed if no passphrase
  is configured.

## Threat model

| Threat                                  | Built-in mitigation                                   | What you still must do             |
| --------------------------------------- | ----------------------------------------------------- | ---------------------------------- |
| Random internet users get a shell       | `HOSAKA_ACCESS_TOKEN` shared passphrase              | keep the passphrase off public channels; rotate it |
| Prompt-inject leaks env vars            | subprocess env allowlist (`PATH`, `HOME`, `TERM`)     | don't mount other secrets as env   |
| Agent nukes the host                    | non-root uid 10001, per-session `/workspaces/<sid>/`  | don't add write mounts outside of that |
| Agent exfiltrates or crypto-mines       | nothing built in — network is open                    | add Fly.io outbound filters / egress allowlist; set LLM spending caps |
| Session state leaks between users       | UUID session dirs, wiped on disconnect + TTL sweep    | set `HOSAKA_SESSION_TTL` to something short |
| Runaway cost                            | per-message timeout, rate limit, one-in-flight        | put a daily-spend cap on the LLM key |
| DoS via long hangs                      | `HOSAKA_MSG_TIMEOUT` (default 45s)                    | monitor Fly logs                    |
| Misaddressed CORS                       | `HOSAKA_ALLOWED_ORIGINS` env                          | set it to exactly your Vercel URL  |

Nothing here is bulletproof. The checklist below is the minimum before
sharing the passphrase with anyone.

## One-time setup on Fly.io

You need a Fly.io account and the [`flyctl`](https://fly.io/docs/hands-on/install-flyctl/)
CLI. Rough cost: **pennies/day** with auto-stop on.

The `Dockerfile` and `fly.toml` live at the **repo root** so `fly` can
find them with no flags — run every command from the root, not from
`agent-server/`.

```bash
# from the repo root:

# 1. create the app (reads fly.toml)
fly launch --no-deploy --copy-config

# 2. secrets (these never appear in the repo)
fly secrets set \
  HOSAKA_ACCESS_TOKEN='pick-a-long-passphrase-say-5-words' \
  GEMINI_API_KEY='AIza...from-ai-studio' \
  HOSAKA_ALLOWED_ORIGINS='https://YOUR-PROJECT.vercel.app,https://your-domain.com'

# 3. (optional) persistent volume for picoclaw session history
fly volumes create hosaka_sessions --size 1 --region iad

# 4. deploy
fly deploy
```

Your websocket URL is `wss://<app>.fly.dev/ws/agent`.

## Wiring the frontend

Open `/settings` on your hosted site and fill in:

| Field           | Value                                    |
|-----------------|------------------------------------------|
| websocket url   | `wss://<app>.fly.dev/ws/agent`           |
| passphrase      | the value you set in `HOSAKA_ACCESS_TOKEN` |
| mode            | `on` — type goes to picoclaw             |

Or from the terminal:

```
/agent url wss://<app>.fly.dev/ws/agent
/agent passphrase your-long-passphrase
/agent on
/agent test
```

`/agent test` sends a trivial prompt and prints the reply.

## Hardening checklist before sharing the passphrase

- [ ] `HOSAKA_ALLOWED_ORIGINS` is set to exactly your Vercel URL(s).
- [ ] Gemini key has a **daily spend cap** in Google Cloud Console.
- [ ] `HOSAKA_RATE_PER_MIN` is ≤ what you're willing to pay.
- [ ] `HOSAKA_MSG_TIMEOUT` is low (default 45s).
- [ ] `HOSAKA_SESSION_TTL` is short (default 5 min).
- [ ] Fly `auto_stop_machines = "stop"` is enabled (default in our
      `fly.toml`). Scales to zero when idle.
- [ ] You've tested `/agent test` with and without the passphrase. The
      wrong passphrase should return `403` / `unauthorized`.
- [ ] You rotate the passphrase any time you share it with a new person.

## Operational notes

### Logs
```bash
fly logs               # stream
fly logs --since 1h    # recent
```
Each session is tagged `sid=<12hex>` in the logs for easy grepping.

### Bumping limits
Most knobs are env vars — change via `fly secrets set` or `fly.toml`:

| Var                   | Effect                         |
|-----------------------|--------------------------------|
| `HOSAKA_SESSION_TTL`  | idle seconds before sweep       |
| `HOSAKA_MSG_TIMEOUT`  | picoclaw hard timeout (s)       |
| `HOSAKA_MSG_MAX_CHARS`| prompt length cap               |
| `HOSAKA_RATE_PER_MIN` | per-session messages / minute   |

### Swapping providers
`start.sh` writes a minimal picoclaw config using whichever of
`GEMINI_API_KEY` or `OPENAI_API_KEY` is set. Override the model with
`PICOCLAW_MODEL` (litellm format: `gemini/...` or `openai/...`).

### Burn-it-down mode
- `fly apps destroy hosaka-agent` wipes everything (including the volume).
- `fly secrets unset HOSAKA_ACCESS_TOKEN` immediately locks everyone out
  because the server fails closed when the token is empty.

## Future directions

- **Outbound allowlist.** Once Fly's outbound filters are stable in your
  region, restrict the agent's egress to just the LLM API hostname.
- **Per-user auth instead of shared passphrase.** Drop in Clerk or
  Cloudflare Access and swap the header check accordingly.
- **Picoclaw on a Pi Pico W.** Upstream markets picoclaw as "deployable
  anywhere" including tiny boards — if you get it running on a Pico W with
  a streaming USB serial bridge, point the websocket URL at a tailscale
  hostname for that device instead of Fly.io and you get an actual
  physical field-terminal agent. That's a fun weekend.
