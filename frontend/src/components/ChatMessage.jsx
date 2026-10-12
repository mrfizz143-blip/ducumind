import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, BookmarkPlus, Check, BookOpen } from "lucide-react";
import { useState } from "react";
import { useApp } from "../store";
import { api } from "../lib/api";

export function renderCitations(text, citations, onCite) {
  if (!citations || !citations.length) return text;
  const parts = text.split(/(\[\d+\])/g);
  return parts.map((part, i) => {
    const m = part.match(/\[(\d+)\]/);
    if (m) {
      const num = parseInt(m[1], 10);
      const cite = citations.find((c) => c.number === num);
      if (!cite) return part;
      return (
        <span
          key={i}
          className="cite"
          title={cite.document_title}
          onClick={() => onCite && onCite(cite)}
        >
          {num}
        </span>
      );
    }
    return part;
  });
}

export default function ChatMessage({ message, streaming }) {
  const { openPanel, pushToast } = useApp();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const citations = useMemo(() => {
    try {
      return JSON.parse(message.citations_json || "[]");
    } catch {
      return message.citations || [];
    }
  }, [message.citations_json, message.citations]);

  const sources = useMemo(() => {
    try {
      return JSON.parse(message.sources_json || "[]");
    } catch {
      return message.sources || [];
    }
  }, [message.sources_json, message.sources]);

  const isUser = message.role === "user";

  const onCite = (cite) => {
    openPanel({
      kind: "citations",
      title: `Citations — ${cite.document_title}`,
      sources: [
        {
          chunk_id: cite.chunk_id,
          document_id: cite.document_id,
          document_title: cite.document_title,
          file_type: cite.file_type,
          page: cite.page,
          timestamp: cite.timestamp,
          section: "",
          content: cite.excerpt,
          score: cite.relevance,
        },
      ],
    });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {}
  };

  const saveNote = async () => {
    try {
      await api("/api/notes", {
        method: "POST",
        body: {
          title: (message.content || "").slice(0, 48) || "Untitled note",
          body: message.content || "",
          source_ids: citations.map((c) => c.chunk_id),
        },
      });
      pushToast("Note saved with citations attached", "success");
    } catch (e) {
      pushToast(e.message, "error");
    }
  };

  if (isUser) {
    return (
      <div className="msg msg-user">
        <div className="msg-avatar">You</div>
        <div className="msg-body">
          <div className="msg-name">You</div>
          <div className="msg-bubble">{message.content}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="msg msg-ai">
      <div className="msg-avatar"><BookOpen size={15} /></div>
      <div className="msg-body">
        <div className="msg-name">Documind</div>
        <div className="msg-bubble serif">
          {streaming && !message.content ? (
            <div className="typing-dots"><span /><span /><span /></div>
          ) : (
            renderCitations(message.content || "", citations, onCite)
          )}
        </div>

        {!streaming && citations.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            {citations.slice(0, 6).map((c) => (
              <button
                key={c.number}
                className="chip"
                onClick={onCite}
                title={c.excerpt}
              >
                <span className="cite" style={{ minWidth: 16, height: 16, fontSize: 10 }}>{c.number}</span>
                <span className="ellipsis" style={{ maxWidth: 140 }}>{c.document_title}</span>
                {c.page ? <span className="muted">p.{c.page}</span> : null}
              </button>
            ))}
            {citations.length > 0 && (
              <button
                className="chip"
                onClick={() =>
                  openPanel({ kind: "citations", title: "Retrieved sources", sources })
                }
              >
                {sources.length} sources <span className="muted">→</span>
              </button>
            )}
          </div>
        )}

        <div className="msg-actions">
          <button className="btn-icon sm" data-tip="Copy" onClick={copy}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
          <button className="btn-icon sm" data-tip="Save as note" onClick={saveNote}>
            <BookmarkPlus size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}