# AGENTS.md

Seed context for AI coding agents working in this repo.
Read this file first. It is short on purpose.

## Identity

- Project: **hosaka-web-desktop** (fork/extension of
  [Hosaka](https://github.com/BarkBarkBarkBarkBarkBarkBark/Hosaka)).
- Pitch: a touch-friendly web desktop that puts a simulated terminal
  behind a glass screen, plays videos, and sends messages via webhooks.
- Tone: quirky, terse, lowercase, "signal steady", "no wrong way".
  Keep humor dry and sparing. The orb never shouts.

## Two runtime modes

1. **Hosted mode** — fully static SPA in [`frontend/`](./frontend),
   deployed to GitHub Pages / Vercel / Cloudflare Pages.  No backend,
   no secrets.  The terminal is simulated in TypeScript
   ([`frontend/src/shell/HosakaShell.ts`](./frontend/src/shell/HosakaShell.ts)).
2. **Appliance mode** — the original Python TUI in
   [`Hosaka_Field-Terminal/`](./Hosaka_Field-Terminal). Runs on a
   Raspberry Pi or laptop. Entry: `python -m hosaka`. Uses
   `requirements-hosaka.txt`. Do **not** rewrite this unless asked.

Hosted and appliance share **vibe** and **command taxonomy**, not
code. The appliance is the source of truth for Hosaka's identity.

## Directory truth

| Path                                  | Purpose                                  |
| ------------------------------------- | ---------------------------------------- |
| `frontend/`                           | Vite + React + TS web desktop            |
| `frontend/src/panels/`                | One file per top-level panel             |
| `frontend/src/shell/`                 | Simulated shell logic & content          |
| `frontend/src/components/`            | Small shared UI atoms                    |
| `frontend/src/styles/app.css`         | Single stylesheet, CSS variables         |
| `frontend/public/CNAME`               | Custom-domain stub for GH Pages          |
| `Hosaka_Field-Terminal/`              | Original Python TUI (preserved)          |
| `docs/`                               | Human docs + machine-readable seeds      |
| `.github/workflows/`                  | GH Pages deploy + typecheck CI           |
| `vercel.json`                         | Vercel project config                    |
| `instructions.md`                     | Historical mission brief (do not rely on for AWS) |

## Conventions

- **Language**: use `python`, not `python3` (see user rules).
- **Package manager**: `npm` inside `frontend/`. Node 20+ required.
- **TS**: strict mode on. No `any`. Keep components small.
- **CSS**: one global stylesheet, CSS vars for theme. No CSS-in-JS.
- **Commits / PRs**: don't invent GitHub identities. Ask before
  committing if git state is unclear.
- **Secrets**: never bake any in. Webhook URLs live in `localStorage`.

## Common commands

```bash
# web desktop
cd frontend
npm install
npm run dev          # local dev server on :5173
npm run build        # typecheck + vite build to frontend/dist
npm run typecheck    # tsc only

# appliance TUI
cd Hosaka_Field-Terminal
source ../.venv/bin/activate
pip install -r requirements-hosaka.txt
python -m hosaka
```

## Non-goals

- Do not rewrite the Python TUI.
- Do not add a Python backend to the hosted build — it must stay static.
- Do not promise embedded third-party browser pages (Discord, YouTube,
  Amazon, etc.). They all block iframing. Link out instead.
- Do not adopt Electron unless explicitly asked.
- Do not break the `/commands` taxonomy — mirror names from
  [`Hosaka_Field-Terminal/hosaka/main_console.py`](./Hosaka_Field-Terminal/hosaka/main_console.py).

## Extension points for agents

- Add panels: drop a new file into `frontend/src/panels/`, register it
  in [`frontend/src/App.tsx`](./frontend/src/App.tsx) (`PANELS` array +
  render block).
- Add shell commands: edit
  [`frontend/src/shell/commands.ts`](./frontend/src/shell/commands.ts)
  and add a case in `HosakaShell.dispatch`.
- Theme tweaks: edit `:root` variables in
  [`frontend/src/styles/app.css`](./frontend/src/styles/app.css).

## Further seeds

- [`docs/llms.txt`](./docs/llms.txt) — index for LLM tooling.
- [`docs/context.seed.json`](./docs/context.seed.json) — structured facts.
- [`docs/architecture.md`](./docs/architecture.md) — diagrams & rationale.
