# Appliance mode

Turning the web desktop into a durable touchscreen appliance on a
Raspberry Pi (or any small Linux box with a screen).

## Hardware targets

- Raspberry Pi 4/5 + official DSI touchscreen (or HDMI + USB touch).
- Any x86 mini-PC with a capacitive touchscreen works too.
- 1GB RAM minimum for Chromium kiosk.

## Two install flavours

### A. Hosted (easy mode)

The Pi just points a fullscreen Chromium at your deployed URL. Zero
code on the Pi.

1. Deploy the web desktop somewhere (see [deployment.md](./deployment.md)).
2. On the Pi:

   ```bash
   sudo apt install -y chromium-browser unclutter
   mkdir -p ~/.config/autostart
   cat > ~/.config/autostart/hosaka.desktop <<'EOF'
   [Desktop Entry]
   Type=Application
   Name=Hosaka
   Exec=chromium-browser --kiosk --noerrdialogs --disable-infobars \
        --ozone-platform=wayland --app=https://your-domain.example/
   X-GNOME-Autostart-enabled=true
   EOF
   ```

3. Reboot. Hosaka greets you on boot.

### B. Local (offline-capable)

Serve the built SPA from the Pi itself so it works without network.

1. Build on your dev machine and sync `frontend/dist/` to the Pi,
   or build on the Pi:

   ```bash
   cd frontend
   npm ci
   HOSAKA_BASE=/ npm run build
   ```

2. Serve it with anything trivial (pick one):

   ```bash
   # python (already on the Pi)
   cd frontend/dist && python -m http.server 8080

   # or nginx / caddy / busybox httpd
   ```

3. Point Chromium at `http://localhost:8080/` using the kiosk desktop
   file from option A.

### C. Full appliance + real terminal

For the real terminal (not the simulation), run the **original
Hosaka TUI** alongside the web shell:

```bash
cd Hosaka_Field-Terminal
./scripts/setup_hosaka.sh        # upstream installer
```

The TUI and the web desktop don't share state today. A future PTY
bridge is the natural next step — see
[architecture.md](./architecture.md).

## Touchscreen tuning

- Chromium: `--touch-events=enabled --force-device-scale-factor=1`.
- Hide the cursor with `unclutter -idle 0`.
- Rotate if needed: `xrandr --output HDMI-1 --rotate left` (Xorg) or
  `wlr-randr --output HDMI-A-1 --transform 90` (Wayland).
- Disable screensaver:
  ```bash
  xset s off -dpms s noblank
  ```
- All tap targets in the UI are ≥44px. Keyboard pops up automatically
  when you focus a text field in Chromium on touch-only devices
  (enable **Tablet UI** under `chrome://flags`).

## Dev niceties

- `Ctrl+F5` in Chromium reloads without cache.
- Exit kiosk: `Ctrl+Alt+F2` (virtual terminal), then kill Chromium.

_Keep signal steady. 📡_
