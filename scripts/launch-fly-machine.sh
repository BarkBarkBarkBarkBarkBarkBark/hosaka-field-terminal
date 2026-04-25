#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FLY_TOML="$ROOT_DIR/fly.toml"

APP_NAME="${FLY_APP_NAME:-}"
PRIMARY_REGION="${FLY_PRIMARY_REGION:-ams}"
CREATE_VOLUME="${CREATE_FLY_VOLUME:-0}"
VOLUME_NAME="${FLY_VOLUME_NAME:-hosaka_sessions}"
VOLUME_SIZE_GB="${FLY_VOLUME_SIZE_GB:-1}"

require_cmd() {
    command -v "$1" >/dev/null 2>&1 || {
        printf 'missing required command: %s\n' "$1" >&2
        exit 1
    }
}

note() {
    printf '› %s\n' "$*"
}

die() {
    printf '✗ %s\n' "$*" >&2
    exit 1
}

ensure_secret() {
    local name="$1"
    local value="${!name:-}"
    if [[ -z "$value" ]]; then
        die "missing required env: $name"
    fi
}

app_exists() {
    flyctl apps show "$1" >/dev/null 2>&1
}

ensure_app_name() {
    if [[ -n "$APP_NAME" ]]; then
        return
    fi
    if [[ -f "$FLY_TOML" ]]; then
        APP_NAME="$(awk -F '"' '/^app = / {print $2; exit}' "$FLY_TOML")"
    fi
    [[ -n "$APP_NAME" ]] || die "set FLY_APP_NAME or define app in fly.toml"
}

main() {
    require_cmd flyctl
    ensure_app_name
    ensure_secret HOSAKA_ACCESS_TOKEN
    ensure_secret HOSAKA_ALLOWED_ORIGINS

    note "using app: $APP_NAME"
    note "using region: $PRIMARY_REGION"

    if ! app_exists "$APP_NAME"; then
        note "creating fly app"
        flyctl apps create "$APP_NAME" --machines
    else
        note "fly app already exists"
    fi

    if [[ "$CREATE_VOLUME" == "1" ]]; then
        note "ensuring volume: $VOLUME_NAME"
        if ! flyctl volumes list --app "$APP_NAME" | awk 'NR>1 {print $1}' | grep -qx "$VOLUME_NAME"; then
            flyctl volumes create "$VOLUME_NAME" \
                --app "$APP_NAME" \
                --region "$PRIMARY_REGION" \
                --size "$VOLUME_SIZE_GB"
        else
            note "volume already exists"
        fi
    fi

    note "setting required secrets"
    flyctl secrets set \
        --app "$APP_NAME" \
        HOSAKA_ACCESS_TOKEN="$HOSAKA_ACCESS_TOKEN" \
        HOSAKA_ALLOWED_ORIGINS="$HOSAKA_ALLOWED_ORIGINS"

    if [[ -n "${GEMINI_API_KEY:-}" ]]; then
        note "setting GEMINI_API_KEY"
        flyctl secrets set --app "$APP_NAME" GEMINI_API_KEY="$GEMINI_API_KEY"
    fi

    if [[ -n "${OPENAI_API_KEY:-}" ]]; then
        note "setting OPENAI_API_KEY"
        flyctl secrets set --app "$APP_NAME" OPENAI_API_KEY="$OPENAI_API_KEY"
    fi

    if [[ -n "${PICOCLAW_MODEL:-}" ]]; then
        note "setting PICOCLAW_MODEL"
        flyctl secrets set --app "$APP_NAME" PICOCLAW_MODEL="$PICOCLAW_MODEL"
    fi

    if [[ -n "${HOSAKA_BROKER_SIGNING_KEY:-}" ]]; then
        note "setting HOSAKA_BROKER_SIGNING_KEY"
        flyctl secrets set --app "$APP_NAME" HOSAKA_BROKER_SIGNING_KEY="$HOSAKA_BROKER_SIGNING_KEY"
    fi

    if [[ -n "${HOSAKA_NODE_ENROLL_SECRET:-}" ]]; then
        note "setting HOSAKA_NODE_ENROLL_SECRET"
        flyctl secrets set --app "$APP_NAME" HOSAKA_NODE_ENROLL_SECRET="$HOSAKA_NODE_ENROLL_SECRET"
    fi

    if [[ -n "${HOSAKA_PAIRING_HMAC_SECRET:-}" ]]; then
        note "setting HOSAKA_PAIRING_HMAC_SECRET"
        flyctl secrets set --app "$APP_NAME" HOSAKA_PAIRING_HMAC_SECRET="$HOSAKA_PAIRING_HMAC_SECRET"
    fi

    if [[ -n "${AUTH_SECRET:-}" ]]; then
        note "setting AUTH_SECRET"
        flyctl secrets set --app "$APP_NAME" AUTH_SECRET="$AUTH_SECRET"
    fi

    note "deploying"
    flyctl deploy --app "$APP_NAME" --config "$FLY_TOML"

    note "done"
    note "health: https://$APP_NAME.fly.dev/healthz"
    note "ws: wss://$APP_NAME.fly.dev/ws/agent"
}

main "$@"