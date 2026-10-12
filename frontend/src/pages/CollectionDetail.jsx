import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, MoreHorizontal, Trash2, FolderOpen } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";
import { useApp } from "../store";
import { useApi, DocumentCard, EmptyState, PageSkeleton } from "../components/Shared";

export default function CollectionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { pushToast } = useApp();
  const { data, loading, refetch } = useApi(() => api(`/api/collections/${id}`), [id]);
  const [allDocs, setAllDocs] = useState(null);

  if (loading) return <PageSkeleton cards={4} rows={0} />;
  if (!data) return <EmptyState icon={<FolderOpen size={20} />} title="Collection not found" />;

  const addDoc = async (docId) => {
    try {
      await api(`/api/collections/${id}/documents`, { method: "POST", params: { document_id: docId } });
      pushToast("Document added to collection", "success");
      refetch();
    } catch (e) {
      pushToast(e.message, "error");
    }
  };

  const removeDoc = async (docId) => {
    try {
      await api(`/api/collections/${id}/documents/${docId}`, { method: "DELETE" });
      pushToast("Document removed", "success");
      refetch();
    } catch (e) {
      pushToast(e.message, "error");
    }
  };

  const openPicker = async () => {
    if (allDocs === null) {
      try {
        const docs = await api("/api/documents");
        setAllDocs(Array.isArray(docs) ? docs : []);
      } catch {
        setAllDocs([]);
      }
    }
  };

  return (
    <div className="page">
      <div className="page-head" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn-icon" onClick={() => navigate("/app/collections")}><ArrowLeft size={16} /></button>
          <div>
            <h1>{data.name}</h1>
            <div className="sub">{data.description || `${data.document_count} documents`}</div>
          </div>
        </div>
        <button className="btn btn-primary" onClick={openPicker}>+ Add documents</button>
      </div>

      {allDocs && (
        <div className="card" style={{ marginBottom: 20, padding: 8, maxHeight: 300, overflowY: "auto" }}>
          <div className="palette-group-label">Add to collection</div>
          {allDocs.filter((d) => !data.documents.some((x) => x.id === d.id)).map((d) => (
            <button key={d.id} className="menu-item" onClick={() => addDoc(d.id)}>
              {d.title} <span className="muted" style={{ fontSize: 11, marginLeft: "auto" }}>{d.file_type.toUpperCase()}</span>
            </button>
          ))}
          {allDocs.length === 0 && <div className="muted" style={{ padding: 12 }}>No documents to add.</div>}
        </div>
      )}

      {data.documents.length === 0 ? (
        <EmptyState icon={<FolderOpen size={20} />} title="Collection is empty">
          Add documents to begin collecting research material here.
        </EmptyState>
      ) : (
        <div className="doc-grid">
          {data.documents.map((d) => (
            <DocumentCard
              key={d.id}
              doc={d}
              footer={
                <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={(e) => { e.stopPropagation(); removeDoc(d.id); }}>
                  <Trash2 size={13} /> Remove
                </button>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}