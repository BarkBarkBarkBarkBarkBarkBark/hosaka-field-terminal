import { useEffect, useState } from "react";
import { TerminalPanel } from "./panels/TerminalPanel";
import { MessagesPanel } from "./panels/MessagesPanel";
import { ReadingPanel } from "./panels/ReadingPanel";
import { TodoPanel } from "./panels/TodoPanel";
import { PlantBadge } from "./components/PlantBadge";
import { SignalBadge } from "./components/SignalBadge";
import { SettingsDrawer } from "./components/SettingsDrawer";

export type PanelId = "terminal" | "messages" | "reading" | "todo";

const PANELS: { id: PanelId; label: string; glyph: string }[] = [
  { id: "terminal", label: "Terminal", glyph: "›_" },
  { id: "messages", label: "Messages", glyph: "✉" },
  { id: "reading", label: "Reading", glyph: "❑" },
  { id: "todo", label: "Open Loops", glyph: "▣" },
];

// Settings drawer is hidden in the hosted web build to avoid exposing
// the agent passphrase. Enable for the desktop/appliance rollout with
// VITE_SHOW_SETTINGS=1 at build time.
const SHOW_SETTINGS = import.meta.env.VITE_SHOW_SETTINGS === "1";

export function App() {
  const [active, setActive] = useState<PanelId>("terminal");
  const [bootMessage, setBootMessage] = useState("...waking the orb...");
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setBootMessage("signal steady"), 900);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const onSettings = () => setSettingsOpen(true);
    const onTab = (e: Event) => {
      const detail = (e as CustomEvent<PanelId>).detail;
      if (detail) setActive(detail);
    };
    window.addEventListener("hosaka:open-settings", onSettings);
    window.addEventListener("hosaka:open-tab", onTab as EventListener);
    return () => {
      window.removeEventListener("hosaka:open-settings", onSettings);
      window.removeEventListener("hosaka:open-tab", onTab as EventListener);
    };
  }, []);

  return (
    <div className="hosaka-shell">
      <header className="hosaka-topbar">
        <div className="hosaka-brand">
          <span className="hosaka-brand-logo">HOSAKA</span>
          <span className="hosaka-brand-sub">// field terminal</span>
        </div>
        <div className="hosaka-topbar-right">
          <SignalBadge label={bootMessage} />
          <PlantBadge />
          {SHOW_SETTINGS && (
            <button
              className="icon-btn"
              aria-label="settings"
              title="settings"
              onClick={() => setSettingsOpen(true)}
            >
              ⚙
            </button>
          )}
        </div>
      </header>

      <nav className="hosaka-dock" role="tablist">
        {PANELS.map((p) => (
          <button
            key={p.id}
            role="tab"
            aria-selected={active === p.id}
            className={`hosaka-dock-btn ${active === p.id ? "is-active" : ""}`}
            onClick={() => setActive(p.id)}
          >
            <span className="hosaka-dock-glyph">{p.glyph}</span>
            <span className="hosaka-dock-label">{p.label}</span>
          </button>
        ))}
      </nav>

      <main className="hosaka-stage">
        <div className="hosaka-panel" hidden={active !== "terminal"}>
          <TerminalPanel active={active === "terminal"} />
        </div>
        <div className="hosaka-panel" hidden={active !== "messages"}>
          <MessagesPanel />
        </div>
        <div className="hosaka-panel" hidden={active !== "reading"}>
          <ReadingPanel active={active === "reading"} />
        </div>
        <div className="hosaka-panel" hidden={active !== "todo"}>
          <TodoPanel />
        </div>
      </main>

      {SHOW_SETTINGS && (
        <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      )}

      <footer className="hosaka-footer">
        <span className="hosaka-footer-dim">:: signal steady ::</span>
      </footer>
    </div>
  );
}
