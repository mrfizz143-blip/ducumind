import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  FlaskConical,
  FileText,
  FolderOpen,
  Search,
  StickyNote,
  MessageSquare,
  History,
  Settings,
  FilePlus2,
  CornerDownLeft,
  BookOpen,
} from "lucide-react";
import { useApp } from "../store";
import { api } from "../lib/api";

export default function CommandPalette() {
  const { setPaletteOpen } = useApp();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [docs, setDocs] = useState([]);
  const [sel, setSel] = useState(0);
  const inputRef = useRef(null);

  const COMMANDS = [
    { label: "Dashboard", to: "/app/dashboard", icon: LayoutDashboard, group: "Navigate" },
    { label: "Research Workspace", to: "/app/workspace", icon: FlaskConical, group: "Navigate" },
    { label: "Documents", to: "/app/documents", icon: FileText, group: "Navigate" },
    { label: "Collections", to: "/app/collections", icon: FolderOpen, group: "Navigate" },
    { label: "Global Search", to: "/app/search", icon: Search, group: "Navigate" },
    { label: "Notes", to: "/app/notes", icon: StickyNote, group: "Navigate" },
    { label: "Conversations", to: "/app/conversations", icon: MessageSquare, group: "Navigate" },
    { label: "History", to: "/app/history", icon: History, group: "Navigate" },
    { label: "Settings", to: "/app/settings", icon: Settings, group: "Navigate" },
  ];

  useEffect(() => {
    inputRef.current?.focus();
    api("/api/documents")
      .then((d) => setDocs(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    const nav = COMMANDS.filter((c) => !q || c.label.toLowerCase().includes(q));
    const matches = docs.filter(
      (d) => !q || d.title.toLowerCase().includes(q) || d.file_type.includes(q)
    );
    return [...nav, ...matches.map((d) => ({ label: d.title, to: `/app/documents/${d.id}`, icon: FileText, group: "Documents", sub: d.file_type }))];
  }, [query, docs]);

  useEffect(() => setSel(0), [query]);

  const onKey = (e) => {
    if (e.key === "Escape") setPaletteOpen(false);
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, filtered.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    if (e.key === "Enter" && filtered[sel]) {
      navigate(filtered[sel].to);
      setPaletteOpen(false);
    }
  };

  const groups = useMemo(() => {
    const map = {};
    filtered.forEach((c, i) => {
      if (!map[c.group]) map[c.group] = [];
      map[c.group].push({ ...c, _i: i });
    });
    return map;
  }, [filtered]);

  return (
    <div className="palette-backdrop" onClick={() => setPaletteOpen(false)}>
      <div className="palette" onClick={(e) => e.stopPropagation()} onKeyDown={onKey}>
        <div className="palette-input-row">
          <Search size={16} />
          <input
            ref={inputRef}
            className="palette-input"
            placeholder="Search documents, or jump to…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className="kbd">esc</span>
        </div>
        <div className="palette-results">
          {Object.entries(groups).map(([group, items]) => (
            <div key={group}>
              <div className="palette-group-label">{group}</div>
              {items.map((item) => (
                <button
                  key={item.to + item.label}
                  className={`palette-item ${item._i === sel ? "sel" : ""}`}
                  onMouseEnter={() => setSel(item._i)}
                  onClick={() => {
                    navigate(item.to);
                    setPaletteOpen(false);
                  }}
                >
                  <item.icon size={15} />
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {item.sub && <span className="muted" style={{ fontSize: 11 }}>{item.sub.toUpperCase()}</span>}
                </button>
              ))}
            </div>
          ))}
          {!filtered.length && (
            <div className="empty" style={{ padding: 24 }}>
              <p>No results for “{query}”</p>
            </div>
          )}
        </div>
        <div className="palette-footer">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><CornerDownLeft size={11} /> select</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span className="kbd">esc</span> close</span>
          <span style={{ marginLeft: "auto" }}>Documind</span>
        </div>
      </div>
    </div>
  );
}