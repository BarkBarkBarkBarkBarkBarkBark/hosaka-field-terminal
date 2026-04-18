#!/usr/bin/env bash
# Entrypoint for the hosaka agent-server container.
#
# Writes a minimal picoclaw config at startup if an API key is available,
# then launches uvicorn.  The generated config is the only place the LLM key
# touches disk; it lives in ~/.picoclaw/config.json and is readable only by
# the hosaka user.

set -euo pipefail

CONFIG_DIR="${HOME:-/home/hosaka}/.picoclaw"
CONFIG_FILE="${CONFIG_DIR}/config.json"
mkdir -p "${CONFIG_DIR}"
chmod 700 "${CONFIG_DIR}"

# Prefer an already-mounted config if the operator provided one.
if [[ -s "${CONFIG_FILE}" ]]; then
  echo "[start.sh] using existing picoclaw config at ${CONFIG_FILE}"
else
  # Choose a provider based on which key is present.
  provider=""
  api_key=""
  api_base=""
  default_model="${PICOCLAW_MODEL:-}"

  if [[ -n "${GEMINI_API_KEY:-}" ]]; then
    provider="gemini"
    api_key="${GEMINI_API_KEY}"
    # Picoclaw uses litellm-style model strings.
    default_model="${default_model:-gemini/gemini-2.5-flash-lite}"
  elif [[ -n "${OPENAI_API_KEY:-}" ]]; then
    provider="openai"
    api_key="${OPENAI_API_KEY}"
    api_base="${OPENAI_API_BASE:-https://api.openai.com/v1}"
    default_model="${default_model:-openai/gpt-4o-mini}"
  fi

  if [[ -n "${provider}" ]]; then
    echo "[start.sh] writing ${CONFIG_FILE} (provider=${provider}, model=${default_model})"
    python - <<PY
import json, os, pathlib
cfg_path = pathlib.Path(os.environ["HOME"]) / ".picoclaw" / "config.json"
provider = "${provider}"
model = "${default_model}"
entry = {
    "model_name": model.split("/", 1)[-1],
    "model": model,
    "api_key": "${api_key}",
}
if "${api_base}":
    entry["api_base"] = "${api_base}"
cfg = {
    "model_list": [entry],
    "agents": {
        "defaults": {
            "model_name": entry["model_name"],
            "workspace": os.environ.get("HOSAKA_WORKSPACE_ROOT", "/workspaces"),
            "restrict_to_workspace": True,
        }
    },
    "gateway": {"host": "127.0.0.1", "port": 18790},
}
cfg_path.write_text(json.dumps(cfg, indent=2))
PY
    chmod 600 "${CONFIG_FILE}"
  else
    echo "[start.sh] no GEMINI_API_KEY or OPENAI_API_KEY set; picoclaw will bail out when asked to think." >&2
  fi
fi

# Scrub our own env so the subprocess can't echo our secrets back.
# server.py already allowlists env vars, but belt-and-braces.
unset GEMINI_API_KEY OPENAI_API_KEY ANTHROPIC_API_KEY || true

exec python -m uvicorn server:app \
  --host 0.0.0.0 \
  --port "${PORT:-8080}" \
  --proxy-headers \
  --forwarded-allow-ips "*"
