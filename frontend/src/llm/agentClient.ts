// Websocket client for the hosaka agent-server (picoclaw backend).
//
// Contract is tiny and deliberately boring:
//   client → { message: "..." }
//   server → { type: "hello"   | "thinking" | "reply" | "error", ... }
//
// We keep exactly one connection + one in-flight request at a time.
// If the server TTL reaps us, the next send reopens the socket.

export type AgentConfig = {
  url: string;       // e.g. wss://hosaka-agent.fly.dev/ws/agent
  passphrase: string;
  enabled: boolean;
};

const STORAGE_KEY = "hosaka.agent.v1";

// Baked-in default so users don't have to paste the URL.  Override at build
// time with `VITE_HOSAKA_AGENT_URL=wss://... npm run build` or at runtime in
// the settings drawer.
export const DEFAULT_AGENT_URL: string =
  (import.meta.env.VITE_HOSAKA_AGENT_URL as string | undefined) ??
  "wss://hosaka-field-terminal-alpha.fly.dev/ws/agent";

// The "magic word" a visitor can type in the terminal to auto-configure the
// agent with the default URL + shared passphrase.  Matches server-side
// HOSAKA_ACCESS_TOKEN.  Override at build with VITE_HOSAKA_MAGIC_WORD.
export const MAGIC_WORD: string =
  (import.meta.env.VITE_HOSAKA_MAGIC_WORD as string | undefined) ?? "neuro";

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  url: "",
  passphrase: "",
  enabled: false,
};

export function loadAgentConfig(): AgentConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AGENT_CONFIG };
    return { ...DEFAULT_AGENT_CONFIG, ...(JSON.parse(raw) as AgentConfig) };
  } catch {
    return { ...DEFAULT_AGENT_CONFIG };
  }
}

export function saveAgentConfig(cfg: AgentConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

export type AgentHello = {
  type: "hello";
  sid: string;
  picoclaw: boolean;
  model: string | null;
  ttl_seconds: number;
};

export type AgentEvent =
  | AgentHello
  | { type: "thinking" }
  | { type: "ping" }
  | { type: "reply"; text?: string; stdout: string; stderr: string }
  | { type: "error"; error: string };

export type AgentResult =
  | { ok: true; text: string; stderr: string; sid: string; model: string | null }
  | { ok: false; error: string };

function buildWsUrl(cfg: AgentConfig): string {
  // Pass the token in the query string as a fallback for browsers that
  // refuse custom headers on websocket upgrades. The server accepts both.
  const u = new URL(cfg.url);
  u.searchParams.set("token", cfg.passphrase);
  return u.toString();
}

function looksLikeWsUrl(url: string): boolean {
  return /^wss?:\/\//i.test(url);
}

export class AgentClient {
  private ws: WebSocket | null = null;
  private hello: AgentHello | null = null;
  private inflight: {
    resolve: (r: AgentResult) => void;
    timer: number;
  } | null = null;

  constructor(private cfg: AgentConfig) {}

  updateConfig(cfg: AgentConfig): void {
    this.cfg = cfg;
    this.close();
  }

  private async ensureOpen(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    if (!looksLikeWsUrl(this.cfg.url)) {
      throw new Error("agent url must start with ws:// or wss://");
    }
    if (!this.cfg.passphrase) {
      throw new Error("agent passphrase is empty — open /settings");
    }

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(buildWsUrl(this.cfg));
      this.ws = ws;
      let settled = false;

      const cleanup = () => {
        ws.removeEventListener("open", onOpen);
        ws.removeEventListener("error", onError);
      };

      const onOpen = () => {
        // Wait for the "hello" frame before considering the channel ready.
      };
      const onError = () => {
        if (!settled) {
          settled = true;
          cleanup();
          reject(new Error("websocket error (url/passphrase/cors?)"));
        }
      };

      ws.addEventListener("open", onOpen);
      ws.addEventListener("error", onError);

      ws.addEventListener("message", (evt) => {
        let data: AgentEvent | null = null;
        try {
          data = JSON.parse(evt.data) as AgentEvent;
        } catch {
          return;
        }
        if (!data) return;

        if (data.type === "hello") {
          this.hello = data;
          if (!settled) {
            settled = true;
            cleanup();
            resolve();
          }
          return;
        }

        if (data.type === "reply") {
          if (this.inflight) {
            window.clearTimeout(this.inflight.timer);
            const txt =
              (data.text && data.text.trim()) ||
              data.stdout.trim() ||
              data.stderr.trim() ||
              "[agent returned nothing]";
            this.inflight.resolve({
              ok: true,
              text: txt,
              stderr: data.stderr,
              sid: this.hello?.sid ?? "?",
              model: this.hello?.model ?? null,
            });
            this.inflight = null;
          }
          return;
        }

        if (data.type === "error") {
          if (this.inflight) {
            window.clearTimeout(this.inflight.timer);
            this.inflight.resolve({ ok: false, error: data.error });
            this.inflight = null;
          }
          return;
        }

        // ping / thinking → no-op (server is just keeping the channel warm)
      });

      ws.addEventListener("close", () => {
        if (!settled) {
          settled = true;
          cleanup();
          reject(new Error("websocket closed before hello"));
        }
        if (this.inflight) {
          window.clearTimeout(this.inflight.timer);
          this.inflight.resolve({ ok: false, error: "connection dropped" });
          this.inflight = null;
        }
        this.hello = null;
        this.ws = null;
      });
    });
  }

  async send(message: string): Promise<AgentResult> {
    if (this.inflight) {
      return { ok: false, error: "still waiting on the last reply." };
    }

    try {
      await this.ensureOpen();
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return { ok: false, error: "socket not open" };
    }

    return new Promise<AgentResult>((resolve) => {
      const timer = window.setTimeout(() => {
        if (this.inflight) {
          this.inflight = null;
          resolve({ ok: false, error: "timeout waiting for reply (120s)" });
        }
      }, 120_000);

      this.inflight = { resolve, timer };
      ws.send(JSON.stringify({ message }));
    });
  }

  close(): void {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
    }
    this.ws = null;
    this.hello = null;
    if (this.inflight) {
      window.clearTimeout(this.inflight.timer);
      this.inflight.resolve({ ok: false, error: "connection closed" });
      this.inflight = null;
    }
  }
}

let _singleton: AgentClient | null = null;
export function getAgent(cfg: AgentConfig = loadAgentConfig()): AgentClient {
  if (!_singleton) {
    _singleton = new AgentClient(cfg);
  } else {
    _singleton.updateConfig(cfg);
  }
  return _singleton;
}
