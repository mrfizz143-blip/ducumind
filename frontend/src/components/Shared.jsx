import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  Image as ImageIcon,
  AudioLines,
  Video,
  FileType2,
  ArrowUpRight,
} from "lucide-react";
import { useApp } from "../store";
import { formatBytes, formatDate, fileIcon } from "../lib/format";

export function useApi(fn, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fn()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, loading, error, refetch: () => setLoading(true) };
}

export function DocTypeIcon({ type, size = 16 }) {
  const map = {
    pdf: { icon: FileText, color: "var(--danger)" },
    doc: { icon: FileType2, color: "var(--accent)" },
    text: { icon: FileText, color: "var(--text-2)" },
    image: { icon: ImageIcon, color: "var(--success)" },
    audio: { icon: AudioLines, color: "var(--warning)" },
    video: { icon: Video, color: "var(--accent)" },
  };
  const key = fileIcon(type);
  const cfg = map[key] || map.text;
  const Icon = cfg.icon;
  return <Icon size={size} style={{ color: cfg.color }} />;
}

export function DocumentCard({ doc, onClick, footer }) {
  const navigate = useNavigate();
  const go = () => {
    if (onClick) onClick(doc);
    else navigate(`/app/documents/${doc.id}`);
  };
  return (
    <div className="doc-card" onClick={go}>
      <div className="doc-thumb">
        <DocTypeIcon type={doc.file_type} size={26} />
      </div>
      <div className="doc-card-title ellipsis">{doc.title}</div>
      <div className="doc-card-meta">
        <span>{doc.file_type.toUpperCase()}</span>
        <span>·</span>
        <span>{formatBytes(doc.size_bytes)}</span>
        {doc.page_count ? <><span>·</span><span>{doc.page_count} pages</span></> : null}
        {doc.duration_seconds ? <><span>·</span><span>{Math.round(doc.duration_seconds)}s</span></> : null}
      </div>
      <div className="doc-card-foot">
        {doc.status === "ready" && <span className="badge badge-success">indexed</span>}
        {doc.status === "failed" && <span className="badge badge-danger">failed</span>}
        {doc.status === "processing" || doc.status === "uploading" ? (
          <span className="badge badge-warning">{doc.status}</span>
        ) : null}
        {doc.status === "ready" && <ArrowUpRight size={14} className="muted" />}
      </div>
      {footer}
    </div>
  );
}

export function EmptyState({ icon, title, children }) {
  return (
    <div className="empty" style={{ padding: "var(--s-8)" }}>
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="doc-card" style={{ pointerEvents: "none" }}>
      <div className="skeleton" style={{ height: 96 }} />
      <div className="skeleton" style={{ height: 14, width: "70%" }} />
      <div className="skeleton" style={{ height: 12, width: "45%" }} />
    </div>
  );
}

export function PageSkeleton({ cards = 3, rows = 4 }) {
  return (
    <div className="page">
      <div className="skeleton" style={{ height: 28, width: 220, marginBottom: 24 }} />
      <div className="doc-grid">
        {Array.from({ length: cards }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      {rows > 0 && (
        <div className="card" style={{ marginTop: 24, padding: 8 }}>
          {Array.from({ length: rows }).map((_, i) => (
            <div className="skeleton" key={i} style={{ height: 14, margin: 12, borderRadius: 4 }} />
          ))}
        </div>
      )}
    </div>
  );
}