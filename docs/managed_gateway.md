# Managed gateway / subscription rollout

This document covers the **hosted/public** side of the next Hosaka phase:

- terminal.hosaka.xyz as a gateway to local Hosaka clients
- a managed Fly control plane
- future subscription tiers for shared vs dedicated hosted terminals

For the identity-first login gate and owned-node discovery model, see
[`login_gate.md`](./login_gate.md).

This file lives in the **field-terminal repo** because public-web controls and
hosted deployment policy belong here.

For the raw runtime, local bridge, and Docker checks, see the Hosaka repo's
[`local_bridge_gateway.md`](../../hosaka_console/Hosaka/docs/local_bridge_gateway.md).

---

## What this repo is responsible for

The field-terminal repo should own only:

- hosted discovery UI
- public-mode safety defaults
- Vercel config
- Fly control plane / broker config
- subscription-gated managed features

It should **not** own:

- local shell execution
- local file access
- Tailscale CLI control on the user's machine
- SSH from the browser

Those belong in the Hosaka runtime.

---

## Required hosted secrets

## Vercel

Required today:

- `GEMINI_API_KEY` if `/api/gemini` is enabled

Optional depending on the provider path you choose later:

- provider-specific billing / API key secrets

## Fly

Required today for the managed agent path:

- `HOSAKA_ACCESS_TOKEN`
- `HOSAKA_ALLOWED_ORIGINS`
- one provider key:
  - `GEMINI_API_KEY`, or
  - `OPENAI_API_KEY`

Optional now, likely needed later:

- billing provider secret(s)
- webhook secret(s) for subscription lifecycle
- per-user worker bootstrap secret if you later provision a dedicated machine

## Operator workstation

You will also need locally:

- `FLY_API_TOKEN`
- `VERCEL_TOKEN` if you automate deployment from CI or scripts

---

## Hosted safety defaults

The public site must fail closed.

Current hosted health policy in [api/health.ts](../api/health.ts) keeps these
off:

- `settings_enabled`
- `web_panel_enabled`
- `nodes_enabled`
- `nodes_ui_enabled`
- `tailscale_api_enabled`
- `sync_enabled`
- `inbox_enabled`

When you add bridge discovery later, keep the same policy:

- discovery can be on
- privileged local actions stay off until local pairing succeeds

---

## Human rollout steps

## 1. Vercel deploy

```bash
vercel link
vercel env add GEMINI_API_KEY
vercel --prod
```

Then confirm:

- `https://terminal.hosaka.xyz/api/health` returns the hosted fail-closed flags
- public tabs do **not** expose nodes/sync/inbox/settings

## 2. Fly deploy

```bash
fly launch --no-deploy --copy-config
fly secrets set \
  HOSAKA_ACCESS_TOKEN='long passphrase' \
  HOSAKA_ALLOWED_ORIGINS='https://terminal.hosaka.xyz' \
  GEMINI_API_KEY='AIza...'
fly deploy
```

Then confirm:

- websocket accepts requests only from allowed origins
- wrong passphrase fails closed
- correct passphrase reaches the agent backend

## 3. Keep the public site as a handoff layer

The site may:

- detect a paired local bridge
- show “open local Hosaka”
- show “connect to managed terminal”

The site may not:

- execute local shell commands directly
- expose SSH directly from browser JS
- scan arbitrary LAN targets

---

## Subscription feasibility notes

Recommended rollout:

### Tier 1 — BYO key

- cheapest to run
- hosted UI
- shared broker
- user supplies provider key

### Tier 2 — managed shared compute

- hosted UI
- shared Fly broker / worker pool
- quotas and rate limits

### Tier 3 — dedicated managed terminal

- one Fly worker per paying customer
- persistent storage
- stronger isolation

Do not start with Tier 3 for everyone.

---

## Worst-case outcomes to keep in mind

### Public site becomes a localhost pivot

Defense:

- no generic localhost proxy
- local bridge must be loopback-only
- strict origin allowlist

### Public site becomes an SSH launcher

Defense:

- SSH only through local Hosaka backend after pairing + approval

### Costs spiral

Defense:

- shared broker first
- quotas
- rate limits
- idle shutdown

---

## Hosted operator checklist

- [ ] Vercel deploy is live
- [ ] `api/health.ts` still fails closed for local-only features
- [ ] Fly origin allowlist is exact, not wildcarded
- [ ] Fly passphrase is rotated and not reused casually
- [ ] one provider key is present on the managed backend
- [ ] spend caps are set on the provider account
- [ ] you know which plan gets shared vs dedicated compute