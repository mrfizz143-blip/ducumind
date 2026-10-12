import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  Sparkles,
  FileText,
  GitCompareArrows,
  ListChecks,
  Microscope,
  Target,
  BarChart3,
  BookMarked,
  Library,
  List,
  ScrollText,
  ArrowUp,
  Wand2,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { useApp } from "../store";
import { api, API, getToken } from "../lib/api";
import ChatMessage from "../components/ChatMessage";
import { DocTypeIcon } from "../components/Shared";

const TOOLS = [
  { id: "summarize", label: "Summarize document", icon: ScrollText, needs: 1 },
  { id: "compare", label: "Compare documents", icon: GitCompareArrows, needs: 2 },
  { id: "extract-findings", label: "Extract key findings", icon: ListChecks, needs: 1 },
  { id: "extract-methodology", label: "Extract methodology", icon: Microscope, needs: 1 },
  { id: "extract-objectives", label: "Extract objectives", icon: Target, needs: 1 },
  { id: "extract-results", label: "Extract results", icon: BarChart3, needs: 1 },
  { id: "notes", label: "Generate research notes", icon: BookMarked, needs: 1 },
  { id: "literature", label: "Literature review", icon: Library, needs: 1 },
  { id: "references", label: "Generate references", icon: List, needs: 1 },
  { id: "similar", label: "Find similar sources", icon: Search, needs: 1 },
];

function toolRequest(tool, docIds, focus) {
  switch (tool) {
    case "summarize":
      return { path: "/api/tools/summarize", body: { document_id: docIds[0], length: "medium" }, kind: "summary" };
    case "compare":
      return { path: "/api/tools/compare", body: { document_a_id: docIds[0], document_b_id: docIds[1] }, kind: "compare" };
    case "extract-findings":
      return { path: "/api/tools/extract", body: { document_id: docIds[0], kind: "findings" }, kind: "text" };
    case "extract-methodology":
      return { path: "/api/tools/extract", body: { document_id: docIds[0], kind: "methodology" }, kind: "text" };
    case "extract-objectives":
      return { path: "/api/tools/extract", body: { document_id: docIds[0], kind: "objectives" }, kind: "text" };
    case "extract-results":
      return { path: "/api/tools/extract", body: { document_id: docIds[0], kind: "results" }, kind: "text" };
    case "notes":
      return { path: "/api/tools/research-notes", body: { document_ids: docIds, prompt: "" }, kind: "notes" };
    case "literature":
      return { path: "/api/tools/literature-review", body: { document_ids: docIds, focus: focus || "" }, kind: "text" };
    case "references":
      return { path: "/api/tools/references", body: { document_ids: docIds }, kind: "references" };
    case "similar":
      return { path: "/api/tools/similar", body: { document_id: docIds[0], top_k: 5 }, kind: "similar" };
    default:
      return null;
  }
}

export default function Workspace() {
  const { pushToast, openPanel } = useApp();
  const location = useLocation();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [docs, setDocs] = useState([]);
  const [scope, setScope] = useState([]);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [toolOpen, setToolOpen] = useState(false);
  const [selectedTool, setSelectedTool] = useState(null);
  const [toolDocIds, setToolDocIds] = useState([]);
  const [toolFocus, setToolFocus] = useState("");
  const [toolBusy, setToolBusy] = useState(false);
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);
  const toolMenuRef = useRef(null);

  const send = useCallback(
    async (text) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      setInput("");
      setBusy(true);
      setMessages((m) => [...m, { id: `u-${Date.now()}`, role: "user", content: trimmed }]);
      const assistant = { id: `a-${Date.now()}`, role: "assistant", content: "", streaming: true };
      setMessages((m) => [...m, assistant]);

      try {
        const res = await fetch(`${API}/api/chat/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
          body: JSON.stringify({ conversation_id: conversationId, message: trimmed, document_ids: scope, top_k: 6 }),
        });
        if (!res.ok || !res.body) throw new Error("Stream failed");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let final = null;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buffer.indexOf("\n\n")) >= 0) {
            const chunk = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            if (!chunk.startsWith("data: ")) continue;
            try {
              const evt = JSON.parse(chunk.slice(6));
              if (evt.type === "delta") {
                setMessages((m) => m.map((msg) => (msg.id === assistant.id ? { ...msg, content: msg.content + evt.text } : msg)));
              } else if (evt.type === "done") {
                final = evt;
                setConversationId(evt.conversation_id);
              } else if (evt.type === "error") {
                throw new Error(evt.message);
              }
            } catch {}
          }
        }
        if (final) {
          setMessages((m) =>
            m.map((msg) =>
              msg.id === assistant.id
                ? {
                    ...msg,
                    content: final.message?.content || msg.content,
                    streaming: false,
                    citations_json: JSON.stringify(final.citations || []),
                    sources_json: JSON.stringify(final.sources || []),
                  }
                : msg
            )
          );
          if (final.citations?.length) {
            openPanel({ kind: "citations", title: "Retrieved sources", sources: final.sources || [] });
          }
        } else {
          setMessages((m) => m.map((msg) => (msg.id === assistant.id ? { ...msg, streaming: false } : msg)));
        }
      } catch (e) {
        setMessages((m) => m.map((msg) => (msg.id === assistant.id ? { ...msg, content: `⚠ ${e.message}`, streaming: false } : msg)));
        pushToast(e.message, "error");
      } finally {
        setBusy(false);
        setTimeout(() => scrollRef.current?.scrollTo({ top: 999999, behavior: "smooth" }), 50);
      }
    },
    [busy, conversationId, scope, openPanel, pushToast]
  );

  useEffect(() => {
    api("/api/documents")
      .then((d) => setDocs(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const initial = location.state?.initialPrompt;
    if (initial) {
      send(initial);
      window.history.replaceState({}, "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 999999 });
  }, [messages.length]);

  useEffect(() => {
    const closeMenu = (e) => {
      if (toolMenuRef.current && !toolMenuRef.current.contains(e.target)) setToolOpen(false);
    };
    document.addEventListener("mousedown", closeMenu);
    return () => document.removeEventListener("mousedown", closeMenu);
  }, []);

  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const runTool = async () => {
    if (!selectedTool || !toolDocIds.length) return;
    const req = toolRequest(selectedTool.id, toolDocIds, toolFocus);
    if (!req) return;
    setToolBusy(true);
    try {
      const res = await api(req.path, { method: "POST", body: req.body });
      let content = "";
      let citations = [];
      if (req.kind === "summary") content = `**Summary**\n\n${res.summary}`;
      if (req.kind === "compare") content = `**Document comparison**\n\n${res.narrative}`;
      if (req.kind === "text") content = res.content;
      if (req.kind === "notes") content = res.notes;
      if (req.kind === "references") {
        content = "**Generated references**\n\n" + res.references.map((r) => `[${r.type}] ${r.citation}`).join("\n");
      }
      if (req.kind === "similar") {
        content = "**Similar sources found**\n\n" + res.map((s, i) => `${i + 1}. ${s.document_title} — ${(s.score * 100).toFixed(0)}% relevant`).join("\n");
        citations = res.map((s, i) => ({ number: i + 1, chunk_id: s.chunk_id, document_id: s.document_id, document_title: s.document_title, excerpt: s.content, relevance: s.score }));
      }
      setMessages((m) => [
        ...m,
        { id: `t-${Date.now()}`, role: "assistant", content, streaming: false, citations_json: JSON.stringify(citations), sources_json: citations.length ? JSON.stringify(citations) : "[]" },
      ]);
      setToolOpen(false);
      setToolBusy(false);
      setSelectedTool(null);
      setToolDocIds([]);
      setToolFocus("");
    } catch (e) {
      pushToast(e.message, "error");
      setToolBusy(false);
    }
  };

  const activeTool = TOOLS.find((t) => t.id === selectedTool?.id);
  const readyDocs = docs.filter((d) => d.status === "ready");

  return (
    <div className="workspace-layout" style={{ height: "100%" }}>
      <div className="workspace-main">
        <div className="workspace-toolbar">
          <div ref={toolMenuRef} style={{ position: "relative" }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setToolOpen((v) => !v)}>
              <Wand2 size={14} /> Research tools <span className="kbd">⌄</span>
            </button>
            {toolOpen && (
              <div className="menu" style={{ top: "calc(100% + 6px)", left: 0, width: 240 }}>
                {TOOLS.map((t) => (
                  <button
                    key={t.id}
                    className="menu-item"
                    onClick={() => {
                      setSelectedTool(t);
                      setToolDocIds([]);
                    }}
                  >
                    <t.icon size={15} /> {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ position: "relative" }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setScopeOpen((v) => !v)} data-tip="Scope retrieval">
              <FileText size={14} />
              {scope.length ? `${scope.length} scoped` : "All documents"}
              <span className="kbd">⌄</span>
            </button>
            {scopeOpen && (
              <div className="menu" style={{ top: "calc(100% + 6px)", left: 0, width: 300, maxHeight: 380, overflowY: "auto" }}>
                <div className="palette-group-label">Scope the search to documents</div>
                {readyDocs.map((d) => (
                  <label key={d.id} className="menu-item" style={{ cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={scope.includes(d.id)}
                      onChange={() => setScope((s) => (s.includes(d.id) ? s.filter((x) => x !== d.id) : [...s, d.id]))}
                    />
                    <span className="ellipsis" style={{ flex: 1 }}>{d.title}</span>
                    <DocTypeIcon type={d.file_type} size={13} />
                  </label>
                ))}
                {!readyDocs.length && <div className="muted" style={{ padding: 12, fontSize: 12 }}>No indexed documents yet.</div>}
                <button className="menu-item" onClick={() => setScope([])} style={{ color: "var(--accent)" }}>
                  <X size={14} /> Clear scope
                </button>
              </div>
            )}
          </div>

          <div className="grow" />
          <button className="btn btn-ghost btn-sm" onClick={() => openPanel({ kind: "sources", title: "Context", sources: [] })}>
            Context panel
          </button>
        </div>

        <div className="workspace-body" ref={scrollRef}>
          <div className="chat-scroll">
            {messages.length === 0 && (
              <div className="empty" style={{ padding: "var(--s-9) var(--s-6)" }}>
                <div className="empty-icon"><Sparkles size={24} /></div>
                <h3>Research workspace</h3>
                <p>
                  Ask a research question and Documind will retrieve the most relevant passages
                  from your library, ground the answer in them, and cite every claim.
                </p>
              </div>
            )}
            {messages.map((m) => (
              <ChatMessage key={m.id} message={m} streaming={m.streaming} />
            ))}
          </div>
        </div>

        <div className="chat-composer-wrap">
          <div className="chat-composer">
            <textarea
              ref={textareaRef}
              rows={2}
              placeholder="Ask a research question… (Enter to send, Shift+Enter for a new line)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              disabled={busy}
            />
            <div className="chat-composer-actions">
              <div className="chat-scope">
                {scope.length ? `Searching ${scope.length} scoped document${scope.length > 1 ? "s" : ""}` : "Searching your full library"}
                {busy && <Loader2 size={12} className="spin" />}
              </div>
              <button className="btn btn-primary btn-sm" disabled={!input.trim() || busy} onClick={() => send(input)}>
                <ArrowUp size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {selectedTool && (
        <div className="modal-backdrop" onClick={() => setSelectedTool(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{activeTool.label}</h3>
              <button className="btn-icon" onClick={() => setSelectedTool(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              {activeTool.needs === 2 && (
                <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
                  Select the two documents to compare (in order).
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 260, overflowY: "auto" }}>
                {readyDocs.map((d) => (
                  <label key={d.id} className="list-item" style={{ border: "1px solid var(--border)", background: toolDocIds.includes(d.id) ? "var(--accent-softer)" : "var(--surface)", cursor: "pointer" }}>
                    <input
                      type={activeTool.needs === 2 ? "checkbox" : "radio"}
                      name="tooldoc"
                      checked={toolDocIds.includes(d.id)}
                      onChange={() => {
                        if (activeTool.needs === 2) {
                          setToolDocIds((ids) => (ids.includes(d.id) ? ids.filter((x) => x !== d.id) : [...ids, d.id].slice(-2)));
                        } else {
                          setToolDocIds([d.id]);
                        }
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="mini-item-title">{d.title}</div>
                      <div className="mini-item-sub">{d.file_type.toUpperCase()}</div>
                    </div>
                  </label>
                ))}
              </div>
              {activeTool.id === "literature" && (
                <div className="field" style={{ marginTop: 12 }}>
                  <label>Focus (optional)</label>
                  <input className="input" value={toolFocus} onChange={(e) => setToolFocus(e.target.value)} placeholder="e.g. methodology, climate, networks" />
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSelectedTool(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={toolDocIds.length < activeTool.needs || toolBusy} onClick={runTool}>
                {toolBusy && <Loader2 size={14} className="spin" />}
                Run {activeTool.label}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}