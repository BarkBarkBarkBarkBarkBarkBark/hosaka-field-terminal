# LLM — Gemini

Hosaka's hosted terminal can talk to Google's Gemini in two shapes:

| Mode   | Key lives where                        | Who pays quota | Works on GH Pages? | Works on Vercel? |
|--------|----------------------------------------|----------------|--------------------|-------------------|
| BYOK   | user's browser `localStorage`          | the user       | ✅                 | ✅                |
| Proxy  | Vercel env var → Edge Function         | you (the host) | ❌ (no functions)  | ✅                |

The terminal's `/settings` drawer lets users pick `auto` (BYOK if set, else
proxy), `byok`, or `proxy`.

## Getting an API key

1. Visit **[aistudio.google.com/apikey](https://aistudio.google.com/apikey)**.
2. Sign in with your Google account.
3. Click **Create API key** → "Create in new project" is fine.
4. Keys start with `AIza…`. Treat them like passwords.

Free-tier rates, roughly (check AI Studio for the current numbers):

| Model                    | Notes                                     |
|--------------------------|-------------------------------------------|
| `gemini-2.5-flash-lite`  | default; most generous free tier          |
| `gemini-2.5-flash`       | smarter; tighter RPM + daily cap          |
| `gemini-2.0-flash`       | fine fallback                             |
| `gemini-2.0-flash-lite`  | smallest/fastest                          |

## Configuring the proxy on Vercel

The proxy is just
[`api/gemini.ts`](../api/gemini.ts) — a Vercel **Edge Function**. No build
step, no extra deps.

1. In Vercel → **Settings → Environment Variables**, add:

   | Name | Value |
   |------|-------|
   | `GEMINI_API_KEY` | your key from AI Studio |
   | `GEMINI_ALLOWED_ORIGIN` *(optional)* | `https://your-domain.com` (comma-separated for multiple) |

2. Redeploy (Vercel does this automatically on next push, or hit
   "Redeploy" in the dashboard).
3. Open the site → `/ask how are you`. If the browser has no BYOK key
   set, the call goes to `/api/gemini`.

### CORS

The function allows requests from `*.vercel.app`, `localhost`, `127.0.0.1`,
and `*.github.io` out of the box. Add your custom domain via
`GEMINI_ALLOWED_ORIGIN`. A permissive `*` fallback is used when the origin
doesn't match — tighten this in [`api/gemini.ts`](../api/gemini.ts) if you
want to lock it down.

### What the proxy does

- Accepts `POST /api/gemini` with
  `{ prompt, model?, history?, system?, temperature? }`.
- Calls
  `https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent`
  server-side.
- Returns `{ model, text }` or an error.
- Caps prompt length at 8000 chars, history at 8 turns, output at 1024
  tokens.  Tune in the function if you need more.

### What the proxy does **not** do

- No streaming yet (easy to add — change the handler to return a
  `ReadableStream` and switch the client to use `EventSource`-style
  parsing).
- No auth, no rate-limiting per IP, no logging. If you ever expose the
  proxy at scale, add all three.

## BYOK flow (no backend needed)

1. Open `/settings` or hit the gear in the top bar.
2. Paste your Gemini key.
3. Pick a model. That's it. Try `/ask` or just type anything.

## Terminal commands

| Command        | Effect                                    |
|----------------|-------------------------------------------|
| `/ask <x>`     | one-shot, keeps conversation context      |
| `/chat <x>`    | alias for `/ask`                          |
| *(anything else not starting with `/` or `!`)* | goes straight to the LLM |
| `/model`       | show current model + available list       |
| `/model <name>`| set the model                             |
| `/reset`       | drop conversation history                 |
| `/settings`    | open the settings drawer                  |

## Don't commit keys

- `.env` is gitignored; `.env.example` would be fine but the repo ships
  without one. Your server key lives on Vercel, not in the repo.
- The BYOK key lives only in the user's `localStorage`.
- Never ship a key in a `VITE_*` env var — Vite bakes those into the
  JS bundle and they become public.
