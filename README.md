# HOSAKA — Hosted Terminal

```
  ██╗  ██╗ ██████╗ ███████╗ █████╗ ██╗  ██╗ █████╗
  ██║  ██║██╔═══██╗██╔════╝██╔══██╗██║ ██╔╝██╔══██╗
  ███████║██║   ██║███████╗███████║█████╔╝ ███████║
  ██╔══██║██║   ██║╚════██║██╔══██║██╔═██╗ ██╔══██║
  ██║  ██║╚██████╔╝███████║██║  ██║██║  ██╗██║  ██║
  ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝

      * \ _ /
       @( )@        a terminal behind a functional screen.
      */\|/\*       signal steady. no wrong way.
     (@)|  /\
      \ | /(_)
       _|_/_
      [_____]
```

A deployment wrapper for the canonical frontend in
[`BarkBarkBarkBarkBarkBarkBark/Hosaka`](https://github.com/BarkBarkBarkBarkBarkBarkBark/Hosaka).
It does not own a second frontend source tree. `scripts/sync-console.sh`
copies upstream source and required bundled documentation at build time.

The hosted build uses the **real canonical Python TUI**, with xterm connected
to a dedicated Fly gateway. An access code is required. Every connection gets
a disposable Fly Machine, not a shell on the shared gateway.

`frontend/vite.config.ts` selects `VITE_HOSAKA_TUI_URL` for this hosted build.
The console repo leaves it unset for the local GUI. The marketing site
in `BarkBarkBarkBarkBarkBarkBark/cyber_deck` embeds this deployment.
Do not point the public terminal at `/ws/tui` or loosen its loopback-only policy.

## Hosted backend and limits

- Gateway: `agent-server/hosted_terminal.py`, `/ws/hosted-tui`.
- Worker: `agent-server/terminal_worker.py`; uses the canonical PTY bridge
  and `python -m hosaka tui` from the tested, digest-pinned container runtime.
- Access code is the first WebSocket message, not a URL/query parameter or
  build-time secret. The gateway validates an exact Origin allowlist.
- Three concurrent sessions, 600 seconds maximum, 30 model calls/session,
  one in-flight model call, 2,048 output tokens/call and 128 KiB request limit.
- Gemini runs through an OpenAI-compatible proxy. Its key never enters a
  worker. The proxy fixes the model and rejects expired sessions.
- Workers use a **separate app with no Fly secrets and no volumes**.
  Fly injects app secrets automatically: never put secrets in the worker app.
- Root startup installs outbound firewall rules, then drops to UID 10001
  with no capabilities/no-new-privileges. Only public HTTPS and Fly DNS
  egress are allowed; private/link-local networks are blocked. Replies to
  gateway-initiated PTY connections are allowed.
- Worker process has its own hard timeout and no restart policy. Disconnect
  destroys the Machine; the gateway retries failed cleanup and reaps labeled
  orphan workers on restart. Run exactly **one gateway Machine**.
- This is disposable compute, not persistent storage. Public HTTPS research
  is possible; arbitrary outbound network access and native deck hardware
  are not. Each live worker uses one shared CPU and 512 MiB RAM and costs money.

### Deploy

```bash
fly auth login
fly apps create hosaka-terminal-workers --org personal
# Confirm this is empty:
fly secrets list --app hosaka-terminal-workers
# Build and push once; use the resulting registry image for both roles.
fly deploy --build-only --push --remote-only --image-label hosted-terminal-v1
fly secrets set --app hosaka-field-terminal-alpha \
  HOSAKA_WORKER_APP=hosaka-terminal-workers \
  HOSAKA_WORKER_IMAGE=registry.fly.io/hosaka-field-terminal-alpha:hosted-terminal-v1
# Securely import an app-scoped worker deploy token as HOSAKA_FLY_API_TOKEN:
fly tokens create deploy --app hosaka-terminal-workers --expiry 720h
# Also set HOSAKA_ACCESS_TOKEN and GEMINI_API_KEY on the gateway only.
fly deploy --image registry.fly.io/hosaka-field-terminal-alpha:hosted-terminal-v1
```

Refresh the worker deploy token before it expires. `HOSAKA_HOSTED_MODEL`
defaults to `gemini-2.5-flash-lite`. `HOSAKA_ALLOWED_ORIGINS` defaults to
`https://terminal.hosaka.xyz,https://hosaka.xyz`; add development origins
explicitly when testing. Never use `*`. `HOSAKA_GATEWAY_URL` is the public
HTTPS gateway URL used by worker model requests.

## Build the frontend

```bash
bash scripts/sync-console.sh
cd frontend
npm ci
npm run build:check
```

For unpublished local console changes, run `bash scripts/link-console.sh`
instead of syncing from GitHub. Do not edit the generated `frontend/src/`.
The shared `docs/api.md` build input is synced too; other documentation here
remains owned by this wrapper.

Console changes must be pushed before a public wrapper rebuild can copy them.
Then push/redeploy this wrapper to update the hosted terminal.

---

## Legacy hosted-agent stack (not the active terminal)

The remaining notes describe the former web desktop and retained optional
Vercel/Fly agent services. Their existence does not enable AI, shell commands,
voice, or the old tabs in the current terminal. The root Dockerfile no longer
starts the old `/ws/agent` direct-shell server. The frozen
`Hosaka_Field-Terminal/` copy mentioned below has been retired; use the
canonical Hosaka repository for native appliance work.

### Historical deployment stack

```
    your laptop
        │  git push
        ▼
   ┌──────────────┐
   │   GitHub     │  source of truth
   └──────┬───────┘
          │  webhook on push to main
          ▼
   ┌──────────────┐    /api/gemini  (edge function)
   │   Vercel     │ ── proxy for the /ask command
   │              │    holds GEMINI_API_KEY
   │  serves the  │
   │  static SPA  │    browser  ── wss://… ──┐
   └──────────────┘                          │
                                             ▼
                                      ┌──────────────┐
                                      │   Fly.io     │  picoclaw box
                                      │              │  the heartbeat
                                      │  agent-server│  holds
                                      │  + picoclaw  │  GEMINI_API_KEY
                                      └──────────────┘  or OPENAI_API_KEY
                                                        + HOSAKA_ACCESS_TOKEN
```

| Layer    | Lives on  | Holds                                                        |
| -------- | --------- | ------------------------------------------------------------ |
| Source   | GitHub    | code, CI, docs                                               |
| Frontend | Vercel    | static SPA + `/api/gemini` edge fn (proxies the `/ask` cmd)  |
| Backend  | Fly.io    | FastAPI websocket → picoclaw subprocess + sandboxed workspace |

The browser **never** holds an LLM API key. Every model call is brokered
by Vercel (`/api/gemini`) or Fly (picoclaw) using server-side secrets.

> The original Python TUI still ships in
> [`Hosaka_Field-Terminal/`](./Hosaka_Field-Terminal/) for appliance
> mode on a Raspberry Pi. See
> [`docs/appliance-mode.md`](./docs/appliance-mode.md). It is **not**
> part of the hosted stack above.

---

## Try it locally

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173
```

The Python side of the house (the original TUI):

```bash
cd Hosaka_Field-Terminal
source ../.venv/bin/activate
pip install -r requirements-hosaka.txt
python -m hosaka       # runs the console TUI
```

> There is no wrong way.

---

## What you get in the browser

Four tabs: **Terminal**, **Messages**, **Reading**, **Open Loops**.

- **Terminal** — `xterm.js` + a scripted Hosaka shell. Try `/commands`,
  `/plant`, `/orb`, `/lore`, `/status`, `/signal`, `/netscan`.
- **Picoclaw agent — the heartbeat.** Free text in the terminal opens a
  websocket to a Fly.io-hosted picoclaw process with a real sandboxed
  filesystem and shell. The channel is gated by a magic word. Each
  session's workspace comes pre-seeded with discoverable easter eggs:
  notes, lore relics, hidden haiku, and tiny shell scripts in `bin/`.
- **`!cmd` shell passthrough** — type `!ls`, `!cat README.md`, etc. to
  run real commands in the picoclaw sandbox without the LLM loop.
  Fast, deterministic, sandboxed by `shlex.split` + workspace chroot.
- **`/netscan`** — hybrid theatrical + real network scanner. Streams
  fake tcpdump-style traffic; when the channel is open, interleaves
  real `ss` output tagged `[REAL]`.
- **Reading** — a markdown library of hosaka lore vignettes rendered
  beautifully on screen. `/read` lists them; `/read <slug>` opens one.
  Teaser: `/read order` hints at the kindle relay.
- **Open Loops** — a simple todo panel stored in `localStorage`. Add
  from the terminal with `/todo add remember the signal`.
- **Messages** — offline orb chat or a Discord/Slack/custom webhook.

Touch, mouse, and keyboard are all first-class. The terminal gets focus
when you tap it. On phones the banner collapses and chrome shrinks.

All errors are presented as branded in-character copy — the user never
sees raw stack traces, HTTP codes, or API key names. Visual style is
retro terminal: sharp corners, CRT scanlines, phosphor glow on amber.

---

## Deploying

### 1. Frontend → Vercel

```bash
# one-time
npm i -g vercel
vercel link    # point at this repo

# secrets (Vercel dashboard → Project → Settings → Env Vars)
GEMINI_API_KEY=…    # used by api/gemini.ts edge fn (for /ask only)
```

`vercel.json` is at the repo root. Pushing to `main` redeploys.

### 2. Backend → Fly.io

```bash
fly launch    # uses ./fly.toml + ./Dockerfile (agent-server sources)
fly secrets set \
  HOSAKA_ACCESS_TOKEN='a long passphrase you will share by mouth' \
  GEMINI_API_KEY=…                   \
  PICOCLAW_MODEL=gemini/gemini-2.5-flash-lite
fly deploy
```

Or bootstrap it with the helper script:

```bash
export HOSAKA_ACCESS_TOKEN='a long passphrase you will share by mouth'
export HOSAKA_ALLOWED_ORIGINS='https://terminal.hosaka.xyz'
export GEMINI_API_KEY='AIza...'
bash scripts/launch-fly-machine.sh
```

The **`HOSAKA_ACCESS_TOKEN` is the actual magic word**. It lives only on
Fly — the frontend never sees it. Hosted builds set `VITE_HOSAKA_GATED=1`
so the shell demands a word on first use; the shell ships whatever the
user types as the WebSocket token and the server validates it with
`hmac.compare_digest`. To rotate the word, `fly secrets set
HOSAKA_ACCESS_TOKEN='new phrase'` — no rebuild required.

### Swapping the agent's model / provider

Picoclaw's provider is decided at container startup by
[`agent-server/start.sh`](./agent-server/start.sh). It picks the first
of `GEMINI_API_KEY` / `OPENAI_API_KEY` it finds in the env. To switch:

```bash
# from gemini → openai gpt-4o-mini (faster, paid)
fly secrets unset GEMINI_API_KEY
fly secrets set OPENAI_API_KEY=sk-… PICOCLAW_MODEL=openai/gpt-4o-mini
fly deploy --no-cache
```

The model name is locked server-side; the browser cannot override it.

---

## Documentation map

Human-readable:

- [`docs/architecture.md`](./docs/architecture.md) — what lives where, and why.
- [`docs/deployment.md`](./docs/deployment.md) — GH Pages, Vercel, Cloudflare, custom domain.
- [`docs/llm.md`](./docs/llm.md) — Gemini proxy, env vars, free-tier notes.
- [`docs/agent-backend.md`](./docs/agent-backend.md) — optional picoclaw on Fly.io, threat model, hardening checklist.
- [`docs/managed_gateway.md`](./docs/managed_gateway.md) — hosted gateway/subscription rollout, required secrets, and public-web safety boundaries.
- [`docs/login_gate.md`](./docs/login_gate.md) — OIDC login gate, owned-node discovery, local bridge handoff, and Fly broker requirements.
- [`docs/appliance-mode.md`](./docs/appliance-mode.md) — running on a Pi with a touchscreen.
- [`docs/local-development.md`](./docs/local-development.md) — dev loop, tooling, conventions.

Machine-readable (seed context for LLM agents):

- [`AGENTS.md`](./AGENTS.md) — high-signal repo guide, intended for agentic tools.
- [`docs/llms.txt`](./docs/llms.txt) — [llms.txt](https://llmstxt.org) style index.
- [`docs/context.seed.json`](./docs/context.seed.json) — structured facts.

---

## Repo layout

```
.
├── frontend/                 # Vite + React + TS web desktop (deployable)
│   ├── src/
│   │   ├── App.tsx
│   │   ├── panels/           # Terminal, Video, Messages, Lore
│   │   ├── shell/            # simulated Hosaka shell for xterm.js
│   │   ├── llm/              # Gemini client + tools + agent websocket client
│   │   ├── components/       # badges, settings drawer
│   │   └── styles/
│   └── vite.config.ts
├── api/                      # Vercel Edge Functions
│   └── gemini.ts             # Gemini proxy, uses GEMINI_API_KEY env var
├── agent-server/             # Optional Fly.io backend for picoclaw
│   ├── server.py             # FastAPI + websocket + auth + sandbox
│   ├── start.sh              # writes picoclaw config from env at boot
│   ├── requirements.txt
│   └── README.md
├── Dockerfile                # Fly.io build (agent-server sources)
├── fly.toml                  # Fly.io config (root-level; fly finds it here)
├── .dockerignore             # keeps the Fly build context tiny
├── Hosaka_Field-Terminal/    # original Python TUI, preserved verbatim
├── docs/                     # architecture / deployment / llm / agent-backend / etc.
├── .github/workflows/        # GitHub Pages + typecheck CI
├── vercel.json
├── instructions.md           # original mission brief
└── README.md
```

---

## The plant

It persists, like before. For now the hosted version draws it at the
top of the terminal and lets you see it age with `/plant`. In appliance
mode, the real [`hosaka/tui/plant.py`](./Hosaka_Field-Terminal/hosaka/tui/plant.py)
still owns state at `~/.hosaka/plant.json`. Neglect it and the hosted
plant forgets you; tend it and it blooms. Unless the browser forgets
`localStorage`. In which case, the orb remembers.

---

## Credits & spirit

Built on the bones of [Hosaka](https://github.com/BarkBarkBarkBarkBarkBarkBark/Hosaka).
Extended with touchscreen manners. Keeps the
[no-wrong-way manifest](./Hosaka_Field-Terminal/docs/no_wrong_way_manifest.md)
as its north star.

_Signal steady. 📡_
