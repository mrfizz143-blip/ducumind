import { useCallback, useEffect, useRef, useState } from "react";
import { X, UploadCloud, FileText, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { useApp } from "../store";
import { api } from "../lib/api";
import { formatBytes } from "../lib/format";

const ACCEPT = ".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.gif,.webp,.bmp,.tiff,.mp3,.wav,.m4a,.aac,.ogg,.flac,.mp4,.mov,.mkv,.webm,.avi";
const MAX_MB = 200;

export default function UploadDialog() {
  const { pushToast, setJobs } = useApp();
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [items, setItems] = useState([]);
  const inputRef = useRef(null);
  const timers = useRef({});

  useEffect(() => {
    const openHandler = () => setOpen(true);
    window.addEventListener("upload:open", openHandler);
    return () => window.removeEventListener("upload:open", openHandler);
  }, []);

  const poll = useCallback(
    async (jobId, itemKey) => {
      const tick = async () => {
        try {
          const job = await api(`/api/jobs/${jobId}`);
          setItems((prev) => prev.map((it) => (it.key === itemKey ? { ...it, job } : it)));
          setJobs((prev) => {
            const next = prev.filter((j) => j.job_id !== job.id);
            return job.status === "running" ? [...next, job] : next;
          });
          if (job.status === "completed") {
            clearInterval(timers.current[itemKey]);
            delete timers.current[itemKey];
            pushToast("Document processed and indexed", "success");
          } else if (job.status === "failed") {
            clearInterval(timers.current[itemKey]);
            delete timers.current[itemKey];
            pushToast(job.error || "Processing failed", "error");
          } else {
            timers.current[itemKey] = setTimeout(tick, 600);
          }
        } catch {
          clearInterval(timers.current[itemKey]);
          delete timers.current[itemKey];
        }
      };
      tick();
    },
    [pushToast, setJobs]
  );

  const upload = useCallback(
    async (files) => {
      const list = Array.from(files).map((f, i) => ({
        key: `${Date.now()}-${i}`,
        file: f,
        status: "uploading",
        progress: 0,
        error: null,
      }));
      setItems((prev) => [...prev, ...list]);

      for (const item of list) {
        const ok = validate(item.file);
        if (!ok.valid) {
          setItems((prev) => prev.map((it) => (it.key === item.key ? { ...it, status: "error", error: ok.reason } : it)));
          pushToast(ok.reason, "error");
          continue;
        }
        try {
          const res = await api("/api/documents/upload", { method: "POST", form: formFor(item.file) });
          setItems((prev) => prev.map((it) => (it.key === item.key ? { ...it, status: "processing", job: { progress: 4, stage: "queued" } } : it)));
          poll(res.job_id, item.key);
        } catch (e) {
          setItems((prev) => prev.map((it) => (it.key === item.key ? { ...it, status: "error", error: e.message } : it)));
        }
      }
    },
    [poll, pushToast]
  );

  useEffect(() => {
    return () => {
      Object.values(timers.current).forEach(clearTimeout);
    };
  }, []);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Upload research material</h3>
          <button className="btn-icon" onClick={() => setOpen(false)}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <div
            className={`card ${dragging ? "upload-dragging" : ""}`}
            style={{
              padding: "var(--s-7)",
              textAlign: "center",
              borderStyle: "dashed",
              borderWidth: 2,
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
              transition: "all var(--dur-fast) var(--ease-out)",
              ...(dragging ? { borderColor: "var(--accent)", background: "var(--accent-softer)" } : {}),
            }}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files); }}
          >
            <div className="empty-icon" style={{ width: 60, height: 60 }}>
              <UploadCloud size={26} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Drag files here</div>
            <div style={{ fontSize: 12, color: "var(--text-3)" }}>or click to browse</div>
            <div className="hero-chip" style={{ marginTop: 4 }}>
              PDF · DOCX · TXT · Images · Audio · Video
            </div>
            <div style={{ fontSize: 11, color: "var(--text-3)" }}>Up to {MAX_MB} MB per file</div>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPT}
              style={{ display: "none" }}
              onChange={(e) => upload(e.target.files)}
            />
          </div>

          {items.length > 0 && (
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10, maxHeight: 260, overflowY: "auto" }}>
              {items.map((item) => (
                <UploadItem key={item.key} item={item} onDismiss={() => setItems((p) => p.filter((x) => x.key !== item.key))} />
              ))}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <span style={{ fontSize: 12, color: "var(--text-3)", marginRight: "auto" }}>
            Processing runs in the background — keep browsing.
          </span>
          <button className="btn btn-primary" onClick={() => setOpen(false)}>Done</button>
        </div>
      </div>
    </div>
  );
}

function validate(file) {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  const okExt = ACCEPT.split(",").some((a) => a.replace(".", "").toLowerCase() === ext);
  if (!okExt) return { valid: false, reason: `Unsupported file type: .${ext}` };
  if (file.size > MAX_MB * 1024 * 1024) return { valid: false, reason: `File exceeds the ${MAX_MB} MB limit` };
  return { valid: true, reason: "" };
}

function formFor(file) {
  const fd = new FormData();
  fd.append("file", file);
  return fd;
}

function UploadItem({ item, onDismiss }) {
  const job = item.job;
  const progress = job?.progress ?? (item.status === "uploading" ? 6 : 0);
  const stage = job?.stage || (item.status === "uploading" ? "uploading" : "queued");
  const label = stage.charAt(0).toUpperCase() + stage.slice(1).replace("_", " ");
  const done = item.status === "error" || job?.status === "completed" || job?.status === "failed";

  return (
    <div className="list-item" style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
      <div className="mini-item-icon" style={{ color: item.status === "error" ? "var(--danger)" : "var(--accent)" }}>
        {item.status === "error" ? <AlertCircle size={16} /> : done && job?.status === "completed" ? <CheckCircle2 size={16} /> : <Loader2 size={16} className="spin" />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="ellipsis" style={{ fontSize: 13, fontWeight: 550 }}>{item.file.name}</div>
        <div style={{ fontSize: 11, color: "var(--text-3)" }}>{formatBytes(item.file.size)}</div>
        {item.status !== "error" && job?.status !== "failed" && (
          <div className="progress" style={{ marginTop: 6 }}>
            <span style={{ width: `${progress}%` }} />
          </div>
        )}
        {item.status === "error" || job?.status === "failed" ? (
          <div style={{ fontSize: 12, color: "var(--danger)" }}>{item.error || job?.error}</div>
        ) : (
          <div style={{ fontSize: 11, color: "var(--accent)", marginTop: 4 }}>{label} — {progress}%</div>
        )}
      </div>
      <button className="btn-icon" onClick={onDismiss}><X size={14} /></button>
    </div>
  );
}