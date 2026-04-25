# Login gate + identity-first node discovery

This document designs the next hosted step for `terminal.hosaka.xyz`:

- anonymous visitors may still use the public site
- authenticated users may see **their own** Hosaka nodes
- authentication is delegated to an external identity provider
- Hosaka stores **authorization state**, not passwords
- local Docker Hosaka can be detected and opened safely through the local bridge

This is a design target, not a claim that every piece is already shipped.

---

## Product rule

Keep `terminal.hosaka.xyz` open for anonymous visitors, but gate **node
discovery and ownership-aware features** behind login.

That means:

### Anonymous mode

Allowed:

- homepage
- docs
- demo terminal / theatrical shell
- pricing / subscription pages
- login button
- local bridge probe that reveals only `app_present` / `ready`

Not allowed:

- node inventory
- tailnet metadata
- beacon registry
- inbox / notifications
- remote actions
- sync history

### Authenticated mode

Allowed after login:

- `My Nodes`
- owned node presence / beacon status
- inbox / notifications
- local handoff to Docker Hosaka
- future managed-sync controls

Still not allowed directly from the public browser:

- arbitrary localhost proxying
- raw SSH launch
- arbitrary LAN scanning
- local shell execution without the local Hosaka approval path

---

## Authentication model

Use **OIDC** with external providers:

- Google
- GitHub
- Microsoft

Recommended implementation on the hosted site:

- `Auth.js` on Vercel / Next middleware or API routes

This keeps the model aligned with Tailscale's approach:

- identity comes from a provider
- Hosaka never stores user passwords
- Hosaka only stores the minimum metadata needed to decide ownership and access

### What Hosaka stores

Store only:

- `issuer` — e.g. `https://accounts.google.com`
- `subject` — the provider `sub`
- `email` and `display_name` if you want UX polish
- node ownership bindings
- pairing grants
- session ids / signed cookies / short-lived tokens

Do **not** store:

- passwords
- refresh tokens unless you explicitly need them
- broad provider scopes you do not use

---

## Recommended hosted flow

```text
anonymous visitor
      │
      ▼
terminal.hosaka.xyz
      │
      ├── browse public site anonymously
      └── click login
             │
             ▼
      external IdP (Google/GitHub/Microsoft)
             │
             ▼
      hosted session cookie
             │
             ▼
      My Nodes page
             │
             ├── query Fly broker for owned nodes
             ├── optionally probe local bridge on 127.0.0.1
             └── hand off to local Hosaka if present
```

Core rule: **login enables identity; pairing enables ownership**.

Logging in alone must not reveal every node on the broker.

---

## Pairing and ownership model

Each node needs a stable local `node_id` plus a device-side secret or signing
key.

Recommended model:

1. local Hosaka generates `node_id`
2. user logs into `terminal.hosaka.xyz`
3. user opens the local Hosaka UI and requests pairing
4. local Hosaka displays a short pairing code or QR
5. hosted site submits that pairing challenge to the Fly broker
6. broker binds:
   - `node_id`
   - `issuer`
   - `subject`
7. future beacons from that node are shown only to that identity

This is the minimum durable state you need. It is not a password database.

### Minimal tables / records

You do not need Supabase. A tiny durable store is enough.

Recommended records:

- `users`
  - `issuer`
  - `subject`
  - `email`
  - `display_name`
- `nodes`
  - `node_id`
  - `owner_issuer`
  - `owner_subject`
  - `display_name`
  - `created_at`
  - `last_seen`
- `pairing_tokens`
  - `token_id`
  - `node_id`
  - `expires_at`
  - `used_at`
- `beacon_presence`
  - `node_id`
  - `last_seen`
  - `status`
  - `capabilities`

SQLite on a Fly volume is enough for v1.

---

## Node discovery policy

The public website should never show a raw tailnet view.

Instead:

- each node publishes a beacon to the broker
- each beacon is tied to a paired `node_id`
- the broker filters nodes by logged-in owner
- the browser sees only its own nodes

That means the hosted site is not a public Tailscale inspector. It is a
filtered ownership view.

### What the browser can see for an owned node

Reasonable fields:

- `node_id`
- user-friendly label
- last seen
- online / offline
- `tailscale_connected`
- capability flags
- available handoff actions

Avoid exposing raw data unless necessary:

- exact tailnet IP
- full peer list
- host filesystem details
- raw service banners

---

## Local Docker handoff

After login, the hosted site may offer:

- `Open local Hosaka`
- `Switch to this machine`

But the hosted site should not directly control local Docker.

Use the bridge described in the Hosaka repo's
[local bridge guide](../../hosaka_console/Hosaka/docs/local_bridge_gateway.md):

- `GET /bridge/status`
- `POST /bridge/pair`
- `POST /bridge/open-local`

### Safe bridge contract

`GET /bridge/status` should reveal only:

- `app_present`
- `ready`
- `version`
- `node_id`
- `ui_url`

It should **not** reveal:

- peer inventory
- shell access
- arbitrary fetch
- filesystem data

### Browser behavior

1. user logs in on `terminal.hosaka.xyz`
2. browser checks `http://127.0.0.1:8422/bridge/status`
3. if ready, show `Open local Hosaka`
4. click opens local UI or starts pairing flow

This gives the user a smooth switch to the local Docker Hosaka while keeping
the local runtime as the real control plane.

---

## Auto-sync Fly backend

The Fly backend should act as a **broker**, not as the owner of user identity.

Recommended roles:

### 1. Identity verifier

The hosted web layer verifies the user session via OIDC.

The Fly backend trusts either:

- signed session/JWT assertions from the hosted site, or
- an internal token minted by the hosted site for broker calls

The Fly backend should not run its own password system.

### 2. Pairing broker

Responsibilities:

- accept short-lived pairing requests
- bind `node_id` to `issuer + subject`
- enforce one-time pairing token use

### 3. Presence broker

Responsibilities:

- receive beacon heartbeats from nodes
- keep short-lived presence state
- answer `My Nodes` queries for the authenticated owner

### 4. Sync relay

Responsibilities:

- relay inbox or sync events between paired nodes and the hosted UI
- store minimal queued events if a node is briefly offline
- apply TTLs and size limits

### 5. Optional managed worker broker

Later, the same Fly control plane can spin up shared or dedicated workers.
Do not start there.

---

## What you need to do for the Fly auto-sync backend

Start small. One shared broker is enough for the next step.

### A. Provision one Fly app

You need:

- one Fly app for the broker / sync API
- one small persistent volume if you use SQLite
- TLS via Fly default certs or custom domain later

### B. Decide session trust shape

Pick one:

1. Vercel session cookie + broker-side token minting
2. signed JWT from hosted site to Fly broker

Recommended: signed JWT with short TTL.

Claims should include:

- `iss`
- `sub`
- `aud=hosaka-broker`
- `exp`
- optional `email`

### C. Add durable storage

Store only:

- user identity metadata
- node ownership bindings
- pairing grants
- last-seen presence
- minimal event queue

Recommended v1:

- SQLite on Fly volume

Good later:

- Postgres if you outgrow it

### D. Define broker endpoints

Minimum HTTP endpoints:

- `POST /v1/pair/start`
- `POST /v1/pair/complete`
- `GET /v1/nodes`
- `GET /v1/nodes/{node_id}`
- `POST /v1/nodes/{node_id}/handoff-token`

Minimum node endpoints / channels:

- `POST /v1/beacon`
- `WS /v1/sync`

### E. Add broker secrets

Hosted web secrets:

- `AUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GITHUB_ID`
- `GITHUB_SECRET`
- `MICROSOFT_ENTRA_ID_CLIENT_ID`
- `MICROSOFT_ENTRA_ID_CLIENT_SECRET`
- `HOSAKA_BROKER_SIGNING_KEY`

Fly broker secrets:

- `HOSAKA_ALLOWED_ORIGINS=https://terminal.hosaka.xyz`
- `HOSAKA_BROKER_SIGNING_KEY`
- `HOSAKA_NODE_ENROLL_SECRET`
- `HOSAKA_PAIRING_HMAC_SECRET`
- `DATABASE_URL` or SQLite path
- provider key if the broker also fronts managed agent features:
  - `GEMINI_API_KEY`, or
  - `OPENAI_API_KEY`

Optional later:

- `FLY_API_TOKEN` for provisioning dedicated workers

### F. Add node enrollment

Each node needs a way to join the broker safely.

Recommended v1:

- operator enters a one-time enrollment token in local Hosaka
- local Hosaka stores a device credential under its state dir
- future beacons are signed with that credential

### G. Set rate limits and TTLs

Required v1 guardrails:

- pairing token TTL: 5–10 minutes
- beacon TTL: 60–180 seconds
- queue/event TTL: short, e.g. 15 minutes to 24 hours depending on class
- request body size limits
- per-user and per-node rate limits

### H. Log minimally

Keep logs free of:

- bearer tokens
- cookies
- pairing codes
- raw provider tokens

Log only:

- `node_id`
- user `issuer + subject`
- action type
- outcome

---

## Security boundaries

### Keep anonymous use open

Yes:

- anonymous landing page
- anonymous demo terminal
- anonymous docs

### Gate these behind login

- node list
- node presence
- ownership-bound inbox
- any brokered sync UI

### Gate these behind login + pairing + local approval

- switching into privileged local controls
- remote actions affecting a node
- anything that executes or mutates state

---

## Implementation order

Recommended sequence:

1. add OIDC login button on the hosted site
2. add `My Nodes` empty state behind login
3. add Fly broker with `users`, `nodes`, `pairing_tokens`, `presence`
4. add node pairing from local Hosaka
5. add beacon sync to broker
6. add local bridge handoff button
7. add inbox/sync relay in the hosted UI

This keeps anonymous use intact while moving all sensitive discovery into a
clean identity and ownership model.

---

## Final recommendation

The right split is:

- **anonymous public site** for discovery and demo
- **OIDC login** for identity
- **pairing** for node ownership
- **local Hosaka** as the source of truth for privileged control
- **Fly broker** as presence / sync relay, not as a password authority

That gives you the Tailscale-like feel you want without introducing a full
password database or exposing node metadata publicly.