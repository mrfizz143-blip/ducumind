import { useEffect } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { useApp } from "./store";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Workspace from "./pages/Workspace";
import Documents from "./pages/Documents";
import DocumentReader from "./pages/DocumentReader";
import Collections from "./pages/Collections";
import CollectionDetail from "./pages/CollectionDetail";
import SearchPage from "./pages/SearchPage";
import Notes from "./pages/Notes";
import Conversations from "./pages/Conversations";
import History from "./pages/History";
import Settings from "./pages/Settings";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import CommandPalette from "./components/CommandPalette";
import Toaster from "./components/Toaster";
import SourcePanel from "./components/SourcePanel";
import UploadDialog from "./components/UploadDialog";
import { useAuth } from "./store";

function AppShell() {
  const { paletteOpen, sidebarOpenMobile, setSidebarOpenMobile } = useApp();
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.dispatchEvent(new CustomEvent("palette:toggle"));
      }
      if (e.key === "Escape") setSidebarOpenMobile(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setSidebarOpenMobile]);

  useEffect(() => {
    const onAuth = () => navigate("/");
    window.addEventListener("auth:expired", onAuth);
    return () => window.removeEventListener("auth:expired", onAuth);
  }, [navigate]);

  return (
    <>
      <Sidebar />
      {sidebarOpenMobile && (
        <div className="modal-backdrop" style={{ zIndex: 90, alignItems: "flex-start" }} onClick={() => setSidebarOpenMobile(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <Sidebar embedded />
          </div>
        </div>
      )}
      <div className="workspace" id="workspace">
        <TopBar />
        <div className="content">
          <Routes>
            <Route path="/app/dashboard" element={<Dashboard />} />
            <Route path="/app/workspace" element={<Workspace />} />
            <Route path="/app/documents" element={<Documents />} />
            <Route path="/app/documents/:id" element={<DocumentReader />} />
            <Route path="/app/collections" element={<Collections />} />
            <Route path="/app/collections/:id" element={<CollectionDetail />} />
            <Route path="/app/search" element={<SearchPage />} />
            <Route path="/app/notes" element={<Notes />} />
            <Route path="/app/conversations" element={<Conversations />} />
            <Route path="/app/history" element={<History />} />
            <Route path="/app/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/app/dashboard" replace />} />
          </Routes>
        </div>
      </div>
      <SourcePanel />
      <UploadDialog />
      {paletteOpen && <CommandPalette />}
      <Toaster />
    </>
  );
}

export default function App() {
  const { authed } = useAuth();
  if (!authed) {
    return (
      <Routes>
        <Route path="*" element={<Auth />} />
      </Routes>
    );
  }
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/app/dashboard" replace />} />
      <Route path="*" element={<AppShell />} />
    </Routes>
  );
}