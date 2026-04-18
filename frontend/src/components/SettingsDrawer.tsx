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
          <h3>Channel</h3>
          <p className="dim small">
            picoclaw is the default voice of hosaka — an agentic framework
            running on a tiny fly.io box, wired to gemini by a server-side key
            you never see. free text in the terminal goes here. the{" "}
            <code>/ask</code> command uses the gemini proxy directly for a
            plain one-shot question.
          </p>

          <label className="drawer-field">
            <span>gemini model (for /ask only)</span>
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
          <h3>Agent backend — picoclaw</h3>
          <p className="dim small">
            advanced: override the default relay url or passphrase. most
            visitors should leave these alone — say <code>neuro</code> in the
            terminal and the channel opens on its own.
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
            <span>channel</span>
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
              <option value="on">open — typing goes to picoclaw</option>
              <option value="off">closed — typing is ignored (say neuro to reopen)</option>
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
            <li>gemini model preference: browser <code>localStorage</code></li>
            <li>agent url + passphrase: browser <code>localStorage</code></li>
            <li>messages log: browser <code>localStorage</code></li>
            <li>the gemini api key lives only in vercel env vars — the browser never sees it</li>
            <li>picoclaw persists per-session history on the fly.io volume; your browser never sees it</li>
          </ul>
        </section>
      </aside>
    </div>
  );
}
