import { useRef, useState } from "react";

type Source = { kind: "file" | "url"; src: string; label: string };

const SAMPLES: Source[] = [
  {
    kind: "url",
    label: "Big Buck Bunny (classic test pattern)",
    src: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  },
  {
    kind: "url",
    label: "Sintel teaser (creative commons)",
    src: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
  },
];

export function VideoPanel() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    setSource({ kind: "file", src: url, label: f.name });
    setError(null);
  };

  const loadUrl = () => {
    const v = urlInput.trim();
    if (!v) return;
    try {
      new URL(v);
    } catch {
      setError("that's not a valid URL, friend.");
      return;
    }
    setSource({ kind: "url", label: v, src: v });
    setError(null);
  };

  return (
    <div className="video-wrap">
      <div className="panel-header">
        <h2>
          <span className="panel-glyph">▶</span> Video
        </h2>
        <p className="panel-sub">
          play local files or any direct video URL. the hosted build won't
          scrape third-party sites — paste a direct link.
        </p>
      </div>

      <div className="video-controls">
        <label className="btn btn-file">
          choose file
          <input
            type="file"
            accept="video/*"
            onChange={pickFile}
            hidden
          />
        </label>
        <div className="video-url">
          <input
            type="url"
            placeholder="https://.../video.mp4"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") loadUrl();
            }}
          />
          <button className="btn" onClick={loadUrl}>
            load
          </button>
        </div>
      </div>

      <div className="video-samples">
        <span className="video-samples-label">or a sample:</span>
        {SAMPLES.map((s) => (
          <button
            key={s.src}
            className="pill"
            onClick={() => {
              setSource(s);
              setError(null);
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {error && <p className="err">{error}</p>}

      <div className="video-stage">
        {source ? (
          <>
            <video
              ref={videoRef}
              src={source.src}
              controls
              playsInline
              preload="metadata"
            />
            <p className="dim">now playing: {source.label}</p>
          </>
        ) : (
          <div className="video-empty">
            <pre>
{`    ▶ ▶ ▶
  ─────────────────
  no signal.
  pick a file or paste a URL.`}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
