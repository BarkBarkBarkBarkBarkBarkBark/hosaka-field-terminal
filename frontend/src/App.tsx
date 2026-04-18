import { useEffect, useState } from "react";
import { TerminalPanel } from "./panels/TerminalPanel";
import { VideoPanel } from "./panels/VideoPanel";
import { MessagesPanel } from "./panels/MessagesPanel";
import { LorePanel } from "./panels/LorePanel";
import { PlantBadge } from "./components/PlantBadge";
import { SignalBadge } from "./components/SignalBadge";
import { SettingsDrawer } from "./components/SettingsDrawer";

export type PanelId = "terminal" | "video" | "messages" | "lore";

const PANELS: { id: PanelId; label: string; glyph: string }[] = [
  { id: "terminal", label: "Terminal", glyph: "›_" },
  { id: "video", label: "Video", glyph: "▶" },
  { id: "messages", label: "Messages", glyph: "✉" },
  { id: "lore", label: "Lore", glyph: "✦" },
];

export function App() {
  const [active, setActive] = useState<PanelId>("terminal");
  const [bootMessage, setBootMessage] = useState("...waking the orb...");
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setBootMessage("signal steady"), 900);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const handler = () => setSettingsOpen(true);
    window.addEventListener("hosaka:open-settings", handler);
    return () => window.removeEventListener("hosaka:open-settings", handler);
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
          <button
            className="icon-btn"
            aria-label="settings"
            title="settings"
            onClick={() => setSettingsOpen(true)}
          >
            ⚙
          </button>
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
        <div className="hosaka-panel" hidden={active !== "video"}>
          <VideoPanel />
        </div>
        <div className="hosaka-panel" hidden={active !== "messages"}>
          <MessagesPanel />
        </div>
        <div className="hosaka-panel" hidden={active !== "lore"}>
          <LorePanel />
        </div>
      </main>

      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <footer className="hosaka-footer">
        <span className="hosaka-footer-dim">there is no wrong way</span>
        <span className="hosaka-footer-dot">·</span>
        <span className="hosaka-footer-dim">
          built on hardware younger than its operator
        </span>
      </footer>
    </div>
  );
}
