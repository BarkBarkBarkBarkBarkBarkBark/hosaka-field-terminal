project: hosaka-web-desktop
repo: https://github.com/BarkBarkBarkBarkBarkBarkBark/Hosaka
objective: >
  Evolve Hosaka from a console-first field terminal into a web-first desktop shell
  where the terminal is the primary application, but the UI can also display images,
  video, docs, simple browser content, and other panels. The same core app must run:
  (1) locally on a field terminal with a capacitive touch screen, and
  (2) as a hosted web app on AWS deployed through GitHub Actions.

product_decision:
  summary: >
    Build a browser-based desktop shell, not a terminal-only TUI. The terminal remains
    the hero feature, but it lives inside a windowed web desktop.
  constraints:
    - Preserve Hosaka's identity as a terminal-first appliance.
    - Do not throw away the current Python/FastAPI backend unless necessary.
    - Keep the current TUI usable during migration.
    - Support mouse, touch scrolling, text selection, clipboard, and image/video display.
    - Support fullscreen/kiosk deployment on Raspberry Pi or similar field hardware.
    - Hosted web deployment must work on AWS.
    - Arbitrary third-party websites must NOT be assumed embeddable in iframes.
      In web mode, blocked sites should open externally.
  technical_choices:
    frontend:
      - React
      - TypeScript
      - Vite
      - xterm.js for the terminal surface
      - Dockview for IDE-like layout, tabs, floating panels, and popouts
    backend:
      - Keep FastAPI for orchestration/config/setup APIs
      - Add a websocket PTY bridge endpoint
      - Prefer Python PTY implementation first to minimize repo sprawl
      - If PTY complexity becomes painful, allow a small Node sidecar using node-pty
    runtime_modes:
      - appliance_mode: local fullscreen Chromium kiosk pointed at local Hosaka web app
      - hosted_mode: AWS-hosted frontend/backend stack behind auth and TLS
      - future_native_mode: optional Electron wrapper only if true in-app third-party web embedding is later required
  non_goals:
    - Do not build a full custom browser engine
    - Do not promise embedded Discord/Amazon inside the hosted browser version
    - Do not rewrite the whole project into Electron right now

repo_observations:
  - Hosaka already has both tui and web surfaces.
  - There is already a FastAPI web server under hosaka/web/server.py.
  - The repo should be evolved, not replaced.

deliverables:
  - A new web desktop frontend mounted into this repo
  - A terminal panel using xterm.js connected to a websocket PTY backend
  - A panel/window manager with draggable tabs and floating panels
  - Media/document panels for:
      - images
      - video
      - markdown/plain text
      - simple embedded same-origin pages
  - Browser-launch behavior:
      - same-origin or explicitly allowed pages may render in-panel
      - blocked or third-party sites open in new tab/external browser
  - Touch support:
      - tap focus
      - drag scrolling
      - text selection
      - basic zoom strategy for images/docs
  - AWS deployment assets:
      - Dockerfile(s)
      - docker-compose for local dev
      - GitHub Actions workflow to build and deploy
  - Documentation:
      - architecture.md
      - local-development.md
      - deployment.md
      - appliance-mode.md

implementation_plan:
  phase_1_foundation:
    - Inspect current repo layout and preserve Python entrypoints.
    - Create a new frontend app directory, preferably frontend/ or hosaka_frontend/.
    - Add React + TypeScript + Vite.
    - Add shared styling/theme aligned with Hosaka aesthetic.
  phase_2_terminal:
    - Implement TerminalPanel using xterm.js.
    - Add websocket connection management, reconnect logic, resize handling, and clipboard support.
    - Add selection, copy, paste, and mouse wheel behavior.
    - Add touch-friendly focus and scrolling behavior.
  phase_3_backend_bridge:
    - Add websocket PTY endpoint to backend.
    - Launch shell sessions safely per authenticated user/session.
    - Support terminal resize and clean session teardown.
    - Enforce least privilege; do not run shell as root.
  phase_4_windowed_desktop:
    - Implement Dockview layout with default panels:
        - Terminal
        - Files/Docs
        - Media
        - Status
        - Help
    - Add a command palette or launcher for opening panels.
    - Make terminal the default focused panel on boot.
  phase_5_media_and_browserish_features:
    - Add image viewer panel.
    - Add video/audio viewer panel.
    - Add markdown/text viewer panel.
    - Add web panel with strict rules:
        - allow same-origin app pages
        - allow explicit allowlist entries
        - otherwise open external
  phase_6_appliance_mode:
    - Add kiosk launch instructions for Chromium on Raspberry Pi/Linux.
    - Ensure touch screen basics work.
    - Add fullscreen layout preset for small displays.
  phase_7_hosting:
    - Add production build flow.
    - Add AWS deployment target assumptions:
        - containerized app
        - reverse proxy
        - TLS
        - authenticated access
    - Add GitHub Actions workflow for build and deploy.
  phase_8_docs_and_cleanup:
    - Write migration notes.
    - Keep old TUI path working.
    - Document future optional Electron wrapper path, but do not implement unless necessary.

required_architecture_rules:
  - Keep terminal-first UX.
  - Keep backend APIs clean and typed.
  - Separate frontend panel state from terminal session state.
  - Make every panel individually openable/closable.
  - Prefer progressive enhancement over a giant rewrite.
  - Do not ship insecure public shell defaults.

acceptance_criteria:
  - App loads as a desktop-like shell in browser.
  - Terminal supports typing, resize, selection, copy/paste, and reconnect.
  - Mouse and touch interactions are usable on a capacitive screen.
  - Images and video can be opened in panels.
  - Multiple panels can be rearranged.
  - Hosted build works in Docker.
  - Deployment pipeline exists via GitHub Actions.
  - Docs explain local, appliance, and AWS modes.
  - Existing Hosaka identity and terminal-first experience remain intact.

first_task_for_agent: >
  Start by inspecting the existing Hosaka repo and propose the minimal-change file/folder plan.
  Then scaffold the frontend and integrate it with the current Python backend without breaking
  the existing console workflow.