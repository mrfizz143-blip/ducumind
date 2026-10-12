import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FolderOpen, Plus, MoreHorizontal, Pencil, Trash2, X } from "lucide-react";
import { api } from "../lib/api";
import { useApp } from "../store";
import { useApi, EmptyState, PageSkeleton } from "../components/Shared";

const COLORS = ["indigo", "amber", "green", "rose", "sky", "violet"];

export default function Collections() {
  const navigate = useNavigate();
  const { pushToast } = useApp();
  const { data, loading, refetch } = useApi(() => api("/api/collections"), []);
  const [modal, setModal] = useState(null);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [color, setColor] = useState("indigo");
  const [busy, setBusy] = useState(false);

  const openCreate = () => {
    setModal({ mode: "create" });
    setName("");
    setDesc("");
    setColor("indigo");
  };

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      if (modal.mode === "create") {
        await api("/api/collections", { method: "POST", body: { name, description: desc, color } });
        pushToast("Collection created", "success");
      } else {
        await api(`/api/collections/${modal.id}`, { method: "PATCH", body: { name, description: desc, color } });
        pushToast("Collection updated", "success");
      }
      setModal(null);
      refetch();
    } catch (e) {
      pushToast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const del = async (c) => {
    if (!confirm(`Delete collection "${c.name}"?`)) return;
    try {
      await api(`/api/collections/${c.id}`, { method: "DELETE" });
      pushToast("Collection deleted", "success");
      refetch();
    } catch (e) {
      pushToast(e.message, "error");
    }
  };

  if (loading) return <PageSkeleton cards={4} rows={0} />;

  return (
    <div className="page">
      <div className="page-head" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1>Collections</h1>
          <div className="sub">Group documents into themed research collections.</div>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          <Plus size={15} /> New collection
        </button>
      </div>

      {!data?.length ? (
        <EmptyState icon={<FolderOpen size={20} />} title="No collections yet">
          Create a collection to organise documents by project, topic or experiment.
        </EmptyState>
      ) : (
        <div className="collection-grid">
          {data.map((c) => (
            <div className="collection-card" key={c.id} onClick={() => navigate(`/app/collections/${c.id}`)}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div className="collection-dot" style={{ background: colorVal(c.color) }} />
                <span onClick={(e) => e.stopPropagation()} style={{ position: "relative" }}>
                  <CollectionMenu c={c} onEdit={() => { setModal({ mode: "edit", id: c.id }); setName(c.name); setDesc(c.description); setColor(c.color); }} onDelete={() => del(c)} />
                </span>
              </div>
              <div>
                <div className="collection-name">{c.name}</div>
                {c.description && <div className="mini-item-sub" style={{ marginTop: 2 }}>{c.description}</div>}
              </div>
              <div className="collection-count">{c.document_count} documents</div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{modal.mode === "create" ? "New collection" : "Edit collection"}</h3>
              <button className="btn-icon" onClick={() => setModal(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="field" style={{ marginBottom: 14 }}>
                <label>Name</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Climate adaptation literature" autoFocus />
              </div>
              <div className="field" style={{ marginBottom: 14 }}>
                <label>Description</label>
                <textarea className="textarea" rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What is this collection about?" />
              </div>
              <div className="field">
                <label>Color</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {COLORS.map((c) => (
                    <button key={c} className="collection-dot" style={{ width: 24, height: 24, background: colorVal(c), opacity: color === c ? 1 : 0.35, boxShadow: color === c ? "0 0 0 2px var(--surface), 0 0 0 4px var(--accent)" : "none" }} onClick={() => setColor(c)} />
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={!name.trim() || busy} onClick={save}>{modal.mode === "create" ? "Create" : "Save"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function colorVal(c) {
  return { indigo: "#4a58c8", amber: "#c98a2d", green: "#2f7d52", rose: "#c4402e", sky: "#2d7da4", violet: "#7c3aed" }[c] || "#4a58c8";
}

function CollectionMenu({ c, onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button className="btn-icon sm" onClick={() => setOpen((v) => !v)}><MoreHorizontal size={14} /></button>
      {open && (
        <div className="menu" style={{ top: "calc(100% + 4px)", right: 0 }}>
          <button className="menu-item" onClick={() => { setOpen(false); onEdit(); }}><Pencil size={14} /> Edit</button>
          <button className="menu-item danger" onClick={() => { setOpen(false); onDelete(); }}><Trash2 size={14} /> Delete</button>
        </div>
      )}
    </div>
  );
}