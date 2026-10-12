import { useEffect, useState } from "react";
import { Moon, Sun, Palette, KeyRound, ShieldCheck, Info } from "lucide-react";
import { useApp } from "../store";
import { api } from "../lib/api";
import { useApi } from "../components/Shared";

export default function Settings() {
  const { theme, setTheme, pushToast } = useApp();
  const { data: me } = useApi(() => api("/api/auth/me"), []);
  const { data: dashboard } = useApi(() => api("/api/dashboard"), []);
  const [systemInfo, setSystemInfo] = useState(null);

  useEffect(() => {
    api("/")
      .then((r) => setSystemInfo(r))
      .catch(() => {});
  }, []);

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <div className="page-head">
        <h1>Settings</h1>
        <div className="sub">Appearance, account and system information.</div>
      </div>

      <div className="settings-group">
        <div className="settings-group-head"><h3>Appearance</h3></div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Theme</div>
            <div className="settings-row-desc">Match your environment. Stored on this device.</div>
          </div>
          <div className="seg">
            <button className={theme === "light" ? "active" : ""} onClick={() => setTheme("light")}><Sun size={13} /> Light</button>
            <button className={theme === "dark" ? "active" : ""} onClick={() => setTheme("dark")}><Moon size={13} /> Dark</button>
          </div>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-head"><h3>Account</h3></div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Full name</div>
            <div className="settings-row-desc">{me?.full_name || "…"}</div>
          </div>
          <Palette size={15} className="muted" />
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Email</div>
            <div className="settings-row-desc">{me?.email || "…"}</div>
          </div>
          <KeyRound size={15} className="muted" />
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Your library</div>
            <div className="settings-row-desc">
              {dashboard?.stats?.documents ?? 0} documents · {dashboard?.stats?.collections ?? 0} collections · {dashboard?.stats?.notes ?? 0} notes
            </div>
          </div>
          <ShieldCheck size={15} style={{ color: "var(--success)" }} />
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-head"><h3>System</h3></div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Backend service</div>
            <div className="settings-row-desc">{systemInfo ? `${systemInfo.service} · v${systemInfo.version}` : "checking…"}</div>
          </div>
          <span className="badge badge-success">online</span>
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Retrieval engine</div>
            <div className="settings-row-desc">Hybrid semantic + keyword retrieval with reranking, citation validation, and user-scoped data isolation.</div>
          </div>
          <Info size={15} className="muted" />
        </div>
      </div>
    </div>
  );
}