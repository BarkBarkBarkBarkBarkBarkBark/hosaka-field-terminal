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

A **touch-friendly web desktop** that puts a real-ish terminal behind a
glass screen, plays videos, and sends messages — deployable for free on
**GitHub Pages**, **Vercel**, or **Cloudflare Pages**. The underlying
appliance (Python TUI + Picoclaw) still runs on a Raspberry Pi whenever
you want the real thing.

> This repo is a fork of
> [`BarkBarkBarkBarkBarkBarkBark/Hosaka`](https://github.com/BarkBarkBarkBarkBarkBarkBark/Hosaka),
> extended with a web shell.  The original console lives untouched in
> [`Hosaka_Field-Terminal/`](./Hosaka_Field-Terminal/).

---

## Two modes, one identity

| Mode          | Where                                     | Backend                    | Terminal           |
| ------------- | ----------------------------------------- | -------------------------- | ------------------ |
| **Hosted**    | GH Pages / Vercel / Cloudflare Pages      | none (static)              | simulated in JS    |
| **Appliance** | Raspberry Pi, cyberdeck, kiosk Chromium   | FastAPI + Picoclaw gateway | real PTY eventually |

- The hosted build is a **loving simulation** — same banner, same
  commands, same plant, no real shell.
- The appliance keeps the existing Python TUI from the original repo,
  ready to be extended with a PTY bridge later (see
  [`docs/architecture.md`](./docs/architecture.md)).

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

- **Terminal** — `xterm.js` + a scripted Hosaka shell. Try `/commands`,
  `/plant`, `/orb`, `/lore`, `/status`, `/signal`.
- **Gemini LLM** — bring your own API key (stored in `localStorage`) or
  use the optional Vercel Edge Function proxy. Try `/ask`, `/chat`,
  `/model`. Gemini can also call a **watertight set of tools**
  (time/math/lore/memory — see [`docs/tools-sandbox.md`](./docs/tools-sandbox.md)).
- **Picoclaw agent (optional)** — a passphrase-gated websocket into a
  Fly.io-hosted picoclaw binary with a real sandboxed filesystem and
  shell. `/agent on` routes input there instead. See
  [`docs/agent-backend.md`](./docs/agent-backend.md).
- **Video** — pick a local file or paste a direct-URL video.
- **Messages** — offline orb chat or a Discord/Slack/custom webhook.
- **Lore** — breadcrumbs from before the cascade.

Touch, mouse, and keyboard are all first-class. Tabs are 44px min. The
terminal gets focus when you tap it.

---

## Deploy in ~5 minutes

Pick one (or all three — they don't mind each other):

| Target              | Instructions                                                       |
| ------------------- | ------------------------------------------------------------------ |
| GitHub Pages        | Push to `main`; the workflow in `.github/workflows/deploy.yml` builds and publishes. |
| Vercel              | `vercel.json` is at the root. Point Vercel at this repo. Done.     |
| Cloudflare Pages    | Build command `cd frontend && npm ci && npm run build`, output dir `frontend/dist`. |
| Custom domain       | See [`docs/deployment.md`](./docs/deployment.md).                  |

For a custom domain on GitHub Pages, copy
[`frontend/public/CNAME.example`](./frontend/public/CNAME.example) to
`frontend/public/CNAME` and set your hostname. The deploy workflow
detects this and serves at `/` instead of `/<repo>/`.

---

## Documentation map

Human-readable:

- [`docs/architecture.md`](./docs/architecture.md) — what lives where, and why.
- [`docs/deployment.md`](./docs/deployment.md) — GH Pages, Vercel, Cloudflare, custom domain.
- [`docs/llm.md`](./docs/llm.md) — Gemini (BYOK + proxy), env vars, free-tier notes.
- [`docs/tools-sandbox.md`](./docs/tools-sandbox.md) — the watertight client-side tool set.
- [`docs/agent-backend.md`](./docs/agent-backend.md) — optional picoclaw on Fly.io, threat model, hardening checklist.
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
