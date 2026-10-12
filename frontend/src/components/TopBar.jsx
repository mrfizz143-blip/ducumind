import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Search, Upload, Menu, PanelRight } from "lucide-react";
import { useApp } from "../store";
import { api } from "../lib/api";

const TITLES = {
  "/app/dashboard": "Dashboard",
  "/app/workspace": "Research Workspace",
  "/app/documents": "Documents",
  "/app/collections": "Collections",
  "/app/search": "Search",
  "/app/notes": "Notes",
  "/app/conversations": "Conversations",
  "/app/history": "History",
  "/app/settings": "Settings",
};

export default function TopBar() {
  const { setPaletteOpen, setSidebarOpenMobile, panelOpen, openPanel } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [processingCount, setProcessingCount] = useState(0);

  const title = TITLES[location.pathname] || "Documind";

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const data = await api("/api/jobs");
        if (alive) setProcessingCount(data.filter((j) => j.status === "running").length);
      } catch {}
    };
    tick();
    const t = setInterval(tick, 6000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <header className="topbar">
      <button className="btn-icon mobile-only" onClick={() => setSidebarOpenMobile(true)}>
        <Menu size={18} />
      </button>
      <div className="topbar-title">{title}</div>
      {location.pathname.startsWith("/app/documents/") && <span className="topbar-breadcrumb">/ reader</span>}
      <div className="grow" />
      {processingCount > 0 && (
        <button
          className="btn btn-soft btn-sm"
          onClick={() => openPanel({ kind: "processing" })}
          style={{ gap: 6 }}
        >
          <span style={{ width: 8, height: 8, borderRadius: 99, background: "var(--accent)", display: "inline-block", animation: "blink 1.4s infinite both" }} />
          {processingCount} processing
        </button>
      )}
      <button className="btn btn-secondary btn-sm" onClick={() => navigate("/app/search")} data-tip="Search">
        <Search size={14} /> <span className="hide-mobile">Search</span> <span className="kbd">/</span>
      </button>
      <button className="btn btn-primary btn-sm" onClick={() => document.dispatchEvent(new CustomEvent("upload:open"))}>
        <Upload size={14} /> Upload
      </button>
      {!panelOpen && (
        <button className="btn-icon" onClick={() => openPanel({ kind: "sources", sources: [], title: "Context" })} data-tip="Context panel">
          <PanelRight size={17} />
        </button>
      )}
    </header>
  );
}