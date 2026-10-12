import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Upload, Search } from "lucide-react";
import { api } from "../lib/api";
import { useApp } from "../store";
import { DocumentCard, EmptyState, PageSkeleton } from "../components/Shared";

export default function Documents() {
  const navigate = useNavigate();
  const { pushToast } = useApp();
  const [docs, setDocs] = useState(null);
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");

  const load = () =>
    api("/api/documents")
      .then((d) => setDocs(Array.isArray(d) ? d : []))
      .catch(() => setDocs([]));

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const onUpload = () => load();
    window.addEventListener("upload:open", onUpload);
    const t = setInterval(load, 5000);
    return () => {
      window.removeEventListener("upload:open", onUpload);
      clearInterval(t);
    };
  }, []);

  const filtered = (docs || []).filter((d) => {
    const matchQ = !q || d.title.toLowerCase().includes(q.toLowerCase());
    const matchT = type === "all" || d.file_type === type;
    return matchQ && matchT;
  });

  const types = ["all", "pdf", "docx", "txt", "png", "jpg", "mp3", "wav", "mp4", "mov"];

  return (
    <div className="page">
      <div className="page-head" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1>Documents</h1>
          <div className="sub">Your indexed research library — every file is extracted, chunked and embedded.</div>
        </div>
        <button className="btn btn-primary" onClick={() => document.dispatchEvent(new CustomEvent("upload:open"))}>
          <Upload size={15} /> Upload
        </button>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <div className="search-box" style={{ width: 260 }}>
          <Search size={14} />
          <input className="input" placeholder="Filter documents…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="seg">
          {types.slice(0, 5).map((t) => (
            <button key={t} className={type === t ? "active" : ""} onClick={() => setType(t)}>
              {t === "all" ? "All" : t.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {!docs ? (
        <PageSkeleton cards={6} rows={0} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Plus size={20} />} title={docs.length === 0 ? "Your library is empty" : "No matches"}>
          {docs.length === 0
            ? "Upload PDFs, documents, images, audio and video. They are processed automatically and become searchable."
            : `Nothing matches “${q}”.`}
        </EmptyState>
      ) : (
        <div className="doc-grid">
          {filtered.map((d) => (
            <DocumentCard key={d.id} doc={d} />
          ))}
        </div>
      )}
    </div>
  );
}