import { useState } from "react";
import { StickyNote, Plus, Pin, PinOff, Trash2, Pencil, X, Quote, FileText } from "lucide-react";
import { api } from "../lib/api";
import { useApp } from "../store";
import { useApi, EmptyState, PageSkeleton } from "../components/Shared";
import { formatDate } from "../lib/format";

export default function Notes() {
  const { pushToast } = useApp();
  const { data, loading, refetch } = useApi(() => api("/api/notes"), []);
  const [editing, setEditing] = useState(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const openNew = () => {
    setEditing({ mode: "create" });
    setTitle("");
    setBody("");
  };

  const save = async () => {
    setBusy(true);
    try {
      if (editing.mode === "create") {
        await api("/api/notes", { method: "POST", body: { title: title.trim() || "Untitled note", body } });
        pushToast("Note created", "success");
      } else {
        await api(`/api/notes/${editing.id}`, { method: "PATCH", body: { title: title.trim() || "Untitled note", body } });
        pushToast("Note updated", "success");
      }
      setEditing(null);
      refetch();
    } catch (e) {
      pushToast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const togglePin = async (n) => {
    try {
      await api(`/api/notes/${n.id}`, { method: "PATCH", body: { pinned: !n.pinned } });
      refetch();
    } catch (e) {
      pushToast(e.message, "error");
    }
  };

  const del = async (n) => {
    if (!confirm(`Delete note "${n.title}"?`)) return;
    try {
      await api(`/api/notes/${n.id}`, { method: "DELETE" });
      pushToast("Note deleted", "success");
      refetch();
    } catch (e) {
      pushToast(e.message, "error");
    }
  };

  const openEdit = async (n) => {
    try {
      const detail = await api(`/api/notes/${n.id}`);
      setEditing({ mode: "edit", id: n.id, sources: detail.sources || [] });
      setTitle(detail.title);
      setBody(detail.body);
    } catch (e) {
      pushToast(e.message, "error");
    }
  };

  if (loading) return <PageSkeleton cards={4} rows={0} />;

  return (
    <div className="page">
      <div className="page-head" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1>Research notes</h1>
          <div className="sub">Capture findings. Notes keep their cited sources attached.</div>
        </div>
        <button className="btn btn-primary" onClick={openNew}><Plus size={15} /> New note</button>
      </div>

      {!data?.length ? (
        <EmptyState icon={<StickyNote size={20} />} title="No notes yet">
          Save a passage from a document, or write down a finding — citations follow along.
        </EmptyState>
      ) : (
        <div className="note-grid">
          {data.map((n) => (
            <div className="note-card" key={n.id}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h3 className="note-card-title ellipsis" style={{ flex: 1 }}>{n.title}</h3>
                {n.pinned && <Pin size={14} style={{ color: "var(--accent)" }} />}
              </div>
              <div className="note-card-body">{n.body}</div>
              <div className="note-card-foot">
                {n.source_count ? <><Quote size={12} /> {n.source_count} sources</> : <span className="muted">no sources</span>}
                <span style={{ marginLeft: "auto" }}>{formatDate(n.updated_at)}</span>
                <button className="btn-icon sm" onClick={() => togglePin(n)} data-tip={n.pinned ? "Unpin" : "Pin"}>
                  {n.pinned ? <PinOff size={13} /> : <Pin size={13} />}
                </button>
                <button className="btn-icon sm" onClick={() => openEdit(n)} data-tip="Edit"><Pencil size={13} /></button>
                <button className="btn-icon sm" onClick={() => del(n)} data-tip="Delete"><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(null)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editing.mode === "create" ? "New note" : "Edit note"}</h3>
              <button className="btn-icon" onClick={() => setEditing(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="field" style={{ marginBottom: 12 }}>
                <label>Title</label>
                <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
              </div>
              <div className="field">
                <label>Note</label>
                <textarea className="textarea" rows={8} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your research note…" />
              </div>
              {editing.sources?.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: 0.05, marginBottom: 8 }}>
                    Attached sources
                  </div>
                  {editing.sources.map((s, i) => (
                    <div key={i} className="source-card" style={{ marginBottom: 8 }}>
                      <div className="source-card-top">
                        <span className="source-doc-name" style={{ maxWidth: "80%" }}>{s.document_title}</span>
                        <FileText size={13} className="muted" />
                      </div>
                      {s.excerpt && <div className="source-quote" style={{ margin: "8px 0 0" }}>{s.excerpt}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={busy} onClick={save}>Save note</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}