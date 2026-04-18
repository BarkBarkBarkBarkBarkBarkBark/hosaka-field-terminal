import { useMemo, useState } from "react";
import { LORE_FRAGMENTS } from "../shell/content";

export function LorePanel() {
  const [seed, setSeed] = useState(0);
  const fragment = useMemo(() => {
    const idx = seed % LORE_FRAGMENTS.length;
    return LORE_FRAGMENTS[idx]!;
  }, [seed]);

  return (
    <div className="lore-wrap">
      <div className="panel-header">
        <h2>
          <span className="panel-glyph">✦</span> Lore
        </h2>
        <p className="panel-sub">
          breadcrumbs from before the cascade. the orb remembers in fragments.
        </p>
      </div>

      <article className="lore-card">
        <pre>{fragment.join("\n")}</pre>
      </article>

      <div className="lore-actions">
        <button className="btn" onClick={() => setSeed((n) => n + 1)}>
          next fragment
        </button>
        <span className="dim small">
          ({(seed % LORE_FRAGMENTS.length) + 1} / {LORE_FRAGMENTS.length})
        </span>
      </div>

      <section className="lore-manifest">
        <h3>the no-wrong-way manifest (excerpt)</h3>
        <ul>
          <li>there is no wrong way.</li>
          <li>signal steady. persistence is a feature.</li>
          <li>the terminal is the hero. everything else is a panel.</li>
          <li>the plant is not a metaphor. tend it.</li>
        </ul>
      </section>
    </div>
  );
}
