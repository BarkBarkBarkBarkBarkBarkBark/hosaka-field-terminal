import { useEffect, useRef, useState } from "react";

type Msg = {
  id: string;
  at: number;
  from: "operator" | "orb" | "system";
  text: string;
  status?: "sent" | "failed" | "pending";
};

type Config = {
  webhook: string;
  // Discord / Slack both accept { content: string } via incoming webhooks,
  // so we treat it as a "generic JSON POST" for any compatible endpoint.
  kind: "discord" | "slack" | "generic";
  username: string;
};

const STORAGE_KEY = "hosaka.messages.v1";
const CONFIG_KEY = "hosaka.messages.config.v1";

function loadMessages(): Msg[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Msg[];
  } catch {
    return [];
  }
}

function loadConfig(): Config {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) throw new Error("empty");
    return JSON.parse(raw) as Config;
  } catch {
    return { webhook: "", kind: "generic", username: "operator" };
  }
}

function buildPayload(cfg: Config, text: string): unknown {
  switch (cfg.kind) {
    case "discord":
      return { content: text, username: cfg.username || "hosaka-operator" };
    case "slack":
      return { text, username: cfg.username || "hosaka-operator" };
    case "generic":
    default:
      return {
        text,
        username: cfg.username || "hosaka-operator",
        at: new Date().toISOString(),
        source: "hosaka-web-desktop",
      };
  }
}

function id(): string {
  return Math.random().toString(36).slice(2, 10);
}

const ORB_REPLIES = [
  "received. the signal is steady.",
  "the orb acknowledges your transmission.",
  "noted. filed under 'maybe important'.",
  "your words persist in the margins.",
  "mmm. go on.",
  "i hear you. the network is patient.",
  "compressed. archived. held.",
];

export function MessagesPanel() {
  const [messages, setMessages] = useState<Msg[]>(loadMessages);
  const [config, setConfig] = useState<Config>(loadConfig);
  const [draft, setDraft] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-200)));
  }, [messages]);

  useEffect(() => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages]);

  const push = (m: Msg) => setMessages((prev) => [...prev, m]);

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    const mine: Msg = {
      id: id(),
      at: Date.now(),
      from: "operator",
      text,
      status: config.webhook ? "pending" : "sent",
    };
    push(mine);
    setDraft("");

    if (!config.webhook) {
      // Offline mode: reply with a cheeky orb.
      setTimeout(() => {
        push({
          id: id(),
          at: Date.now(),
          from: "orb",
          text:
            ORB_REPLIES[Math.floor(Math.random() * ORB_REPLIES.length)] ?? "...",
        });
      }, 600 + Math.random() * 800);
      setMessages((prev) =>
        prev.map((m) => (m.id === mine.id ? { ...m, status: "sent" } : m)),
      );
      return;
    }

    try {
      const res = await fetch(config.webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(config, text)),
      });
      const ok = res.ok;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === mine.id ? { ...m, status: ok ? "sent" : "failed" } : m,
        ),
      );
      if (!ok) {
        push({
          id: id(),
          at: Date.now(),
          from: "system",
          text: `webhook said no: ${res.status} ${res.statusText}`,
        });
      }
    } catch (err: unknown) {
      setMessages((prev) =>
        prev.map((m) => (m.id === mine.id ? { ...m, status: "failed" } : m)),
      );
      push({
        id: id(),
        at: Date.now(),
        from: "system",
        text: `network refused the transmission: ${(err as Error).message}`,
      });
    }
  };

  const clearLog = () => setMessages([]);

  return (
    <div className="messages-wrap">
      <div className="panel-header">
        <h2>
          <span className="panel-glyph">✉</span> Messages
        </h2>
        <p className="panel-sub">
          talk to the orb (offline) or to any JSON webhook you configure:
          discord, slack, or your own endpoint. no backend required.
        </p>
      </div>

      <div className="messages-toolbar">
        <span className="dim">
          mode: <strong>{config.webhook ? config.kind : "offline"}</strong>
          {config.webhook ? (
            <> → {new URL(config.webhook).host}</>
          ) : (
            <> (orb only)</>
          )}
        </span>
        <div className="spacer" />
        <button className="btn btn-ghost" onClick={() => setShowSettings((s) => !s)}>
          {showSettings ? "close settings" : "settings"}
        </button>
        <button className="btn btn-ghost" onClick={clearLog}>
          clear
        </button>
      </div>

      {showSettings && (
        <div className="messages-settings">
          <label>
            <span>webhook url</span>
            <input
              type="url"
              placeholder="https://discord.com/api/webhooks/... or https://hooks.slack.com/..."
              value={config.webhook}
              onChange={(e) =>
                setConfig({ ...config, webhook: e.target.value.trim() })
              }
            />
          </label>
          <label>
            <span>kind</span>
            <select
              value={config.kind}
              onChange={(e) =>
                setConfig({ ...config, kind: e.target.value as Config["kind"] })
              }
            >
              <option value="generic">generic (json)</option>
              <option value="discord">discord</option>
              <option value="slack">slack</option>
            </select>
          </label>
          <label>
            <span>display name</span>
            <input
              type="text"
              value={config.username}
              onChange={(e) => setConfig({ ...config, username: e.target.value })}
            />
          </label>
          <p className="dim small">
            stored locally in <code>localStorage</code>. nothing leaves this
            browser except the message you send.
          </p>
        </div>
      )}

      <div className="messages-log" ref={logRef}>
        {messages.length === 0 && (
          <div className="messages-empty dim">
            nothing yet. say hi to the orb.
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`msg msg-${m.from}`}>
            <div className="msg-meta">
              <span className="msg-from">{m.from}</span>
              <span className="msg-time">
                {new Date(m.at).toLocaleTimeString()}
              </span>
              {m.status && m.status !== "sent" && (
                <span className={`msg-status msg-status-${m.status}`}>
                  {m.status}
                </span>
              )}
            </div>
            <div className="msg-body">{m.text}</div>
          </div>
        ))}
      </div>

      <form
        className="messages-compose"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          rows={2}
          placeholder="transmit something..."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button className="btn btn-primary" type="submit" disabled={!draft.trim()}>
          send
        </button>
      </form>
    </div>
  );
}
