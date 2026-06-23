"use client";

import { useEffect, useState } from "react";
import { Plus, ListChecks, Trash2, Globe, AlertCircle, RefreshCw } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

interface QueueItem {
  id: string;
  url: string;
  status: string;
  createdAt: string;
  domain: {
    domain: string;
  };
}

interface DomainOpt {
  id: string;
  domain: string;
}

export default function IndexerQueuePage() {
  const { t } = useLanguage();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [domains, setDomains] = useState<DomainOpt[]>([]);
  const [domainId, setDomainId] = useState("");
  const [urlsInput, setUrlsInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isLarge, setIsLarge] = useState(false);

  const fetchDomains = async () => {
    try {
      const res = await fetch("/api/indexer/domains");
      if (res.ok) {
        const d = await res.json();
        setDomains(d);
        if (d.length > 0) setDomainId(d[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchQueue = async () => {
    try {
      const res = await fetch("/api/indexer/queue");
      if (res.ok) {
        const d = await res.json();
        setQueue(d);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDomains();
    fetchQueue();
    setIsLarge(window.innerWidth > 960);
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domainId) {
      setStatusMsg({ type: "error", text: "Please select a domain." });
      return;
    }
    if (!urlsInput.trim()) {
      setStatusMsg({ type: "error", text: "Please enter at least one URL." });
      return;
    }

    setSubmitting(true);
    setStatusMsg(null);

    try {
      const res = await fetch("/api/indexer/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domainId,
          urls: urlsInput,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setStatusMsg({ type: "success", text: `Successfully queued ${data.count} URLs for indexing.` });
        setUrlsInput("");
        fetchQueue();
      } else {
        setStatusMsg({ type: "error", text: data.error || "Failed to add URLs." });
      }
    } catch (err: any) {
      setStatusMsg({ type: "error", text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleClear = async () => {
    if (!confirm("Are you sure you want to clear the entire queue?")) return;
    try {
      const res = await fetch("/api/indexer/queue", { method: "DELETE" });
      if (res.ok) {
        setStatusMsg({ type: "success", text: "Queue cleared." });
        fetchQueue();
      }
    } catch (e: any) {
      setStatusMsg({ type: "error", text: e.message });
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Description Banner */}
      <div style={{
        background: "var(--color-card)",
        border: "1px solid var(--color-border)",
        borderRadius: "16px",
        padding: "16px 20px",
        display: "flex",
        flexDirection: "column",
        gap: "4px"
      }}>
        <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--color-text-primary)", margin: 0 }}>
          {t("indexerTabQueue")}
        </h2>
        <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", margin: 0, lineHeight: 1.5 }}>
          {t("indexerTabDescQueue")}
        </p>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: isLarge ? "1fr 1.3fr" : "1fr",
        gap: "24px",
        alignItems: "start",
      }}>
        {/* Bulk Submission Form */}
      <div style={{
        background: "var(--color-card)",
        border: "1px solid var(--color-border)",
        borderRadius: "16px",
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "16px"
      }}>
        <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--color-text-primary)", margin: 0 }}>
          Queue URLs for Indexing
        </h3>
        <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", margin: 0 }}>
          Submit pages you want search engine crawlers to visit. Pings will be recorded on the next crawl.
        </p>

        {statusMsg && (
          <div style={{
            padding: "10px 14px",
            borderRadius: "8px",
            fontSize: "12px",
            background: statusMsg.type === "success" ? "rgba(52,199,89,0.08)" : "rgba(255,69,58,0.08)",
            border: statusMsg.type === "success" ? "1px solid rgba(52,199,89,0.2)" : "1px solid rgba(255,69,58,0.2)",
            color: statusMsg.type === "success" ? "var(--color-accent-green)" : "var(--color-accent-red)",
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}>
            <AlertCircle size={14} />
            {statusMsg.text}
          </div>
        )}

        <form onSubmit={handleAdd} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {/* Select Domain */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontSize: "12px", color: "var(--color-text-secondary)", fontWeight: 600 }}>
              Target Domain
            </label>
            <select
              value={domainId}
              onChange={e => setDomainId(e.target.value)}
              style={{
                background: "var(--color-bg)",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                padding: "8px 12px",
                fontSize: "13px",
                color: "var(--color-text-primary)",
                outline: "none",
                width: "100%"
              }}
            >
              {domains.length === 0 ? (
                <option value="">No domains added — add one first</option>
              ) : (
                domains.map(d => (
                  <option key={d.id} value={d.id}>{d.domain}</option>
                ))
              )}
            </select>
          </div>

          {/* URLs input */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontSize: "12px", color: "var(--color-text-secondary)", fontWeight: 600 }}>
              URLs to Index (one per line)
            </label>
            <textarea
              value={urlsInput}
              onChange={e => setUrlsInput(e.target.value)}
              placeholder="best-deals-shop.net/deals/promo&#10;best-deals-shop.net/product-99213.html&#10;deals.best-deals-shop.net/index"
              rows={8}
              style={{
                background: "var(--color-bg)",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                padding: "10px 12px",
                fontSize: "13px",
                color: "var(--color-text-primary)",
                outline: "none",
                fontFamily: "monospace",
                resize: "vertical"
              }}
            />
          </div>

          <button
            type="submit"
            disabled={submitting || domains.length === 0}
            style={{
              padding: "10px",
              borderRadius: "8px",
              background: "var(--color-accent-blue)",
              color: "#fff",
              fontSize: "13px",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              opacity: (submitting || domains.length === 0) ? 0.7 : 1,
              transition: "background 0.15s",
              marginTop: "4px"
            }}
            onMouseOver={e => { if (!submitting && domains.length > 0) e.currentTarget.style.background = "var(--color-accent-blue-dark)"; }}
            onMouseOut={e => { if (!submitting && domains.length > 0) e.currentTarget.style.background = "var(--color-accent-blue)"; }}
          >
            {submitting ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                Adding to Queue...
              </>
            ) : (
              <>
                <Plus size={14} />
                Add to Indexer Queue
              </>
            )}
          </button>
        </form>
      </div>

      {/* Queue list table */}
      <div style={{
        background: "var(--color-card)",
        border: "1px solid var(--color-border)",
        borderRadius: "16px",
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "16px"
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <ListChecks size={16} color="var(--color-accent-blue)" />
            <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--color-text-primary)", margin: 0 }}>
              Crawl Queue
            </h3>
          </div>
          {queue.length > 0 && (
            <button
              onClick={handleClear}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 10px",
                background: "transparent",
                border: "1px solid rgba(255,69,58,0.2)",
                borderRadius: "6px",
                color: "var(--color-accent-red)",
                fontSize: "12px",
                cursor: "pointer",
                transition: "all 0.15s"
              }}
              onMouseOver={e => { e.currentTarget.style.background = "rgba(255,69,58,0.06)"; }}
              onMouseOut={e => { e.currentTarget.style.background = "transparent"; }}
            >
              <Trash2 size={12} />
              Clear Queue
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--color-text-secondary)" }}>
            <RefreshCw size={18} className="animate-spin" style={{ margin: "0 auto 12px" }} />
            Loading crawl queue...
          </div>
        ) : queue.length === 0 ? (
          <div style={{
            padding: "48px 16px",
            textAlign: "center",
            color: "var(--color-text-secondary)",
            fontSize: "13px",
            border: "1px dashed var(--color-border)",
            borderRadius: "12px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "10px"
          }}>
            <Globe size={24} color="var(--color-text-tertiary)" />
            Queue is currently empty.
            <span style={{ fontSize: "11px" }}>Newly added doorway URLs waiting to be fetched by Googlebot will appear here.</span>
          </div>
        ) : (
          <div style={{ overflowX: "auto", maxHeight: "400px", overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)", color: "var(--color-text-secondary)", height: "36px" }}>
                  <th style={{ padding: "0 8px" }}>Domain</th>
                  <th style={{ padding: "0 8px" }}>URL Path</th>
                  <th style={{ padding: "0 8px" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {queue.map(item => {
                  const path = item.url.replace(/^https?:\/\/[^/]+/, "");
                  return (
                    <tr key={item.id} style={{ borderBottom: "1px solid var(--color-border-soft)", height: "38px" }}>
                      <td style={{ padding: "0 8px", fontWeight: 600, color: "var(--color-text-primary)" }}>
                        {item.domain.domain}
                      </td>
                      <td style={{ padding: "0 8px", fontFamily: "monospace", color: "var(--color-text-secondary)", maxWidth: "250px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {path || "/"}
                      </td>
                      <td style={{ padding: "0 8px" }}>
                        <span style={{
                          padding: "2px 6px",
                          borderRadius: "4px",
                          fontSize: "11px",
                          fontWeight: 700,
                          backgroundColor: "rgba(255,159,10,0.1)",
                          color: "var(--color-accent-orange)",
                        }}>
                          {item.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
