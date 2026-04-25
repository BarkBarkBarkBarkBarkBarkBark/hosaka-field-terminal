# AGENTS.md

Seed context for AI coding agents working in this repo.
Read this file first. It is short on purpose.

## Identity

- Project: **hosaka-field-terminal** — the hosted deployment wrapper for
  [Hosaka](https://github.com/BarkBarkBarkBarkBarkBarkBark/Hosaka).
- The **console repo** (Hosaka) is the single source of truth for the
  React SPA. This repo does **not** maintain its own copy of the frontend
  source. It pulls it at build time.
- Tone: quirky, terse, lowercase, "signal steady", "no wrong way".

## Architecture

```
hosaka_console (Hosaka repo)     ← canonical frontend source
        │
        │  git clone --depth 1 (build-time)
        ▼
hosaka_field-terminal            ← this repo: deployment wrapper
  ├── scripts/sync-console.sh   ← pulls frontend/src, index.html, public/
  ├── frontend/
  │   ├── vite.config.ts        ← hosted build config (local to this repo)
  │   ├── package.json          ← deps + scripts (local to this repo)
  │   ├── .env.hosted           ← hosted-mode env vars
  │   ├── src/ ← SYNCED         ← from console, not committed
  │   ├── index.html ← SYNCED
  │   └── public/ ← SYNCED (locales, library, splash)
  ├── api/gemini.ts             ← Vercel Edge proxy (unique to this repo)
  ├── agent-server/             ← Fly.io picoclaw bridge (unique to this repo)
  └── vercel.json               ← runs sync-console.sh before npm ci
```

## What's unique to this repo (do not delete)

| Path                          | Purpose                                  |
| ----------------------------- | ---------------------------------------- |
| `api/gemini.ts`               | Vercel Edge Function; proxies chat to Gemini, hides API key |
| `agent-server/`               | Fly.io FastAPI + picoclaw WebSocket bridge |
| `frontend/vite.config.ts`     | Hosted build config (no outDir override, sourcemaps on) |
| `frontend/package.json`       | Deps + scripts for the hosted build      |
| `frontend/.env.hosted`        | Hosted-mode env vars (VITE_SHOW_SETTINGS=1, etc.) |
| `scripts/sync-console.sh`    | Build-time clone of console frontend     |
| `scripts/link-console.sh`    | Local dev symlink to sibling console checkout |
| `vercel.json`                 | Vercel project config (runs sync before build) |
| `.github/workflows/`          | GH Pages deploy + CI (both run sync first) |
| `docs/`                       | Field-terminal-specific docs              |

## What's synced from console (do not edit here)

Everything under `frontend/src/`, `frontend/index.html`, and
`frontend/public/{locales,library,splash.png}` is pulled from the
console repo. **Edit those files in the Hosaka repo, not here.**

## Conventions

- **Do not edit frontend/src/ in this repo.** Changes go to the console repo.
- **Package manager**: `npm` inside `frontend/`. Node 20+ required.
- **Secrets**: never bake any in. The shared Gemini key lives only in
  Vercel's env vars and is read by `api/gemini.ts`.
- Pin to a specific console commit: `HOSAKA_CONSOLE_REF=v1.2.3 bash scripts/sync-console.sh`

## Common commands

```bash
# first time / after console updates
bash scripts/sync-console.sh        # pull latest frontend from console

# local dev (if you have console checked out as a sibling)
bash scripts/link-console.sh        # symlink instead of clone
cd frontend && npm install && npm run dev

# build
cd frontend && npm run build         # vite build to frontend/dist
npm run typecheck                    # tsc only

# agent server (Fly.io)
cd agent-server
pip install -r requirements.txt
python server.py
```

## Non-goals

- Do not maintain a copy of the frontend SPA source in this repo.
- Do not add a Python backend to the hosted build — it must stay static.
- Do not break the console repo's code to accommodate hosted-only needs.
  Use env vars and `.env.hosted` for hosted-mode behavior.

## Further seeds

- [`docs/llms.txt`](./docs/llms.txt) — index for LLM tooling.
- [`docs/context.seed.json`](./docs/context.seed.json) — structured facts.
- [`docs/architecture.md`](./docs/architecture.md) — diagrams & rationale.
