// Gemini client — two modes:
//   1. BYOK: user supplied key in localStorage, browser calls Google directly.
//   2. Proxy: call our /api/gemini Vercel function which uses the server key.
//
// The client auto-picks BYOK when present (keeps shared quota safe),
// otherwise tries the proxy.  If both fail it returns a typed error the
// terminal can render in-character.
//
// Function-calling / tools:
//   When `toolsEnabled` is true (from localStorage settings) the client runs
//   a bounded multi-turn loop.  Tool calls are resolved locally via the
//   `runTool` implementations in ./tools.ts (pure, sandboxed, no network).

import { GEMINI_TOOL_DECLARATIONS, runTool } from "./tools";

export const GEMINI_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
] as const;

export type GeminiModel = (typeof GEMINI_MODELS)[number];

export type LlmConfig = {
  apiKey: string;
  model: GeminiModel;
  mode: "auto" | "byok" | "proxy";
  toolsEnabled: boolean;
};

export type LlmMessage = {
  role: "user" | "assistant";
  text: string;
};

export type ToolTrace = {
  name: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
};

export type LlmResult =
  | {
      ok: true;
      text: string;
      model: string;
      via: "byok" | "proxy";
      toolTrace?: ToolTrace[];
    }
  | { ok: false; error: string; status?: number; via?: "byok" | "proxy" };

const STORAGE_KEY = "hosaka.llm.v1";

export const DEFAULT_CONFIG: LlmConfig = {
  apiKey: "",
  model: "gemini-2.5-flash-lite",
  mode: "auto",
  toolsEnabled: true,
};

export function loadConfig(): LlmConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(raw) as Partial<LlmConfig>;
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      model: (GEMINI_MODELS as readonly string[]).includes(parsed.model ?? "")
        ? (parsed.model as GeminiModel)
        : DEFAULT_CONFIG.model,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(cfg: LlmConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

const SYSTEM_PROMPT = `You are the voice of HOSAKA, a cyberdeck field terminal that survived the cascade.
Tone: quirky, terse, lowercase, dry, not shouty. Sparse ASCII art is welcome.
Mantras you occasionally allude to: "signal steady", "no wrong way", "the orb sees you".
Keep replies under ~200 words unless explicitly asked for more.
When tools are available, use them for time, math, memory, and lore instead of inventing values.`;

const MAX_TOOL_ITERATIONS = 4;

// ── Gemini wire types ─────────────────────────────────────────────────────
type Part =
  | { text: string }
  | { functionCall: { name: string; args?: Record<string, unknown> } }
  | {
      functionResponse: {
        name: string;
        response: Record<string, unknown>;
      };
    };

type Content = { role: "user" | "model"; parts: Part[] };

type GeminiResponse = {
  candidates?: {
    content?: { role?: string; parts?: Part[] };
    finishReason?: string;
  }[];
  error?: { message?: string };
};

function historyToContents(history: LlmMessage[]): Content[] {
  return history.slice(-8).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.text.slice(0, 4000) }],
  }));
}

function extractText(parts: Part[] | undefined): string {
  if (!parts) return "";
  return parts
    .map((p) => ("text" in p ? p.text : ""))
    .filter(Boolean)
    .join("")
    .trim();
}

function extractToolCall(
  parts: Part[] | undefined,
): { name: string; args: Record<string, unknown> } | null {
  if (!parts) return null;
  for (const p of parts) {
    if ("functionCall" in p && p.functionCall?.name) {
      return {
        name: p.functionCall.name,
        args: p.functionCall.args ?? {},
      };
    }
  }
  return null;
}

// ── BYOK path ──────────────────────────────────────────────────────────────
async function callGeminiDirect(
  cfg: LlmConfig,
  contents: Content[],
): Promise<GeminiResponse | { __httpError: number; message: string }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
  const payload: Record<string, unknown> = {
    contents,
    systemInstruction: { role: "system", parts: [{ text: SYSTEM_PROMPT }] },
    generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
  };
  if (cfg.toolsEnabled) {
    payload.tools = [{ functionDeclarations: GEMINI_TOOL_DECLARATIONS }];
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as GeminiResponse;
  if (!res.ok) {
    return {
      __httpError: res.status,
      message: data.error?.message ?? `http ${res.status}`,
    };
  }
  return data;
}

async function askViaBYOK(
  cfg: LlmConfig,
  prompt: string,
  history: LlmMessage[],
): Promise<LlmResult> {
  const contents: Content[] = [
    ...historyToContents(history),
    { role: "user", parts: [{ text: prompt }] },
  ];
  const trace: ToolTrace[] = [];

  try {
    for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
      const data = await callGeminiDirect(cfg, contents);
      if ("__httpError" in data) {
        return {
          ok: false,
          via: "byok",
          status: data.__httpError,
          error: data.message,
        };
      }
      const parts = data.candidates?.[0]?.content?.parts;
      const call = extractToolCall(parts);
      if (call) {
        const result = runTool(call.name, call.args);
        trace.push({ name: call.name, args: call.args, result });
        contents.push({
          role: "model",
          parts: [{ functionCall: { name: call.name, args: call.args } }],
        });
        contents.push({
          role: "user",
          parts: [
            {
              functionResponse: {
                name: call.name,
                response: result,
              },
            },
          ],
        });
        continue;
      }
      const text = extractText(parts);
      return {
        ok: true,
        via: "byok",
        model: cfg.model,
        text,
        toolTrace: trace.length ? trace : undefined,
      };
    }
    return {
      ok: false,
      via: "byok",
      error: `tool loop exceeded ${MAX_TOOL_ITERATIONS} iterations`,
    };
  } catch (err) {
    return { ok: false, via: "byok", error: (err as Error).message };
  }
}

// ── Proxy path ─────────────────────────────────────────────────────────────
// The proxy does NOT do tool calling — keep the edge function small.
// When tools are required, we require BYOK.
async function askViaProxy(
  cfg: LlmConfig,
  prompt: string,
  history: LlmMessage[],
): Promise<LlmResult> {
  try {
    const res = await fetch("/api/gemini", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: cfg.model,
        prompt,
        history,
        system: SYSTEM_PROMPT,
      }),
    });
    const data = (await res.json()) as {
      text?: string;
      model?: string;
      error?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        via: "proxy",
        status: res.status,
        error: data.error ?? `http ${res.status}`,
      };
    }
    return {
      ok: true,
      via: "proxy",
      model: data.model ?? cfg.model,
      text: (data.text ?? "").trim(),
    };
  } catch (err) {
    return { ok: false, via: "proxy", error: (err as Error).message };
  }
}

export async function askGemini(
  prompt: string,
  history: LlmMessage[] = [],
  cfg: LlmConfig = loadConfig(),
): Promise<LlmResult> {
  const preferBYOK =
    cfg.mode === "byok" || (cfg.mode === "auto" && cfg.apiKey);
  if (preferBYOK && cfg.apiKey) {
    const r = await askViaBYOK(cfg, prompt, history);
    if (r.ok || cfg.mode === "byok") return r;
  }
  if (cfg.mode === "byok" && !cfg.apiKey) {
    return {
      ok: false,
      via: "byok",
      error: "byok mode active but no api key set. open settings.",
    };
  }
  return askViaProxy(cfg, prompt, history);
}
