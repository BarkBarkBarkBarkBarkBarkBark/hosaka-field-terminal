# Architecture

> Short version: a static React app pretends to be a terminal, while the
> real terminal waits patiently on a Pi. They share a vibe, not code.

```
┌──────────────────────────────────────────────────────────────┐
│                    H O S A K A — two modes                   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│   ── HOSTED ──                    ── APPLIANCE ──            │
│                                                              │
│   browser / touchscreen           raspberry pi / cyberdeck   │
│       │                                 │                    │
│       ▼                                 ▼                    │
│   Vite + React SPA               python -m hosaka            │
│       │                                 │                    │
│       ▼                                 ▼                    │
│   xterm.js + simulated         console TUI  (main_console)   │
│   HosakaShell.ts                        │                    │
│       │                                 ▼                    │
│       ▼                         picoclaw gateway → LLM       │
│   webhook → discord/slack                                    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## Why static-first

The brief is _"publish a hosted instance over a custom domain via
Vercel or Cloudflare"_. GitHub Pages is even easier and has zero
opinions. Static deployment means:

- No backend means no secrets, no auth, no cron, no attack surface.
- A demo that never goes down costs $0.
- Any "real" shell feature is an appliance-mode concern.

The original `instructions.md` aspired to an AWS/Dockview/Electron
maximalist plan. We kept the good parts (terminal-first identity,
panels, touch support) and skipped the parts that need servers.

## Frontend shape

```
frontend/src/
├── main.tsx               # React root
├── App.tsx                # top bar + dock + panel router
├── panels/
│   ├── TerminalPanel.tsx  # owns xterm.js instance
│   ├── VideoPanel.tsx     # <video> + file/url picker
│   ├── MessagesPanel.tsx  # webhook / localStorage orb chat
│   └── LorePanel.tsx      # breadcrumbs + manifest
├── shell/
│   ├── HosakaShell.ts     # simulated shell, ANSI-aware
│   ├── commands.ts        # command metadata
│   └── content.ts         # banner, plant frames, orbs, lore
├── components/
│   ├── PlantBadge.tsx
│   └── SignalBadge.tsx
└── styles/
    └── app.css            # single global stylesheet
```

### Panel model

Every panel is a plain React component rendered inside the stage.
Switching tabs toggles `hidden` so the terminal keeps its xterm.js
instance alive across tab flips (no re-fit, no scroll-loss).

### Terminal model

- `xterm.js` owns the DOM.
- `HosakaShell` owns input state (buffer, cursor, history).
- Commands are case-split inside `dispatch`. The taxonomy mirrors
  `Hosaka_Field-Terminal/hosaka/main_console.py` so the muscle memory
  you build in one works in the other.
- History is in-memory. `localStorage` persistence is a future
  improvement.

### Messaging model

The messages panel POSTs JSON to any URL. Three presets: Discord,
Slack, and generic. The URL + kind + username are the only config
and they live in `localStorage`. Nothing about this requires a server.

## Appliance side

Untouched. `Hosaka_Field-Terminal/` is the upstream Hosaka repo,
included as a subfolder so you can `python -m hosaka` directly.

If we ever want to bridge them — a real PTY over websocket, plant
state mirrored into the browser — the cleanest path is:

1. Add a `/pty` websocket endpoint to
   `Hosaka_Field-Terminal/hosaka/web/server.py`.
2. Add a `WebsocketTerminalBackend` alongside `HosakaShell` in the
   frontend, selected by env/URL.
3. Keep the simulated shell as the fallback (and hosted default).

See the original [`instructions.md`](../instructions.md) for the
larger migration sketch.

## Conventions

- **Commands are data.** Adding a command means editing two files:
  `shell/commands.ts` (metadata for `/commands`) and
  `shell/HosakaShell.ts` (the case handler).
- **Panels are data too.** Add to `PANELS` in `App.tsx`, then render.
- **Themes are CSS variables** in `styles/app.css`. Stay in the
  amber/cyan/violet palette for consistency with the TUI.
- **Touch**: all tappable targets are ≥44px. Tabs scroll horizontally
  on narrow screens.

## The plant, briefly

The hosted plant is a fake. It advances one tick per command typed in
the simulated shell (see `plantTicks` in `HosakaShell`). The real plant
persists to `~/.hosaka/plant.json` in appliance mode and is the
authoritative organism. If hosted plant ever learns to talk to real
plant, we'll know the cascade is near.
