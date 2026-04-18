# Deployment

Three ways to get Hosaka on the internet. All three are free-tier
friendly. Pick your favourite flavour of quiet hosting.

## 1. GitHub Pages (zero-config)

A workflow is included at
[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml).

Steps:

1. Push this repo to GitHub.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Push to `main`. The workflow builds `frontend/` and publishes
   `frontend/dist/` to Pages.

The workflow sets `HOSAKA_BASE` automatically based on repo name so
project pages work at `https://<user>.github.io/<repo>/`. No manual
`vite.config` edit needed.

### Custom domain

1. Copy [`frontend/public/CNAME.example`](../frontend/public/CNAME.example)
   to `frontend/public/CNAME` and put your hostname in it
   (e.g. `hosaka.example.com`).
2. In DNS, point your domain at GitHub Pages
   ([apex guide](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)).
3. In **Settings → Pages**, enter the same domain and enable **Enforce
   HTTPS** once the certificate shows green.

When a custom domain is active, GitHub serves at the root, so
`HOSAKA_BASE=/` is automatic (the workflow detects the `CNAME` file).

## 2. Vercel

`vercel.json` lives at the repo root. It tells Vercel to:

- install inside `frontend/`
- run `npm run build`
- serve `frontend/dist/`

Steps:

1. Visit `vercel.com/new` and import this repo.
2. Leave defaults. Deploy.
3. Add your custom domain under **Project → Settings → Domains**.

## 3. Cloudflare Pages

In the Cloudflare dashboard:

- **Framework preset**: none (pick "Vite" if you like, same result).
- **Build command**: `cd frontend && npm ci && npm run build`
- **Build output directory**: `frontend/dist`
- **Root directory**: `/`
- **Environment variable** (optional, only if serving at a subpath):
  `HOSAKA_BASE=/your-subpath/`

Custom domain via **Pages → Custom domains**. Cloudflare handles TLS.

## 4. Local preview

```bash
cd frontend
npm run build
npm run preview    # http://localhost:4173
```

## Troubleshooting

- **Blank page on GH Pages under `/<repo>/`**: the workflow sets
  `HOSAKA_BASE` for you. If you deploy manually, remember to set it
  yourself (e.g. `HOSAKA_BASE=/hosaka/ npm run build`).
- **Custom domain shows "Improperly configured"**: DNS is still
  propagating. Refresh in ~15 minutes. Or check your `CNAME` record.
- **Webhook POST fails with CORS error**: some Slack workspaces block
  browser-origin posts. Use a Discord webhook, or self-host a small
  relay. (We intentionally don't ship one.)
- **Video URL won't play**: the host probably sends `X-Frame-Options`
  or doesn't support range requests. Use a direct-MP4 source or a
  local file.

_Signal steady. 📡_
