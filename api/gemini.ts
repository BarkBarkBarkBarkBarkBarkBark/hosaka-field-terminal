// Vercel Serverless Function — proxy the browser's chat requests to Gemini so
// the user never sees the shared API key.
//
// Deploys automatically at /api/gemini when the file is committed at the repo
// root under /api/. Reads GEMINI_API_KEY from Vercel's environment variables
// (Settings → Environment Variables).  Falls back politely if not configured.

export const config = {
  // Edge runtime: low cold-start, global POPs, native fetch/Request/Response.
  // Perfect for a tiny JSON proxy. If you need Node APIs (fs, crypto.subtle
  // beyond the standard), switch to "nodejs20.x".
  runtime: "edge",
};

// Minimal ambient declaration so we don't have to drag @types/node into the
// repo root just for two env vars. Vercel's edge runtime exposes process.env.
declare const process: { env: Record<string, string | undefined> };

type GeminiPart = { text?: string };
type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

type InboundBody = {
  model?: string;
  prompt?: string;
  history?: { role: "user" | "assistant"; text: string }[];
  system?: string;
  temperature?: number;
};

const DEFAULT_MODEL = "gemini-3.1-flash-lite-preview";
const ALLOWED_MODELS = new Set([
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
]);

// Minimal allowlist — extend via env if you add custom frontends.
const ALLOWED_ORIGIN_RE = /^https?:\/\/([a-z0-9-]+\.)*(vercel\.app|localhost(:\d+)?|127\.0\.0\.1(:\d+)?|github\.io)$/i;

function corsHeaders(origin: string | undefined): Record<string, string> {
  const ok = origin && (ALLOWED_ORIGIN_RE.test(origin) || matchCustomOrigin(origin));
  return {
    "access-control-allow-origin": ok && origin ? origin : "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

function matchCustomOrigin(origin: string): boolean {
  const extra = process.env.GEMINI_ALLOWED_ORIGIN;
  if (!extra) return false;
  return extra
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean)
    .some((allowed: string) => origin === allowed);
}

function json(status: number, body: unknown, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

export default async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get("origin") ?? undefined;
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== "POST") {
    return json(405, { error: "method not allowed" }, cors);
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return json(
      503,
      {
        error:
          "proxy is not configured: GEMINI_API_KEY is missing on the server. Bring your own key or set the env var.",
      },
      cors,
    );
  }

  let body: InboundBody;
  try {
    body = (await req.json()) as InboundBody;
  } catch {
    return json(400, { error: "invalid json" }, cors);
  }

  const prompt = (body.prompt ?? "").toString().trim();
  if (!prompt) return json(400, { error: "prompt is required" }, cors);
  if (prompt.length > 8000) {
    return json(413, { error: "prompt too long (max 8000 chars)" }, cors);
  }

  const model = body.model && ALLOWED_MODELS.has(body.model) ? body.model : DEFAULT_MODEL;

  const history: GeminiContent[] = (body.history ?? [])
    .slice(-8)
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: (m.text ?? "").toString().slice(0, 4000) }],
    }));

  const payload = {
    contents: [...history, { role: "user", parts: [{ text: prompt }] }],
    ...(body.system
      ? {
          systemInstruction: {
            role: "system",
            parts: [{ text: body.system.toString().slice(0, 2000) }],
          },
        }
      : {}),
    generationConfig: {
      temperature: typeof body.temperature === "number" ? body.temperature : 0.7,
      maxOutputTokens: 1024,
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
    key,
  )}`;

  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = (await upstream.json()) as {
      candidates?: { content?: { parts?: GeminiPart[] } }[];
      error?: { message?: string };
    };

    if (!upstream.ok) {
      return json(
        upstream.status,
        { error: data?.error?.message ?? "upstream error" },
        cors,
      );
    }

    const text =
      data.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? "")
        .join("")
        .trim() ?? "";

    return json(200, { model, text }, cors);
  } catch (err) {
    return json(
      502,
      { error: `proxy failed: ${(err as Error).message}` },
      cors,
    );
  }
}
