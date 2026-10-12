import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Search,
  ZoomIn,
  ZoomOut,
  Quote,
  Wand2,
  BookmarkPlus,
  MessageSquarePlus,
  Microscope,
  FileText,
} from "lucide-react";
import { api } from "../lib/api";
import { useApp } from "../store";
import { formatBytes } from "../lib/format";
import { AudioViewer, VideoViewer, ImageViewer, MetadataTable } from "../components/MediaViewers";
import { DocTypeIcon } from "../components/Shared";

const MEDIA_TYPES = {
  image: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "tiff"],
  audio: ["mp3", "wav", "m4a", "aac", "ogg", "flac"],
  video: ["mp4", "mov", "mkv", "webm", "avi"],
};

function isMedia(doc) {
  const t = doc.file_type;
  if (MEDIA_TYPES.audio.includes(t)) return "audio";
  if (MEDIA_TYPES.video.includes(t)) return "video";
  if (MEDIA_TYPES.image.includes(t)) return "image";
  return null;
}

export default function DocumentReader() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { pushToast, openPanel } = useApp();
  const [doc, setDoc] = useState(null);
  const [passages, setPassages] = useState([]);
  const [highlights, setHighlights] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [docSearch, setDocSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [toc, setToc] = useState([]);
  const contentRef = useRef(null);

  useEffect(() => {
    let alive = true;
    api(`/api/documents/${id}`)
      .then((d) => {
        if (!alive) return;
        setDoc(d);
        try {
          setToc(JSON.parse(d.toc_json || "[]"));
        } catch {}
      })
      .catch((e) => pushToast(e.message, "error"));
    api(`/api/documents/${id}/highlights`)
      .then((h) => alive && setHighlights(h))
      .catch(() => {});
    api(`/api/documents/${id}/passages`)
      .then((p) => alive && setPassages(Array.isArray(p) ? p : []))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id, pushToast]);

  useEffect(() => {
    const hl = location.state?.highlightChunk;
    if (hl && highlights) {
      const found = highlights.passages.find((p) => p.chunk_id === hl);
      if (found) setSelected(found);
    }
  }, [location.state, highlights]);

  if (!doc) {
    return (
      <div className="page wide">
        <div className="reader-topbar">
          <div className="skeleton" style={{ height: 34, width: 200 }} />
        </div>
        <div style={{ padding: 24 }}>
          <div className="skeleton" style={{ height: 18, margin: 12 }} />
          <div className="skeleton" style={{ height: 18, margin: 12, width: "92%" }} />
          <div className="skeleton" style={{ height: 18, margin: 12, width: "80%" }} />
          <div className="skeleton" style={{ height: 18, margin: 12 }} />
        </div>
      </div>
    );
  }

  const mediaKind = isMedia(doc);

  return (
    <div className="reader-layout">
      <div className="reader-topbar">
        <button className="btn-icon" onClick={() => navigate("/app/documents")}><ArrowLeft size={16} /></button>
        <div style={{ minWidth: 0 }}>
          <div className="ellipsis" style={{ fontSize: 15, fontWeight: 650 }}>{doc.title}</div>
          <div className="reader-meta">
            <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}><DocTypeIcon type={doc.file_type} size={13} /> {doc.file_type.toUpperCase()}</span>
            <span>·</span>
            <span>{formatBytes(doc.size_bytes)}</span>
            {doc.page_count ? <><span>·</span><span>{doc.page_count} pages</span></> : null}
            {doc.author ? <><span>·</span><span>{doc.author}</span></> : null}
            {doc.duration_seconds ? <><span>·</span><span>{Math.round(doc.duration_seconds)}s</span></> : null}
          </div>
        </div>
        <div className="grow" />
        {!mediaKind && (
          <>
            <div className="search-box" style={{ width: 180 }}>
              <Search size={13} />
              <input className="input" style={{ paddingLeft: 30, paddingRight: 8, height: 30 }} placeholder="Find in document" value={docSearch} onChange={(e) => setDocSearch(e.target.value)} />
            </div>
            <div className="seg">
              <button onClick={() => setZoom((z) => Math.max(0.8, +(z - 0.1).toFixed(2)))}><ZoomOut size={14} /></button>
              <button onClick={() => setZoom((z) => Math.min(1.4, +(z + 0.1).toFixed(2)))}><ZoomIn size={14} /></button>
            </div>
          </>
        )}
        <button className="btn btn-secondary btn-sm" onClick={() => openPanel({ kind: "citations", title: doc.title, sources: [] })}>
          <FileText size={13} /> Metadata
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => navigate("/app/workspace", { state: { initialPrompt: `Summarize the document "${doc.title}"` } })}>
          <MessageSquarePlus size={13} /> Ask AI
        </button>
      </div>

      {mediaKind === "audio" && <AudioViewer doc={doc} passages={passages} />}
      {mediaKind === "video" && <VideoViewer doc={doc} passages={passages} />}
      {mediaKind === "image" && <ImageViewer doc={doc} passages={passages} />}

      {!mediaKind && (
        <div className="reader-main">
          <div className="reader-toc">
            <h4>Contents</h4>
            {toc.length ? (
              toc.map((t, i) => (
                <button key={i} className="toc-item" onClick={() => jumpToSection(contentRef, t.title)}>
                  {t.title}
                </button>
              ))
            ) : (
              <div className="muted" style={{ fontSize: 12 }}>No headings detected.</div>
            )}
            <div className="divider" />
            <h4 style={{ marginTop: 8 }}>Cited passages</h4>
            {highlights?.passages?.length ? (
              highlights.passages.slice(0, 12).map((p) => (
                <button key={p.chunk_id} className="toc-item" onClick={() => setSelected(p)} title={p.preview}>
                  <span className="cite" style={{ minWidth: 14, height: 14, fontSize: 9, marginRight: 6 }}>{p.chunk_id}</span>
                  <span className="ellipsis">{p.preview.slice(0, 40)}</span>
                </button>
              ))
            ) : (
              <div className="muted" style={{ fontSize: 12 }}>No highlighted passages yet.</div>
            )}
          </div>

          <div className="reader-content" ref={contentRef}>
            <TextDocument
              text={doc.extracted_text}
              highlights={highlights?.passages || []}
              searchQ={docSearch}
              zoom={zoom}
              selected={selected}
              onSelect={setSelected}
            />
          </div>
        </div>
      )}

      {selected && (
        <PassageBar
          passage={selected}
          doc={doc}
          onClose={() => setSelected(null)}
          onExplain={async () => {
            try {
              const res = await api("/api/tools/explain", { method: "POST", body: { chunk_id: selected.chunk_id, document_id: doc.id } });
              openPanel({ kind: "citations", title: "Passage explanation", sources: [{ chunk_id: selected.chunk_id, document_id: doc.id, document_title: doc.title, content: res.explanation }] });
            } catch (e) {
              pushToast(e.message, "error");
            }
          }}
          onAskAI={() => {
            navigate("/app/workspace", { state: { initialPrompt: `Explain this passage from "${doc.title}": "${selected.preview || selected.content}"` } });
          }}
          onCite={() => {
            const ref = `(${doc.title}, ${selected.page ? `p. ${selected.page}` : `t=${selected.timestamp}s`})`;
            navigator.clipboard?.writeText(ref).catch(() => {});
            pushToast("Citation copied to clipboard", "success");
          }}
          onSaveNote={async () => {
            try {
              await api("/api/notes", { method: "POST", body: { title: `Note on ${doc.title}`, body: selected.preview || selected.content, source_ids: [selected.chunk_id] } });
              pushToast("Note saved with source attached", "success");
            } catch (e) {
              pushToast(e.message, "error");
            }
          }}
        />
      )}
    </div>
  );
}

function jumpToSection(ref, title) {
  const paras = ref.current?.querySelectorAll("p");
  paras?.forEach((p) => {
    if (p.textContent.includes(title.slice(0, 30))) {
      p.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
}

function TextDocument({ text, highlights, searchQ, zoom, selected, onSelect }) {
  const paras = useMemo(() => {
    const parts = text.split(/\n{2,}/);
    let offset = 0;
    const out = [];
    for (const part of parts) {
      const start = offset;
      const end = start + part.length;
      offset = end + 2;
      const hit = highlights.find((h) => h.start_char < end && h.end_char > start);
      out.push({ text: part, start, end, chunkId: hit?.chunk_id || null, page: hit?.page || 0, preview: hit?.preview || part.slice(0, 160), timestamp: hit?.timestamp || 0 });
    }
    return out.filter((p) => p.text.trim());
  }, [text, highlights]);

  const searchRe = useMemo(() => {
    if (!searchQ.trim()) return null;
    try {
      return new RegExp(`(${searchQ.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    } catch {
      return null;
    }
  }, [searchQ]);

  return (
    <div className="reader-doc" style={{ fontSize: `${16 * zoom}px` }}>
      {paras.map((p, i) => {
        const isSel = selected && p.chunkId === selected.chunk_id;
        return (
          <div key={i}>
            <p
              className={`reader-sent ${isSel ? "selected-passage" : ""}`}
              onClick={() => p.chunkId && onSelect({ ...p, content: p.text })}
              title={p.chunkId ? "Click for passage actions" : undefined}
            >
              {renderPara(p.text, p.chunkId, searchRe)}
            </p>
            {p.page ? <div className="reader-page-marker">— page {p.page}</div> : null}
          </div>
        );
      })}
    </div>
  );
}

function renderPara(text, chunkId, searchRe) {
  if (!searchRe) return chunkId ? <span className="reader-highlight">{text}</span> : text;
  const bits = text.split(searchRe);
  return bits.map((bit, i) => {
    if (bit.match(searchRe)) return <mark key={i}>{bit}</mark>;
    return chunkId ? <span className="reader-highlight" key={i}>{bit}</span> : bit;
  });
}

function PassageBar({ passage, doc, onClose, onExplain, onAskAI, onCite, onSaveNote }) {
  return (
    <div className="passage-bar">
      <div style={{ minWidth: 0 }}>
        <div className="ellipsis" style={{ fontSize: 13, fontWeight: 600 }}>
          Passage {passage.chunk_id} {passage.page ? `· p.${passage.page}` : ""} {passage.timestamp ? `· ${passage.timestamp}s` : ""}
        </div>
        <div className="ellipsis" style={{ fontSize: 12, color: "var(--text-3)" }}>
          {passage.preview || passage.content}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button className="btn btn-secondary btn-sm" onClick={onExplain}><Microscope size={13} /> Explain</button>
        <button className="btn btn-secondary btn-sm" onClick={onAskAI}><Wand2 size={13} /> Ask AI</button>
        <button className="btn btn-secondary btn-sm" onClick={onCite}><Quote size={13} /> Cite</button>
        <button className="btn btn-secondary btn-sm" onClick={onSaveNote}><BookmarkPlus size={13} /> Save note</button>
        <button className="btn-icon" onClick={onClose}>×</button>
      </div>
    </div>
  );
}