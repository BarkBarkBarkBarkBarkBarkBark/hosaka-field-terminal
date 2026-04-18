import { useEffect, useState } from "react";
import {
  DEFAULT_CONFIG,
  GEMINI_MODELS,
  loadConfig,
  saveConfig,
  type GeminiModel,
  type LlmConfig,
} from "../llm/gemini";
import {
  DEFAULT_AGENT_CONFIG,
  loadAgentConfig,
  saveAgentConfig,
  type AgentConfig,
} from "../llm/agentClient";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function SettingsDrawer({ open, onClose }: Props) {
  const [cfg, setCfg] = useState<LlmConfig>(loadConfig);
  const [agentCfg, setAgentCfg] = useState<AgentConfig>(loadAgentConfig);
  const [revealed, setRevealed] = useState(false);
  const [agentPassRevealed, setAgentPassRevealed] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (open) {
      setCfg(loadConfig());
      setAgentCfg(loadAgentConfig());
    }
  }, [open]);

  const flash = () => {
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 800);
  };

  const commit = (next: LlmConfig) => {
    setCfg(next);
    saveConfig(next);
    flash();
  };

  const commitAgent = (next: AgentConfig) => {
    setAgentCfg(next);
    saveAgentConfig(next);
    flash();
  };

  if (!open) return null;

  return (
    <div className="drawer-scrim" onClick={onClose}>
      <aside
        className="drawer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="settings"
      >
        <header className="drawer-head">
          <h2>
            <span className="panel-glyph">⚙</span> Settings
          </h2>
          <button className="btn btn-ghost" onClick={onClose}>
            close
          </button>
        </header>

        <section className="drawer-section">
          <h3>LLM — Gemini</h3>
          <p className="dim small">
            the app can talk to google's gemini. choose byok (your own key,
            runs in this browser only) or proxy (uses whatever the server has
            configured). keys are stored in <code>localStorage</code> —
            nothing leaves this browser except your prompts.
          </p>

          <label className="drawer-field">
            <span>mode</span>
            <select
              value={cfg.mode}
              onChange={(e) =>
                commit({
                  ...cfg,
                  mode: e.target.value as LlmConfig["mode"],
                })
              }
            >
              <option value="auto">auto (byok if set, else proxy)</option>
              <option value="byok">byok — my key only</option>
              <option value="proxy">proxy — server key only</option>
            </select>
          </label>

          <label className="drawer-field">
            <span>model</span>
            <select
              value={cfg.model}
              onChange={(e) =>
                commit({ ...cfg, model: e.target.value as GeminiModel })
              }
            >
              {GEMINI_MODELS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>

          <label className="drawer-field">
            <span>
              your gemini api key{" "}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
              >
                (get one)
              </a>
            </span>
            <div className="drawer-key">
              <input
                type={revealed ? "text" : "password"}
                placeholder="AIza..."
                value={cfg.apiKey}
                onChange={(e) => commit({ ...cfg, apiKey: e.target.value.trim() })}
                spellCheck={false}
                autoComplete="off"
              />
              <button
                className="btn btn-ghost"
                onClick={() => setRevealed((r) => !r)}
                type="button"
              >
                {revealed ? "hide" : "show"}
              </button>
            </div>
          </label>

          <label className="drawer-field">
            <span>tool use (time, math, lore, memory — all browser-local)</span>
            <select
              value={cfg.toolsEnabled ? "on" : "off"}
              onChange={(e) =>
                commit({ ...cfg, toolsEnabled: e.target.value === "on" })
              }
            >
              <option value="on">on (let gemini call safe tools)</option>
              <option value="off">off (plain chat)</option>
            </select>
          </label>

          <div className="drawer-actions">
            <button
              className="btn btn-ghost"
              onClick={() => commit({ ...DEFAULT_CONFIG })}
            >
              reset
            </button>
            <span className={`drawer-flash ${savedFlash ? "on" : ""}`}>saved ✓</span>
          </div>
        </section>

        <section className="drawer-section">
          <h3>Agent backend — picoclaw (optional)</h3>
          <p className="dim small">
            route input to a fly.io-hosted picoclaw agent instead of gemini.
            gated by a shared passphrase. agent has real filesystem + shell;
            only enable if you trust the operator of the backend.
          </p>

          <label className="drawer-field">
            <span>websocket url</span>
            <input
              type="url"
              placeholder="wss://hosaka-agent.fly.dev/ws/agent"
              value={agentCfg.url}
              onChange={(e) => commitAgent({ ...agentCfg, url: e.target.value.trim() })}
              spellCheck={false}
              autoComplete="off"
            />
          </label>

          <label className="drawer-field">
            <span>passphrase</span>
            <div className="drawer-key">
              <input
                type={agentPassRevealed ? "text" : "password"}
                placeholder="the phrase the operator shared with you"
                value={agentCfg.passphrase}
                onChange={(e) =>
                  commitAgent({ ...agentCfg, passphrase: e.target.value })
                }
                spellCheck={false}
                autoComplete="off"
              />
              <button
                className="btn btn-ghost"
                onClick={() => setAgentPassRevealed((r) => !r)}
                type="button"
              >
                {agentPassRevealed ? "hide" : "show"}
              </button>
            </div>
          </label>

          <label className="drawer-field">
            <span>mode</span>
            <select
              value={agentCfg.enabled ? "on" : "off"}
              onChange={(e) =>
                commitAgent({
                  ...agentCfg,
                  enabled:
                    e.target.value === "on" && !!agentCfg.url && !!agentCfg.passphrase,
                })
              }
            >
              <option value="off">off — type goes to gemini</option>
              <option value="on">on — type goes to picoclaw</option>
            </select>
          </label>

          <div className="drawer-actions">
            <button
              className="btn btn-ghost"
              onClick={() => commitAgent({ ...DEFAULT_AGENT_CONFIG })}
            >
              reset
            </button>
          </div>
        </section>

        <section className="drawer-section dim small">
          <h3>about storage</h3>
          <ul>
            <li>gemini key + model: browser <code>localStorage</code></li>
            <li>agent url + passphrase: browser <code>localStorage</code></li>
            <li>tool memory (remember/recall): browser <code>localStorage</code></li>
            <li>messages log: browser <code>localStorage</code></li>
            <li>gemini proxy uses only the server key; nothing else is persisted</li>
            <li>agent backend persists per-session picoclaw history in its own volume; your browser never sees it</li>
          </ul>
        </section>
      </aside>
    </div>
  );
}
