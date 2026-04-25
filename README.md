# HOSAKA — Web Desktop Edition

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

A **touch-friendly web desktop** that puts a terminal behind a glass
screen and wires it to a real **picoclaw** agent on the backend. Type
into the terminal and you're talking to an agentic framework that can
walk a sandboxed filesystem, read files, and run a restricted shell.

> This repo is a fork of
> [`BarkBarkBarkBarkBarkBarkBark/Hosaka`](https://github.com/BarkBarkBarkBarkBarkBarkBark/Hosaka),
> extended with a web shell.  The original console lives untouched in
> [`Hosaka_Field-Terminal/`](./Hosaka_Field-Terminal/).

---

## Deployment stack

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
