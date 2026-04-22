#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# scripts/sync-console.sh — pull the canonical frontend from hosaka_console
#
# The field-terminal repo does NOT maintain its own copy of the SPA source.
# At build time (Vercel, GH Pages, local) this script clones the upstream
# Hosaka repo and copies the frontend source into place.
#
# What gets pulled:
#   frontend/src/          ← React SPA source (App.tsx, panels, shell, llm, …)
#   frontend/index.html    ← boot splash + mount point
#   frontend/public/       ← locales, library markdown, splash.png, …
#
# What stays local (NOT overwritten):
#   frontend/package.json
#   frontend/vite.config.ts
#   frontend/tsconfig*.json
#   frontend/.env*
#   api/gemini.ts          ← Vercel edge proxy
#   agent-server/          ← Fly.io picoclaw bridge
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

CONSOLE_REPO="https://github.com/BarkBarkBarkBarkBarkBarkBark/Hosaka.git"
CONSOLE_REF="${HOSAKA_CONSOLE_REF:-main}"   # pin to a tag/sha if you want release gates

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FRONTEND="$REPO_ROOT/frontend"
TMP_DIR="${RUNNER_TEMP:-/tmp}/hosaka-console-$$"

echo "⟡ sync-console: cloning $CONSOLE_REPO@$CONSOLE_REF …"
git clone --depth 1 --branch "$CONSOLE_REF" "$CONSOLE_REPO" "$TMP_DIR" 2>&1 | tail -3

UPSTREAM="$TMP_DIR/frontend"

if [ ! -d "$UPSTREAM/src" ]; then
  echo "✗ upstream frontend/src/ not found — clone failed?" >&2
  rm -rf "$TMP_DIR"
  exit 1
fi

# ── sync src/ (complete replacement) ────────────────────────────────────────
echo "⟡ sync-console: copying src/ …"
rm -rf "$FRONTEND/src"
cp -r "$UPSTREAM/src" "$FRONTEND/src"

# ── sync index.html ────────────────────────────────────────────────────────
echo "⟡ sync-console: copying index.html …"
cp "$UPSTREAM/index.html" "$FRONTEND/index.html"

# ── sync public/ (merge — keep local CNAME, _headers, etc.) ────────────────
echo "⟡ sync-console: syncing public/ …"

# Locale JSON — full replacement
rm -rf "$FRONTEND/public/locales"
cp -r "$UPSTREAM/public/locales" "$FRONTEND/public/locales"

# Library content — full replacement
rm -rf "$FRONTEND/public/library"
cp -r "$UPSTREAM/public/library" "$FRONTEND/public/library"

# Reading collections — full replacement (collections.json + any future siblings)
rm -rf "$FRONTEND/public/reading"
if [ -d "$UPSTREAM/public/reading" ]; then
  cp -r "$UPSTREAM/public/reading" "$FRONTEND/public/reading"
fi

# Individual assets
for f in splash.png; do
  if [ -f "$UPSTREAM/public/$f" ]; then
    cp "$UPSTREAM/public/$f" "$FRONTEND/public/$f"
  fi
done

# ── cleanup ─────────────────────────────────────────────────────────────────
rm -rf "$TMP_DIR"

echo "⟡ sync-console: done — frontend source is canonical."
