import { useEffect, useState } from "react";

const GLYPHS = ["✿", "❀", "✾", "✽", "❁"] as const;

export function PlantBadge() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => {
      setIdx((n) => (n + 1) % GLYPHS.length);
    }, 4200);
    return () => clearInterval(t);
  }, []);

  return (
    <span className="plant-badge" title="the plant persists">
      <span className="plant-glyph">{GLYPHS[idx]}</span>
      <span className="plant-label">plant: stable</span>
    </span>
  );
}
