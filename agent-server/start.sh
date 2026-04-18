#!/usr/bin/env bash
# Entrypoint for the hosaka agent-server container.
#
# Writes a picoclaw v2 config at startup using whichever provider key is
# in the environment, then launches uvicorn.  The generated config is the
# only place the LLM key touches disk; it lives in ~/.picoclaw/config.json
# and is readable only by the hosaka user.
#
# Why we write JSON ourselves instead of `picoclaw onboard`:
# - onboard is interactive
# - we want exact control over which tools are enabled
# - we want to set version=2 so picoclaw doesn't migrate on every cold start
#   (a migration drops api_key fields silently — see docs/agent-backend.md).

set -euo pipefail

CONFIG_DIR="${HOME:-/home/hosaka}/.picoclaw"
CONFIG_FILE="${CONFIG_DIR}/config.json"
WORKSPACE_ROOT="${HOSAKA_WORKSPACE_ROOT:-/workspaces}"

mkdir -p "${CONFIG_DIR}"
chmod 700 "${CONFIG_DIR}"

# Prefer an already-mounted config if the operator provided one verbatim.
if [[ -s "${CONFIG_FILE}" ]] && grep -q '"version"' "${CONFIG_FILE}"; then
  echo "[start.sh] using existing v2 picoclaw config at ${CONFIG_FILE}"
else
  # Choose a provider based on which key is present.
  provider=""
  api_key=""
  api_base=""
  default_model="${PICOCLAW_MODEL:-}"

  if [[ -n "${GEMINI_API_KEY:-}" ]]; then
    provider="gemini"
    api_key="${GEMINI_API_KEY}"
    default_model="${default_model:-gemini/gemini-2.5-flash-lite}"
  elif [[ -n "${OPENAI_API_KEY:-}" ]]; then
    provider="openai"
    api_key="${OPENAI_API_KEY}"
    api_base="${OPENAI_API_BASE:-https://api.openai.com/v1}"
    default_model="${default_model:-openai/gpt-4o-mini}"
  fi

  if [[ -z "${provider}" ]]; then
    echo "[start.sh] no GEMINI_API_KEY or OPENAI_API_KEY set; picoclaw will refuse to think." >&2
  else
    echo "[start.sh] writing v2 ${CONFIG_FILE} (provider=${provider}, model=${default_model})"
    PICOCLAW_PROVIDER="${provider}" \
    PICOCLAW_API_KEY="${api_key}" \
    PICOCLAW_API_BASE="${api_base}" \
    PICOCLAW_DEFAULT_MODEL="${default_model}" \
    PICOCLAW_WORKSPACE="${WORKSPACE_ROOT}" \
    PICOCLAW_CONFIG_PATH="${CONFIG_FILE}" \
    python - <<'PY'
import json
import os
from pathlib import Path

provider = os.environ["PICOCLAW_PROVIDER"]
api_key = os.environ["PICOCLAW_API_KEY"]
api_base = os.environ.get("PICOCLAW_API_BASE", "")
model = os.environ["PICOCLAW_DEFAULT_MODEL"]
workspace = os.environ["PICOCLAW_WORKSPACE"]
cfg_path = Path(os.environ["PICOCLAW_CONFIG_PATH"])

# Friendly model_name = the bit after the slash, if any.
short_name = model.split("/", 1)[-1]

model_entry = {
    "model_name": short_name,
    "model": model,
    "api_keys": [api_key],         # v2 schema: plural + array
    "enabled": True,
}
if api_base:
    model_entry["api_base"] = api_base

# Tools we explicitly enable for the hosted demo.  Everything else stays off.
# Sandboxing is done by picoclaw's restrict_to_workspace + our per-session
# /workspaces/<sid>/ chroot-ish dir.
ENABLED_TOOLS = {
    "read_file":    {"enabled": True, "mode": "", "max_read_file_size": 0},
    "write_file":   {"enabled": True},
    "append_file":  {"enabled": True},
    "edit_file":    {"enabled": True},
    "list_dir":     {"enabled": True},
    "spawn":        {"enabled": True},   # shell — restricted to workspace
    "spawn_status": {"enabled": True},
    "find_skills":  {"enabled": True},
}

cfg = {
    "version": 2,
    "agents": {
        "defaults": {
            "workspace": workspace,
            "restrict_to_workspace": True,
            "allow_read_outside_workspace": False,
            "provider": provider,
            "model_name": short_name,
            "steering_mode": "one-at-a-time",
        },
    },
    "model_list": [model_entry],
    "gateway": {
        "host": "127.0.0.1",
        "port": 18790,
        "hot_reload": False,
    },
    "tools": {
        "filter_sensitive_data": True,
        "filter_min_length": 8,
        **ENABLED_TOOLS,
    },
    "build_info": {"version": "0.2.6"},
}

cfg_path.write_text(json.dumps(cfg, indent=2))
PY
    chmod 600 "${CONFIG_FILE}"
  fi
fi

# Scrub our own env so the subprocess can't echo our secrets back.
# server.py also allowlists env vars, but belt-and-braces.
unset GEMINI_API_KEY OPENAI_API_KEY ANTHROPIC_API_KEY \
      PICOCLAW_PROVIDER PICOCLAW_API_KEY PICOCLAW_API_BASE \
      PICOCLAW_DEFAULT_MODEL PICOCLAW_CONFIG_PATH 2>/dev/null || true

exec python -m uvicorn server:app \
  --host 0.0.0.0 \
  --port "${PORT:-8080}" \
  --proxy-headers \
  --forwarded-allow-ips "*"
