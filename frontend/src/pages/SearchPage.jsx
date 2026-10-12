import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Filter, FileText, StickyNote, MessageSquare, ArrowRight, Loader2 } from "lucide-react";
import { api } from "../lib/api";
import { useApp } from "../store";
import { highlightQuery } from "../lib/format";
import { useApi } from "../components/Shared";

export default function SearchPage() {
  const navigate = useNavigate();
  const { pushToast } = useApp();
  const { data: docs } = useApi(() => api("/api/documents"), []);
  const [query, setQuery] = useState("");
  const [semantic, setSemantic] = useState(true);
  const [keyword, setKeyword] = useState(true);
  const [fileType, setFileType] = useState("all");
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [ran, setRan] = useState(false);

  const run = async (q) => {
    const term = (q ?? query).trim();
    if (!term) return;
    setBusy(true);
    setRan(true);
    try {
      const data = await api("/api/search", {
        method: "POST",
        body: {
          query: term,
          semantic,
          keyword,
          file_types: fileType === "all" ? null : [fileType],
          limit: 24,
        },
      });
      setResults(data.results || []);
    } catch (e) {
      pushToast(e.message, "error");
      setResults([]);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        document.getElementById("global-search-input")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const typeCount = (t) => (docs || []).filter((d) => d.file_type === t).length;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Global search</h1>
        <div className="sub">Semantic + keyword search across passages, documents, OCR text, transcripts, notes and conversations.</div>
      </div>

      <div className="card" style={{ padding: "var(--s-4)", marginBottom: 20 }}>
        <div className="search-box">
          <Search size={16} />
          <input
            id="global-search-input"
            className="input"
            style={{ paddingLeft: 38, height: 42, fontSize: 15 }}
            placeholder="Search your entire research corpus…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
          <button className={`chip ${semantic ? "active" : ""}`} onClick={() => setSemantic((v) => !v)}>Semantic</button>
          <button className={`chip ${keyword ? "active" : ""}`} onClick={() => setKeyword((v) => !v)}>Keyword</button>
          <select className="select" style={{ width: 150, height: 28 }} value={fileType} onChange={(e) => setFileType(e.target.value)}>
            <option value="all">All file types</option>
            <option value="pdf">PDF ({typeCount("pdf")})</option>
            <option value="docx">DOCX ({typeCount("docx")})</option>
            <option value="txt">TXT ({typeCount("txt")})</option>
            <option value="png">Images</option>
            <option value="mp3">Audio</option>
            <option value="mp4">Video</option>
          </select>
          <button className="btn btn-primary" onClick={() => run()} disabled={busy}>
            {busy && <Loader2 size={14} className="spin" />} Search
          </button>
        </div>
      </div>

      {!ran && (
        <div className="empty" style={{ padding: "var(--s-8)" }}>
          <div className="empty-icon"><Filter size={20} /></div>
          <h3>Search everything you've read</h3>
          <p>Try: “What is the capital of France?” — Documind will surface the exact passages that answer it.</p>
        </div>
      )}

      {ran && (
        <>
          <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 12 }}>
            {results?.length || 0} results {semantic && keyword ? "· hybrid" : semantic ? "· semantic only" : "· keyword only"}
          </div>
          {results?.length === 0 && !busy && (
            <EmptyState icon={<Search size={20} />} title="No matches">
              Try different wording, or upload more material about this topic.
            </EmptyState>
          )}
          {results?.map((r, i) => (
            <ResultItem key={`${r.kind}-${r.id}-${i}`} r={r} query={query} navigate={navigate} />
          ))}
        </>
      )}
    </div>
  );
}

function ResultItem({ r, query, navigate }) {
  const icon =
    r.kind === "note" ? <StickyNote size={15} /> : r.kind === "conversation" ? <MessageSquare size={15} /> : <FileText size={15} />;
  const dest =
    r.kind === "note"
      ? "/app/notes"
      : r.kind === "conversation"
      ? `/app/conversations/${r.id}`
      : `/app/documents/${r.document_id}`;

  return (
    <div className="result-item">
      <div className="result-kicker">
        {icon}
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", textTransform: "uppercase", letterSpacing: 0.04 }}>{r.kind}</span>
        {r.file_type ? <span className="badge badge-neutral">{r.file_type.toUpperCase()}</span> : null}
        {typeof r.score === "number" && r.score > 0 ? (
          <span className="badge badge-accent">{(r.score * 100).toFixed(0)}% relevant</span>
        ) : null}
        <span style={{ marginLeft: "auto" }} />
      </div>
      <div className="result-title">
        <a href={`#${dest}`} onClick={(e) => { e.preventDefault(); navigate(dest); }}>
          {r.kind === "conversation" ? (r.title || "Conversation") : r.document_title}
        </a>
        {r.kind === "passage" && (r.page ? <span className="muted" style={{ fontWeight: 400 }}> — p. {r.page}</span> : null)}
        {r.kind === "passage" && r.timestamp ? <span className="muted" style={{ fontWeight: 400 }}> — {Math.floor(r.timestamp)}s</span> : null}
      </div>
      <div
        className="result-excerpt"
        dangerouslySetInnerHTML={{ __html: highlightQuery(r.excerpt, query) }}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(dest)}>
          Open <ArrowRight size={13} />
        </button>
      </div>
    </div>
  );
}