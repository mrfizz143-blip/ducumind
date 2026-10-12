import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { useApp } from "../store";

export default function Toaster() {
  const { toasts } = useApp();
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div className="toast" key={t.id}>
          <span className={`toast-icon ${t.type}`}>
            {t.type === "success" ? <CheckCircle2 size={17} /> : t.type === "error" ? <AlertCircle size={17} /> : <Info size={17} />}
          </span>
          <span style={{ flex: 1 }}>{t.message}</span>
        </div>
      ))}
    </div>
  );
}