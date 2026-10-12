import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, AudioLines, Video, Image as ImageIcon, ScanText, Film } from "lucide-react";
import { api } from "../lib/api";
import { API } from "../lib/api";
import { formatTimestamp } from "../lib/format";
import { DocTypeIcon } from "./Shared";

function mediaUrl(docId, kind) {
  return `${API}/api/documents/${docId}/file`;
}

export function TranscriptPanel({ passages, docId }) {
  const [playing, setPlaying] = useState(null);
  const lines = passages.filter((p) => p.timestamp > 0);

  const jump = (sec) => {
    const el = document.getElementById(`media-player-${docId}`);
    if (el) {
      el.currentTime = sec;
      el.play().catch(() => {});
    }
    setPlaying(sec);
  };

  return (
    <div className="transcript-list">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <ScanText size={15} /> <span style={{ fontSize: 13, fontWeight: 600 }}>Transcript</span>
        <span className="badge badge-neutral">{lines.length} segments</span>
      </div>
      {lines.map((p) => (
        <div className="transcript-line" key={p.chunk_id} onClick={() => jump(p.timestamp)}>
          <span className="transcript-time">{formatTimestamp(p.timestamp)}</span>
          <span className="transcript-text">{p.content}</span>
        </div>
      ))}
      {!lines.length && <div className="muted" style={{ fontSize: 13 }}>No transcript segments available.</div>}
    </div>
  );
}

export function AudioViewer({ doc, passages }) {
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const audioRef = useRef(null);
  const bars = useMemo(() => Array.from({ length: 64 }, (_, i) => 0.2 + 0.8 * Math.abs(Math.sin(i * 1.7)) * (1 - i / 70)), []);
  const activeBar = Math.floor((current / (doc.duration_seconds || 60)) * bars.length);

  return (
    <div className="media-shell">
      <div className="media-frame">
        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "var(--s-5)" }}>
          <button
            className="btn btn-primary"
            style={{ width: 44, height: 44, borderRadius: "50%", padding: 0, justifyContent: "center", flexShrink: 0 }}
            onClick={() => {
              const a = audioRef.current;
              if (playing) a.pause();
              else a.play();
            }}
          >
            {playing ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: 2 }} />}
          </button>
          <div style={{ flex: 1 }}>
            <div className="waveform">
              {bars.map((h, i) => (
                <span key={i} className={`bar ${i <= activeBar ? "on" : ""}`} style={{ height: `${h * 100}%` }} />
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-3)", fontFamily: "var(--font-mono)", marginTop: 6 }}>
              <span>{formatTimestamp(current)}</span>
              <span>{formatTimestamp(doc.duration_seconds)}</span>
            </div>
          </div>
        </div>
        <audio
          id={`media-player-${doc.id}`}
          ref={audioRef}
          src={mediaUrl(doc.id)}
          onTimeUpdate={(e) => setCurrent(e.target.currentTime)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          style={{ display: "none" }}
        />
      </div>
      <TranscriptPanel passages={passages} docId={doc.id} />
    </div>
  );
}

export function VideoViewer({ doc, passages }) {
  const videoRef = useRef(null);
  const [active, setActive] = useState(0);

  return (
    <div className="media-shell">
      <div className="media-frame">
        <video
          id={`media-player-${doc.id}`}
          ref={videoRef}
          src={mediaUrl(doc.id)}
          controls
          playsInline
          poster={undefined}
        />
      </div>
      <div className="frame-strip">
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, marginRight: 8 }}>
          <Film size={15} /> Key frames
        </div>
        {doc.media_assets?.length ? (
          doc.media_assets.map((asset, i) => {
            const t = (i + 1) * (doc.duration_seconds / (doc.media_assets.length + 1));
            return (
              <button key={asset} className="frame-thumb" onClick={() => videoRef.current?.currentTime && (videoRef.current.currentTime = t)}>
                <img src={`${API}/api/documents/${doc.id}/media/${asset.split(/[\\/]/).pop()}`} alt={`frame ${i}`} />
                <div className="frame-time">{formatTimestamp(t)}</div>
              </button>
            );
          })
        ) : (
          <span className="muted" style={{ fontSize: 13 }}>No frames extracted (ffmpeg required).</span>
        )}
      </div>
      <TranscriptPanel passages={passages} docId={doc.id} />
    </div>
  );
}

export function ImageViewer({ doc, passages }) {
  return (
    <div className="media-shell">
      <div className="media-frame">
        <img src={mediaUrl(doc.id)} alt={doc.title} style={{ maxHeight: "70vh", objectFit: "contain" }} />
      </div>
      {passages.length > 0 && (
        <div className="card" style={{ marginTop: 16, padding: "var(--s-5)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <ScanText size={15} /> <span style={{ fontSize: 13, fontWeight: 600 }}>Extracted text</span>
            <span className="badge badge-neutral">OCR / vision</span>
          </div>
          <p className="serif" style={{ fontSize: 15, lineHeight: 1.7, color: "var(--text-2)" }}>
            {passages.map((p) => p.content).join("\n\n") || "No text extracted from this image."}
          </p>
        </div>
      )}
      {doc.metadata_json && (
        <div className="card" style={{ marginTop: 16, padding: "var(--s-5)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <ImageIcon size={15} /> <span style={{ fontSize: 13, fontWeight: 600 }}>Image metadata</span>
          </div>
          <MetadataTable metadata={doc.metadata_json} />
        </div>
      )}
    </div>
  );
}

export function MetadataTable({ metadata, limit = 12 }) {
  let parsed = {};
  try {
    parsed = typeof metadata === "string" ? JSON.parse(metadata) : metadata;
  } catch {}
  const entries = Object.entries(parsed).filter(([k]) => !["exif"].includes(k)).slice(0, limit);
  if (!entries.length) return <span className="muted" style={{ fontSize: 13 }}>No metadata recorded.</span>;
  return (
    <table className="data-table">
      <tbody>
        {entries.map(([k, v]) => (
          <tr key={k}>
            <td style={{ color: "var(--text-3)", width: 160 }}>{k}</td>
            <td className="ellipsis">{String(v)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}