export function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const now = new Date();
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
}

export function formatTimestamp(sec) {
  if (sec === undefined || sec === null) return "";
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function initials(name) {
  if (!name) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export function fileIcon(fileType) {
  const t = (fileType || "").toLowerCase();
  if (["pdf"].includes(t)) return "pdf";
  if (["docx", "doc"].includes(t)) return "doc";
  if (["txt", "md", "csv", "json"].includes(t)) return "text";
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "tiff"].includes(t)) return "image";
  if (["mp3", "wav", "m4a", "aac", "ogg", "flac"].includes(t)) return "audio";
  if (["mp4", "mov", "mkv", "webm", "avi"].includes(t)) return "video";
  return "file";
}

export function highlightQuery(text, query) {
  if (!query || !text) return text;
  const terms = query
    .split(/\s+/)
    .filter((t) => t.length > 2)
    .sort((a, b) => b.length - a.length);
  if (!terms.length) return text;
  let out = text;
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  return out.replace(re, "<mark>$1</mark>");
}

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}