import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  X,
  FileText,
  BookOpen,
  Quote,
  Clock,
  Loader2,
  ArrowUpRight,
  Tag,
  Layers,
} from "lucide-react";
import { useApp } from "../store";
import { formatTimestamp } from "../lib/format";
import { fileIcon } from "../lib/format";

export default function SourcePanel() {
  const { panelOpen, closePanel, panelContent, jobs, openPanel } = useApp();
  const navigate = useNavigate();

  const content = useMemo(() => {
    if (!panelContent) return null;
    if (panelContent.kind === "processing") {
      return <ProcessingView jobs={jobs} openPanel={openPanel} />;
    }
    if (panelContent.kind === "citations" || panelContent.kind === "sources") {
      return <SourcesView sources={panelContent.sources || []} title={panelContent.title} />;
    }
    return <EmptyView />;
  }, [panelContent, jobs, openPanel]);

  return (
    <div className={`source-panel ${panelOpen ? "open" : ""}`}>
      <div className="source-panel-head">
        <h3>{panelContent?.title || "Context"}</h3>
        <button className="btn-icon" onClick={closePanel}>
          <X size={16} />
        </button>
      </div>
      <div className="source-panel-body">{content}</div>
    </div>
  );
}

function SourcesView({ sources, title }) {
  const navigate = useNavigate();
  const { closePanel } = useApp();
  if (!sources || !sources.length) {
    return (
      <div className="empty">
        <div className="empty-icon"><Quote size={22} /></div>
        <h3>No sources open</h3>
        <p>Ask a question in the workspace and citations will appear here as numbered source cards.</p>
      </div>
    );
  }
  return (
    <>
      <div style={{ fontSize: 12, color: "var(--text-3)" }}>
        {sources.length} retrieved {sources.length === 1 ? "source" : "sources"}
      </div>
      {sources.map((s, i) => (
        <div className="source-card" key={s.chunk_id ?? i}>
          <div className="source-card-top">
            <span className="source-doc-name" style={{ maxWidth: "70%" }}>{s.document_title}</span>
            <span className="badge badge-neutral">{i + 1}</span>
          </div>
          <div className="source-meta">
            <FileText size={12} /> {(s.file_type || "doc").toUpperCase()}
            {s.page ? <><span>·</span><span>p. {s.page}</span></> : null}
            {s.timestamp ? <><span>·</span><span>{formatTimestamp(s.timestamp)}</span></> : null}
            {s.section ? <><span>·</span><span className="ellipsis" style={{ maxWidth: 80 }}>{s.section}</span></> : null}
          </div>
          <div className="source-quote">{s.content}</div>
          <div className="source-actions">
            {typeof s.score === "number" && (
              <span className="relevance" style={{ color: "var(--accent)" }}>
                {(s.score * 100).toFixed(0)}% relevant
              </span>
            )}
            <div style={{ flex: 1 }} />
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                closePanel();
                navigate(`/app/documents/${s.document_id}`, { state: { highlightChunk: s.chunk_id } });
              }}
            >
              Open source <ArrowUpRight size={13} />
            </button>
          </div>
        </div>
      ))}
    </>
  );
}

function ProcessingView({ jobs, openPanel }) {
  if (!jobs || !jobs.length) {
    return (
      <div className="empty">
        <div className="empty-icon"><Loader2 size={22} /></div>
        <h3>Nothing processing</h3>
        <p>Uploaded files will stream through the extraction pipeline here.</p>
      </div>
    );
  }
  return (
    <>
      <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 8 }}>Active jobs</div>
      {jobs.map((j) => (
        <div className="source-card" key={j.job_id}>
          <div className="source-card-top">
            <span className="source-doc-name">{j.filename}</span>
            <span className="badge badge-accent">{j.stage}</span>
          </div>
          <div className="progress" style={{ margin: "10px 0" }}>
            <span style={{ width: `${j.progress}%` }} />
          </div>
          <div style={{ fontSize: 12, color: "var(--text-2)" }}>{j.detail || "Processing…"}</div>
        </div>
      ))}
    </>
  );
}

function EmptyView() {
  return (
    <div className="empty">
      <div className="empty-icon"><Layers size={22} /></div>
      <h3>Context panel</h3>
      <p>Retrieved sources, citations, highlighted passages and document metadata appear here.</p>
    </div>
  );
}