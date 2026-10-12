import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { clearSession, getToken, getUser, setSession } from "./lib/api";

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [user, setUser] = useState(getUser());
  const [theme, setTheme] = useState(() => localStorage.getItem("marginalia_theme") || "light");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("marginalia_sidebar") === "1");
  const [sidebarOpenMobile, setSidebarOpenMobile] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelContent, setPanelContent] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [jobs, setJobs] = useState([]);

  const toastId = useRef(0);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("marginalia_theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("marginalia_sidebar", sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);

  const pushToast = useCallback((message, type = "info") => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);

  const login = useCallback((token, userObj) => {
    setSession(token, userObj);
    setUser(userObj);
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  const openPanel = useCallback((content) => {
    setPanelContent(content);
    setPanelOpen(true);
  }, []);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    setPanelContent(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      login,
      logout,
      theme,
      setTheme,
      sidebarCollapsed,
      setSidebarCollapsed,
      sidebarOpenMobile,
      setSidebarOpenMobile,
      panelOpen,
      openPanel,
      closePanel,
      panelContent,
      paletteOpen,
      setPaletteOpen,
      toasts,
      pushToast,
      jobs,
      setJobs,
    }),
    [user, login, logout, theme, sidebarCollapsed, sidebarOpenMobile, panelOpen, openPanel, closePanel, panelContent, paletteOpen, toasts, pushToast, jobs]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  return useContext(AppContext);
}

export function useAuth() {
  const { user } = useApp();
  const token = getToken();
  return { user, token, authed: !!token };
}