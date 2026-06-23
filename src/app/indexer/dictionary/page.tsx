"use client";

import { useEffect, useState } from "react";
import { Sparkles, FileText, Trash2, Plus, AlertCircle, RefreshCw } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

export default function IndexerDictionaryPage() {
  const { t } = useLanguage();
  const [words, setWords] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState("");
  const [niche, setNiche] = useState("ecommerce");
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isLarge, setIsLarge] = useState(false);

  const fetchDictionary = async () => {
    try {
      const res = await fetch("/api/indexer/dictionary");
      if (res.ok) {
        const d = await res.json();
        setWords(d);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDictionary();
    setIsLarge(window.innerWidth > 960);
  }, []);

  const handleBulkAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) {
      setMsg({ type: "error", text: "Please enter some keywords." });
      return;
    }

    setSubmitting(true);
    setMsg(null);

    try {
      const res = await fetch("/api/indexer/dictionary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add",
          words: inputText,
        }),
      });

      const d = await res.json();
      if (res.ok && d.success) {
        setMsg({ type: "success", text: `Successfully added ${d.count} keywords.` });
        setInputText("");
        fetchDictionary();
      } else {
        setMsg({ type: "error", text: d.error || "Failed to add words." });
      }
    } catch (err: any) {
      setMsg({ type: "error", text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAiGenerate = async () => {
    setGenerating(true);
    setMsg(null);

    // Retrieve AI provider details from localStorage
    const aiProvider = localStorage.getItem("aiProvider") || "anthropic";
    const aiApiKey = localStorage.getItem(`aiApiKey_${aiProvider}`) || "";

    try {
      const res = await fetch("/api/indexer/dictionary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          niche,
          aiProvider,
          aiApiKey,
        }),
      });

      const d = await res.json();
      if (res.ok && d.success) {
        setMsg({ type: "success", text: `AI generated and saved ${d.count} keywords for niche: ${niche}.` });
        fetchDictionary();
      } else {
        setMsg({ type: "error", text: d.error || "AI generation failed." });
      }
    } catch (err: any) {
      setMsg({ type: "error", text: err.message });
    } finally {
      setGenerating(false);
    }
  };

  const handleClear = async () => {
    if (!confirm("Are you sure you want to delete all keywords from the dictionary? doorways will fall back to default keywords.")) return;
    try {
      const res = await fetch("/api/indexer/dictionary", { method: "DELETE" });
      if (res.ok) {
        setMsg({ type: "success", text: "Dictionary cleared." });
        fetchDictionary();
      }
    } catch (e: any) {
      setMsg({ type: "error", text: e.message });
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
          {t("indexerTabDict")}
        </h2>
        <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", margin: 0, lineHeight: 1.5 }}>
          {t("indexerTabDescDict")}
        </p>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: isLarge ? "1fr 1.3fr" : "1fr",
        gap: "24px",
        alignItems: "start",
      }}>
        {/* Import / AI Generator controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        
        {/* AI generator */}
        <div style={{
          background: "var(--color-card)",
          border: "1px solid var(--color-border)",
          borderRadius: "16px",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "14px"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Sparkles size={16} color="var(--color-accent-purple)" />
            <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--color-text-primary)", margin: 0 }}>
              AI Keyword Generator
            </h3>
          </div>
          <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", margin: 0 }}>
            Automatically seed your doorway dictionaries using your AI API Provider keys.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "12px", color: "var(--color-text-secondary)", fontWeight: 600 }}>Niche Topic</span>
            <select
              value={niche}
              onChange={e => setNiche(e.target.value)}
              style={{
                background: "var(--color-bg)",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                padding: "8px 12px",
                fontSize: "13px",
                color: "var(--color-text-primary)",
                outline: "none"
              }}
            >
              <option value="ecommerce">Ecommerce (shopping, stores, reviews)</option>
              <option value="crypto">Crypto (blockchain, staking, mining)</option>
              <option value="finance">Finance (credit, cards, banking, loans)</option>
              <option value="general">General (tips, reviews, latest news)</option>
            </select>
          </div>

          <button
            onClick={handleAiGenerate}
            disabled={generating}
            style={{
              padding: "10px",
              borderRadius: "8px",
              background: "var(--color-accent-purple)",
              color: "#fff",
              fontSize: "13px",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              opacity: generating ? 0.7 : 1,
              transition: "background 0.15s"
            }}
            onMouseOver={e => { if (!generating) e.currentTarget.style.background = "var(--color-accent-purple-dark, #a855f7)"; }}
            onMouseOut={e => { if (!generating) e.currentTarget.style.background = "var(--color-accent-purple)"; }}
          >
            {generating ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                AI Seeding...
              </>
            ) : (
              <>
                <Sparkles size={14} />
                Generate and Seed Niche Words
              </>
            )}
          </button>
        </div>

        {/* Manual Bulk Import */}
        <div style={{
          background: "var(--color-card)",
          border: "1px solid var(--color-border)",
          borderRadius: "16px",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "14px"
        }}>
          <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--color-text-primary)", margin: 0 }}>
            Bulk Import Dictionary Words
          </h3>
          <form onSubmit={handleBulkAdd} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <textarea
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder="best sneakers sale&#10;cheap flight tickets&#10;bitcoin mining pool&#10;instant loan approval"
              rows={6}
              style={{
                background: "var(--color-bg)",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                padding: "8px 12px",
                fontSize: "13px",
                color: "var(--color-text-primary)",
                outline: "none",
                fontFamily: "monospace",
                resize: "vertical"
              }}
            />
            <button
              type="submit"
              disabled={submitting}
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
                opacity: submitting ? 0.7 : 1,
                transition: "background 0.15s"
              }}
              onMouseOver={e => { if (!submitting) e.currentTarget.style.background = "var(--color-accent-blue-dark)"; }}
              onMouseOut={e => { if (!submitting) e.currentTarget.style.background = "var(--color-accent-blue)"; }}
            >
              <Plus size={14} />
              Add Keywords to Pool
            </button>
          </form>
        </div>

      </div>

      {/* Dictionary Listing */}
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
            <FileText size={16} color="var(--color-accent-blue)" />
            <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--color-text-primary)", margin: 0 }}>
              Dictionary Pool ({words.length} keywords)
            </h3>
          </div>
          {words.length > 0 && (
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
              Clear Dictionary
            </button>
          )}
        </div>

        {msg && (
          <div style={{
            padding: "10px 14px",
            borderRadius: "8px",
            fontSize: "12px",
            background: msg.type === "success" ? "rgba(52,199,89,0.08)" : "rgba(255,69,58,0.08)",
            border: msg.type === "success" ? "1px solid rgba(52,199,89,0.2)" : "1px solid rgba(255,69,58,0.2)",
            color: msg.type === "success" ? "var(--color-accent-green)" : "var(--color-accent-red)",
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}>
            <AlertCircle size={14} />
            {msg.text}
          </div>
        )}

        {loading ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--color-text-secondary)" }}>
            <RefreshCw size={18} className="animate-spin" style={{ margin: "0 auto 12px" }} />
            Loading dictionary...
          </div>
        ) : words.length === 0 ? (
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
            <Sparkles size={24} color="var(--color-text-tertiary)" />
            Dictionary is empty.
            <span style={{ fontSize: "11px" }}>doorway generators will fall back to generic ecommerce keywords until you seed the pool.</span>
          </div>
        ) : (
          <div style={{
            maxHeight: "450px",
            overflowY: "auto",
            display: "flex",
            flexWrap: "wrap",
            gap: "8px",
            padding: "12px",
            background: "var(--color-bg)",
            borderRadius: "12px",
            border: "1px solid var(--color-border-soft)"
          }}>
            {words.map((word, i) => (
              <span
                key={i}
                style={{
                  fontSize: "12px",
                  padding: "4px 10px",
                  borderRadius: "6px",
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text-primary)",
                  fontWeight: 500
                }}
              >
                {word}
              </span>
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
