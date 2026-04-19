#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# scripts/link-console.sh — symlink frontend source to a local console checkout
#
# For local development, instead of cloning from GitHub on every build,
# this creates symlinks from your local hosaka_console checkout.
#
# Usage:
#   ./scripts/link-console.sh                          # auto-detect sibling repo
#   ./scripts/link-console.sh /path/to/hosaka/Hosaka   # explicit path
#   ./scripts/link-console.sh --unlink                 # remove symlinks, restore dirs
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FRONTEND="$REPO_ROOT/frontend"

# ── unlink mode ─────────────────────────────────────────────────────────────
if [ "${1:-}" = "--unlink" ]; then
  echo "⟡ unlinking …"
  for target in src index.html; do
    p="$FRONTEND/$target"
    if [ -L "$p" ]; then
      rm "$p"
      echo "  removed symlink: $target"
    fi
  done
  for target in public/locales public/library public/splash.png; do
    p="$FRONTEND/$target"
    if [ -L "$p" ]; then
      rm "$p"
      echo "  removed symlink: $target"
    fi
  done
  echo "⟡ done — run scripts/sync-console.sh to get real copies."
  exit 0
fi

# ── find console checkout ──────────────────────────────────────────────────
if [ -n "${1:-}" ]; then
  CONSOLE="$1"
else
  # Try common sibling paths
  for candidate in \
    "$REPO_ROOT/../hosaka_console/Hosaka" \
    "$REPO_ROOT/../Hosaka" \
    "$REPO_ROOT/../hosaka-console/Hosaka" \
  ; do
    if [ -d "$candidate/frontend/src" ]; then
      CONSOLE="$candidate"
      break
    fi
  done
fi

if [ -z "${CONSOLE:-}" ] || [ ! -d "$CONSOLE/frontend/src" ]; then
  echo "✗ could not find hosaka_console checkout." >&2
  echo "  usage: $0 [/path/to/Hosaka]" >&2
  exit 1
fi

CONSOLE="$(cd "$CONSOLE" && pwd)"
echo "⟡ linking to: $CONSOLE"

# ── create symlinks ─────────────────────────────────────────────────────────
link() {
  local src="$1" dst="$2"
  if [ -e "$dst" ] && [ ! -L "$dst" ]; then
    echo "  backing up: $dst → ${dst}.bak"
    mv "$dst" "${dst}.bak"
  elif [ -L "$dst" ]; then
    rm "$dst"
  fi
  ln -sf "$src" "$dst"
  echo "  linked: $(basename "$dst") → $src"
}

link "$CONSOLE/frontend/src"              "$FRONTEND/src"
link "$CONSOLE/frontend/index.html"       "$FRONTEND/index.html"
link "$CONSOLE/frontend/public/locales"   "$FRONTEND/public/locales"
link "$CONSOLE/frontend/public/library"   "$FRONTEND/public/library"
[ -f "$CONSOLE/frontend/public/splash.png" ] && \
  link "$CONSOLE/frontend/public/splash.png" "$FRONTEND/public/splash.png"

echo "⟡ done — vite dev will read directly from your console checkout."
echo "  run '$0 --unlink' to remove symlinks."
