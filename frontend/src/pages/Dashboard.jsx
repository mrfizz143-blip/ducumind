import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  FileText,
  FolderOpen,
  MessageSquare,
  StickyNote,
  Sparkles,
  Loader2,
  Clock,
  Pin,
  ChevronRight,
} from "lucide-react";
import { useApp } from "../store";
import { api } from "../lib/api";
import { useApi, DocumentCard, EmptyState, PageSkeleton } from "../components/Shared";
import { formatDate } from "../lib/format";

export default function Dashboard() {
  const { openPanel, pushToast } = useApp();
  const navigate = useNavigate();
  const { data, loading } = useApi(() => api("/api/dashboard"), []);

  if (loading) return <PageSkeleton cards={3} rows={0} />;

  const d = data || {
    stats: { documents: 0, collections: 0, conversations: 0, notes: 0 },
    recent_documents: [],
    active_collections: [],
    recent_questions: [],
    saved_notes: [],
    processing: [],
  };

  const askInWorkspace = (q) => {
    navigate("/app/workspace", { state: { initialPrompt: q } });
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Research overview</h1>
        <div className="sub">Continue where you left off, or begin something new.</div>
      </div>

      <div className="dash-grid">
        <div className="dash-col col-12">
          <div className="welcome-banner">
            <div className="serif" style={{ fontSize: 22 }}>
              {d.processing.length > 0
                ? "Your library is indexing in the background."
                : "Ask a research question to start a grounded conversation."}
            </div>
            <div className="quick-prompts">
              {[
                "Summarize my latest document",
                "Compare two papers in my library",
                "What are the key findings of my sources?",
              ].map((p) => (
                <button key={p} className="quick-prompt" onClick={() => askInWorkspace(p)}>
                  {p}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn-primary" onClick={() => navigate("/app/workspace")}>
                <Sparkles size={15} /> Open workspace
              </button>
              <button className="btn btn-secondary" onClick={() => document.dispatchEvent(new CustomEvent("upload:open"))}>
                <FileText size={15} /> Upload material
              </button>
            </div>
          </div>
        </div>

        {d.processing.length > 0 && (
          <div className="dash-col col-12">
            <div className="dash-card">
              <div className="dash-card-head">
                <h2>Files currently processing</h2>
                <button className="btn btn-ghost btn-sm" onClick={() => openPanel({ kind: "processing", title: "Processing" })}>
                  View all <ChevronRight size={13} />
                </button>
              </div>
              <div className="dash-card-body">
                {d.processing.map((j) => (
                  <div className="mini-item" key={j.job_id}>
                    <div className="mini-item-icon" style={{ color: "var(--accent)" }}>
                      <Loader2 size={16} className="spin" />
                    </div>
                    <div className="grow">
                      <div className="mini-item-title">{j.filename}</div>
                      <div style={{ fontSize: 11, color: "var(--accent)", marginTop: 4 }}>
                        {j.stage} — {j.progress}%
                      </div>
                      <div className="progress" style={{ marginTop: 6 }}>
                        <span style={{ width: `${j.progress}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="dash-col col-4">
          <div className="dash-card">
            <div className="dash-card-head">
              <h2>Active collections</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate("/app/collections")}>
                <ArrowRight size={13} />
              </button>
            </div>
            <div className="dash-card-body">
              {d.active_collections.length === 0 && (
                <EmptyState icon={<FolderOpen size={20} />} title="No collections yet">
                  Group documents into themed research collections.
                </EmptyState>
              )}
              {d.active_collections.map((c) => (
                <div className="mini-item" key={c.id} onClick={() => navigate(`/app/collections/${c.id}`)}>
                  <div className="collection-dot" style={{ background: `var(--accent)` }} />
                  <div className="grow">
                    <div className="mini-item-title">{c.name}</div>
                    <div className="mini-item-sub">{c.document_count} documents</div>
                  </div>
                  <ChevronRight size={14} className="muted" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="dash-col col-8">
          <div className="dash-card">
            <div className="dash-card-head">
              <h2>Recent documents</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate("/app/documents")}>
                All documents <ArrowRight size={13} />
              </button>
            </div>
            <div className="dash-card-body">
              {d.recent_documents.length === 0 ? (
                <EmptyState icon={<FileText size={20} />} title="Your library is empty">
                  Upload PDFs, documents, images, audio or video to begin.
                </EmptyState>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {d.recent_documents.map((doc) => (
                    <div className="mini-item" key={doc.id} onClick={() => navigate(`/app/documents/${doc.id}`)}>
                      <div className="mini-item-icon"><FileText size={15} /></div>
                      <div className="grow">
                        <div className="mini-item-title">{doc.title}</div>
                        <div className="mini-item-sub">
                          {doc.file_type.toUpperCase()} · {formatDate(doc.created_at)}
                        </div>
                      </div>
                      {doc.status === "ready" ? <span className="badge badge-success">ready</span> : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="dash-col col-4">
          <div className="dash-card">
            <div className="dash-card-head">
              <h2>Recent questions</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate("/app/conversations")}>
                <ArrowRight size={13} />
              </button>
            </div>
            <div className="dash-card-body">
              {d.recent_questions.length === 0 ? (
                <EmptyState icon={<MessageSquare size={20} />} title="No questions yet">
                  Ask your first research question in the workspace.
                </EmptyState>
              ) : (
                d.recent_questions.map((q) => (
                  <div className="mini-item" key={q.id} onClick={() => navigate(`/app/conversations/${q.conversation_id}`)}>
                    <div className="mini-item-icon"><MessageSquare size={15} /></div>
                    <div className="grow">
                      <div className="mini-item-title ellipsis">{q.content}</div>
                      <div className="mini-item-sub">{formatDate(q.created_at)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="dash-col col-4">
          <div className="dash-card">
            <div className="dash-card-head">
              <h2>Saved research notes</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate("/app/notes")}>
                <ArrowRight size={13} />
              </button>
            </div>
            <div className="dash-card-body">
              {d.saved_notes.length === 0 ? (
                <EmptyState icon={<StickyNote size={20} />} title="No notes saved">
                  Capture findings and attach cited passages.
                </EmptyState>
              ) : (
                d.saved_notes.map((n) => (
                  <div className="mini-item" key={n.id} onClick={() => navigate("/app/notes")}>
                    <div className="mini-item-icon">{n.pinned ? <Pin size={14} /> : <StickyNote size={15} />}</div>
                    <div className="grow">
                      <div className="mini-item-title ellipsis">{n.title}</div>
                      <div className="mini-item-sub">Updated {formatDate(n.updated_at)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}