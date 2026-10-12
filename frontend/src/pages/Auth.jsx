import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  FileText,
  Image as ImageIcon,
  AudioLines,
  Video,
  Search,
  Quote,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import { useApp } from "../store";
import { api, ApiError } from "../lib/api";

export default function Auth() {
  const { login } = useApp();
  const navigate = useNavigate();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setBusy(true);
    try {
      const path = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const body = mode === "login" ? { email, password } : { email, full_name: fullName, password };
      const data = await api(path, { method: "POST", body });
      login(data.access_token, data.user);
      navigate("/app/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-panel">
        <form className="auth-form" onSubmit={submit}>
          <div className="auth-logo">
            <div className="brand-mark" style={{ width: 38, height: 38, borderRadius: 10 }}>
              <BookOpen size={20} />
            </div>
            <div>
              <div className="brand-name" style={{ fontSize: 22 }}>Documind</div>
              <div className="brand-tag">Multimedia Research Assistant · RAG</div>
            </div>
          </div>

          <h1 style={{ fontSize: 26, marginBottom: 6 }}>
            {mode === "login" ? "Welcome back" : "Create your research space"}
          </h1>
          <p className="muted" style={{ marginBottom: 24, fontSize: 14 }}>
            {mode === "login"
              ? "Sign in to your research workspace."
              : "Upload documents, ask grounded questions, and keep every answer cited."}
          </p>

          <div className="seg" style={{ marginBottom: 20, width: "100%" }}>
            <button type="button" className={mode === "login" ? "active" : ""} style={{ flex: 1 }} onClick={() => setMode("login")}>Sign in</button>
            <button type="button" className={mode === "register" ? "active" : ""} style={{ flex: 1 }} onClick={() => setMode("register")}>Create account</button>
          </div>

          <div className="field" style={{ marginBottom: 14 }}>
            <label>Email</label>
            <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@university.edu" />
          </div>
          {mode === "register" && (
            <div className="field" style={{ marginBottom: 14 }}>
              <label>Full name</label>
              <input className="input" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ada Lovelace" />
            </div>
          )}
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Password</label>
            <input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
          </div>

          {error && (
            <div className="insufficient-banner" style={{ marginBottom: 14, background: "var(--danger-soft)", color: "var(--danger)" }}>
              {error}
            </div>
          )}

          <button className="btn btn-primary btn-lg" style={{ width: "100%" }} disabled={busy}>
            {busy && <Loader2 size={15} className="spin" />}
            {mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
      </div>

      <div className="auth-hero">
        <div className="brand-mark" style={{ width: 52, height: 52, borderRadius: 14, marginBottom: 24 }}>
          <BookOpen size={26} />
        </div>
        <div className="serif">
          Your documents, read with intelligence.
        </div>
        <p>
          A grounded research assistant built on retrieval-augmented generation.
          Every answer is drawn from your own sources and every claim is cited.
        </p>
        <div className="hero-sources">
          <span className="hero-chip"><FileText size={13} /> PDF</span>
          <span className="hero-chip"><FileText size={13} /> DOCX</span>
          <span className="hero-chip"><ImageIcon size={13} /> Images · OCR</span>
          <span className="hero-chip"><AudioLines size={13} /> Audio</span>
          <span className="hero-chip"><Video size={13} /> Video</span>
          <span className="hero-chip"><Search size={13} /> Semantic search</span>
          <span className="hero-chip"><Quote size={13} /> Cited answers</span>
          <span className="hero-chip"><ShieldCheck size={13} /> Private by design</span>
        </div>
      </div>
    </div>
  );
}