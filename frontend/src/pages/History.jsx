import { useEffect, useState } from "react";
import { History as HistoryIcon, Search, MessageSquare, FileText } from "lucide-react";
import { api } from "../lib/api";
import { EmptyState } from "../components/Shared";
import { formatDate } from "../lib/format";

export default function History() {
  const [history, setHistory] = useState(null);
  const [convs, setConvs] = useState(null);
  const [jobs, setJobs] = useState(null);

  useEffect(() => {
    api("/api/search/history")
      .then((h) => setHistory(Array.isArray(h) ? h : []))
      .catch(() => setHistory([]));
    api("/api/conversations")
      .then((c) => setConvs(Array.isArray(c) ? c : []))
      .catch(() => setConvs([]));
    api("/api/jobs")
      .then((j) => setJobs(Array.isArray(j) ? j : []))
      .catch(() => setJobs([]));
  }, []);

  return (
    <div className="page">
      <div className="page-head">
        <h1>History</h1>
        <div className="sub">Recent searches, conversations and processing activity.</div>
      </div>

      <div className="dash-grid">
        <div className="dash-col col-6">
          <div className="dash-card">
            <div className="dash-card-head"><h2>Recent searches</h2></div>
            <div className="dash-card-body">
              {!history ? (
                <div className="skeleton" style={{ height: 40, margin: 8 }} />
              ) : history.length === 0 ? (
                <EmptyState icon={<Search size={20} />} title="No searches yet" />
              ) : (
                history.map((h, i) => (
                  <div className="mini-item" key={i}>
                    <div className="mini-item-icon"><Search size={14} /></div>
                    <div className="grow">
                      <div className="mini-item-title">{h.query}</div>
                      <div className="mini-item-sub">{h.result_count} results · {formatDate(h.created_at)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="dash-col col-6">
          <div className="dash-card">
            <div className="dash-card-head"><h2>Conversations</h2></div>
            <div className="dash-card-body">
              {!convs ? (
                <div className="skeleton" style={{ height: 40, margin: 8 }} />
              ) : convs.length === 0 ? (
                <EmptyState icon={<MessageSquare size={20} />} title="No conversations yet" />
              ) : (
                convs.map((c) => (
                  <div className="mini-item" key={c.id}>
                    <div className="mini-item-icon"><MessageSquare size={14} /></div>
                    <div className="grow">
                      <div className="mini-item-title">{c.title}</div>
                      <div className="mini-item-sub">{formatDate(c.updated_at)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="dash-col col-12">
          <div className="dash-card">
            <div className="dash-card-head"><h2>Processing activity</h2></div>
            <div className="dash-card-body">
              {!jobs ? (
                <div className="skeleton" style={{ height: 40, margin: 8 }} />
              ) : jobs.length === 0 ? (
                <EmptyState icon={<FileText size={20} />} title="No processing jobs yet" />
              ) : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {jobs.map((j) => (
                    <div className="mini-item" key={j.job_id}>
                      <div className="mini-item-icon" style={{ color: j.status === "failed" ? "var(--danger)" : j.status === "completed" ? "var(--success)" : "var(--accent)" }}>
                        <FileText size={14} />
                      </div>
                      <div className="grow">
                        <div className="mini-item-title">Document #{j.document_id}</div>
                        <div className="mini-item-sub">
                          {j.status} · {j.stage} · {j.progress}% · {formatDate(j.created_at)}
                        </div>
                      </div>
                      {j.error && <span className="badge badge-danger">error</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}