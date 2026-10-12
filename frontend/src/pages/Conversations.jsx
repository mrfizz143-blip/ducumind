import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MessageSquare, Trash2, ArrowLeft, Plus, Send } from "lucide-react";
import { api } from "../lib/api";
import { useApp } from "../store";
import { EmptyState, PageSkeleton } from "../components/Shared";
import ChatMessage from "../components/ChatMessage";
import { formatDate } from "../lib/format";

export default function Conversations() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { pushToast } = useApp();
  const [convs, setConvs] = useState(null);
  const [active, setActive] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const load = useCallback(() => {
    api("/api/conversations")
      .then((c) => setConvs(Array.isArray(c) ? c : []))
      .catch(() => setConvs([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (id) openConv(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const openConv = async (convId) => {
    setLoadingDetail(true);
    setActive(convId);
    try {
      const data = await api(`/api/conversations/${convId}`);
      setMsgs(data.messages || []);
    } catch (e) {
      pushToast(e.message, "error");
    } finally {
      setLoadingDetail(false);
    }
  };

  const del = async (convId, e) => {
    e?.stopPropagation();
    if (!confirm("Delete this conversation?")) return;
    try {
      await api(`/api/conversations/${convId}`, { method: "DELETE" });
      pushToast("Conversation deleted", "success");
      if (active === convId) {
        setActive(null);
        setMsgs([]);
      }
      load();
    } catch (e) {
      pushToast(e.message, "error");
    }
  };

  if (convs === null) return <PageSkeleton cards={3} rows={3} />;

  return (
    <div className="page">
      <div className="page-head" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1>Conversations</h1>
          <div className="sub">Every grounded question, with its cited answers.</div>
        </div>
        <button className="btn btn-primary" onClick={() => navigate("/app/workspace")}><Plus size={15} /> New conversation</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 16, alignItems: "start" }} className="conv-grid">
        <div className="card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "var(--s-3) var(--s-4)", borderBottom: "1px solid var(--border)", fontSize: 12, fontWeight: 600, color: "var(--text-3)" }}>
            {convs.length} conversations
          </div>
          <div style={{ maxHeight: "62vh", overflowY: "auto" }}>
            {convs.map((c) => (
              <div key={c.id} className={`list-item ${active === c.id ? "conv-active" : ""}`} onClick={() => openConv(c.id)}>
                <MessageSquare size={15} style={{ color: "var(--text-2)", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="mini-item-title ellipsis">{c.title}</div>
                  <div className="mini-item-sub">{formatDate(c.updated_at)}</div>
                </div>
                <button className="btn-icon sm" onClick={(e) => del(c.id, e)}><Trash2 size={12} /></button>
              </div>
            ))}
            {!convs.length && <div className="muted" style={{ padding: 20, fontSize: 13, textAlign: "center" }}>No conversations yet.</div>}
          </div>
        </div>

        <div className="card" style={{ minHeight: "50vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {!active ? (
            <EmptyState icon={<MessageSquare size={20} />} title="Select a conversation">
              Choose a conversation to review its questions and cited answers, or start fresh in the workspace.
            </EmptyState>
          ) : loadingDetail ? (
            <div style={{ padding: 24 }}>
              <div className="skeleton" style={{ height: 60, marginBottom: 12 }} />
              <div className="skeleton" style={{ height: 60 }} />
            </div>
          ) : msgs.length === 0 ? (
            <EmptyState icon={<MessageSquare size={20} />} title="No messages" />
          ) : (
            <div style={{ padding: "var(--s-5)", display: "flex", flexDirection: "column", gap: 16, overflowY: "auto", maxHeight: "62vh" }}>
              {msgs.map((m) => (
                <ChatMessage key={m.id} message={m} />
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`.conv-active { background: var(--accent-soft); }
      @media (max-width: 768px) { .conv-grid { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}