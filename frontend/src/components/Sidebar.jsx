import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
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
  ChevronsLeft,
  ChevronsRight,
  BookOpen,
  LogOut,
  Moon,
  Sun,
  Plus,
  FilePlus2,
} from "lucide-react";
import { useApp } from "../store";
import { initials } from "../lib/format";

const NAV = [
  { to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/app/workspace", label: "Workspace", icon: FlaskConical },
  { to: "/app/documents", label: "Documents", icon: FileText },
  { to: "/app/collections", label: "Collections", icon: FolderOpen },
  { to: "/app/search", label: "Search", icon: Search },
  { to: "/app/notes", label: "Notes", icon: StickyNote },
  { to: "/app/conversations", label: "Conversations", icon: MessageSquare },
  { to: "/app/history", label: "History", icon: History },
];

export default function Sidebar({ embedded = false }) {
  const {
    user,
    logout,
    theme,
    setTheme,
    sidebarCollapsed,
    setSidebarCollapsed,
    setPaletteOpen,
    pushToast,
  } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [workspaceName, setWorkspaceName] = useState("Personal Research");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const triggerUpload = () => document.dispatchEvent(new CustomEvent("upload:open"));
  const triggerNewNote = () => {
    pushToast("Create a note from a passage to attach citations", "info");
    navigate("/app/notes");
  };

  return (
    <aside className={`sidebar ${sidebarCollapsed ? "collapsed" : ""} ${embedded ? "open" : "desktop-only"}`} ref={menuRef}>
      <div className="sidebar-brand">
        <div className="brand-mark" style={{ background: theme === "dark" ? "#16171c" : "#191a1e" }}>
          <BookOpen size={16} strokeWidth={2.2} />
        </div>
        {!sidebarCollapsed && (
          <div style={{ minWidth: 0 }}>
            <div className="brand-name">Documind</div>
            <div className="brand-tag">Research Workspace</div>
          </div>
        )}
      </div>

      <div className="sidebar-scroll">
        {!sidebarCollapsed && (
          <div style={{ padding: "0 4px 8px" }}>
            <button
              className="btn btn-secondary"
              style={{ width: "100%", justifyContent: "space-between" }}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span className="ellipsis" style={{ fontSize: 12, fontWeight: 600 }}>
                {workspaceName}
              </span>
              <span className="kbd">⌄</span>
            </button>
            {menuOpen && (
              <div className="menu" style={{ position: "static", marginTop: 6, width: "100%" }}>
                <button className="menu-item" onClick={() => { setWorkspaceName("Personal Research"); setMenuOpen(false); }}>
                  <BookOpen size={15} /> Personal Research
                </button>
                <button className="menu-item" onClick={() => { setWorkspaceName("Shared Library"); setMenuOpen(false); }}>
                  <FolderOpen size={15} /> Shared Library
                </button>
                <div className="menu-sep" />
                <button className="menu-item" onClick={() => { setMenuOpen(false); navigate("/app/settings"); }}>
                  <Settings size={15} /> Manage workspace
                </button>
              </div>
            )}
          </div>
        )}

        {!sidebarCollapsed && <div className="sidebar-group-label">Research</div>}
        {NAV.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
              data-tip={sidebarCollapsed ? item.label : undefined}
            >
              <Icon />
              <span>{item.label}</span>
            </NavLink>
          );
        })}

        {!sidebarCollapsed && <div className="sidebar-group-label">Create</div>}
        <button className="nav-item" onClick={triggerUpload} data-tip={sidebarCollapsed ? "Upload" : undefined}>
          <FilePlus2 />
          <span>Upload document</span>
        </button>
        <button className="nav-item" onClick={triggerNewNote} data-tip={sidebarCollapsed ? "New note" : undefined}>
          <Plus />
          <span>New note</span>
        </button>

        {!sidebarCollapsed && <div className="sidebar-group-label">System</div>}
        <NavLink
          to="/app/settings"
          className={({ isActive }) => `nav-item ${location.pathname.startsWith("/app/settings") ? "active" : ""}`}
          data-tip={sidebarCollapsed ? "Settings" : undefined}
        >
          <Settings />
          <span>Settings</span>
        </NavLink>
      </div>

      <div className="sidebar-footer">
        {!sidebarCollapsed && (
          <div className="user-chip">
            <div className="avatar">{initials(user?.full_name)}</div>
            <div style={{ minWidth: 0 }}>
              <div className="user-name">{user?.full_name}</div>
              <div className="user-email">{user?.email}</div>
            </div>
          </div>
        )}
        {!sidebarCollapsed && (
          <button
            className="btn-icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            data-tip={theme === "dark" ? "Light mode" : "Dark mode"}
          >
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        )}
        <button className="btn-icon" onClick={() => setSidebarCollapsed((v) => !v)} data-tip={sidebarCollapsed ? "Expand" : "Collapse"}>
          {sidebarCollapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
        </button>
        <button className="btn-icon" onClick={logout} data-tip="Sign out" style={{ color: "var(--danger)" }}>
          <LogOut size={15} />
        </button>
      </div>
    </aside>
  );
}