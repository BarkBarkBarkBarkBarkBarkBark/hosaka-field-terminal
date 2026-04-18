# Local development

## Prerequisites

- **Node** 20 or newer.
- **Python** 3.10+ (only for the appliance-mode TUI).
- `npm` comes with Node. `python` (not `python3`) is the convention here.

## Frontend dev loop

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. Edits hot-reload.

Other scripts:

| Script            | Does                                            |
| ----------------- | ----------------------------------------------- |
| `npm run dev`     | Vite dev server on `:5173`                      |
| `npm run build`   | `tsc -b && vite build` → `frontend/dist/`       |
| `npm run preview` | Serve the production build on `:4173`           |
| `npm run typecheck` | `tsc -b --noEmit`                             |

## Adding a shell command

1. Add a row to `frontend/src/shell/commands.ts` so `/commands` lists it.
2. Add a `case "/your-cmd":` in `HosakaShell.dispatch`
   (`frontend/src/shell/HosakaShell.ts`).

Keep names consistent with the Python TUI where the feature exists there.

## Adding a panel

1. Drop a new component in `frontend/src/panels/`.
2. Register it in `frontend/src/App.tsx`:
   - add an entry to `PANELS`
   - render `<YourPanel />` inside the stage.
3. Style with existing classes or extend `frontend/src/styles/app.css`.

## Theme

All colours live in `:root` inside
[`frontend/src/styles/app.css`](../frontend/src/styles/app.css). The
`xterm.js` theme is in `TerminalPanel.tsx` — if you change the palette,
mirror the changes there.

## Appliance TUI

```bash
cd Hosaka_Field-Terminal
source ../.venv/bin/activate       # use the repo-root venv
pip install -r requirements-hosaka.txt
python -m hosaka
```

This is the original Hosaka console. The web build is a sibling, not
a replacement.

## Commit hygiene

We don't auto-commit. When you're happy with a change, ask the agent
to commit it — or just run `git` yourself. The assistant respects
commit/push boundaries (see repo rules).
