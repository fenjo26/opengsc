"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import SitePage from "@/app/site/[id]/page";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

export default function GuestSharePage() {
  const { t } = useLanguage();
  const params = useParams();
  const siteId = params.siteId as string;
  const token = params.token as string;
  const [domain, setDomain] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!siteId || !token) return;
    setLoading(true);
    fetch(`/api/gsc/site/share?siteId=${encodeURIComponent(siteId)}&shareToken=${encodeURIComponent(token)}`)
      .then(r => {
        if (!r.ok) throw new Error(t("shareInvalidOrExpired") || "Invalid or expired share link");
        return r.json();
      })
      .then(d => {
        setDomain(d.domain);
      })
      .catch(err => {
        setError(err.message || t("shareInvalidOrExpired") || "Failed to load dashboard");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [siteId, token, t]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--color-bg)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-primary)", fontFamily: "Inter, sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: "32px", height: "32px", borderRadius: "50%", border: "3px solid var(--color-border)", borderTopColor: "#3B82F6", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <div>{t("shareLoading") || "Loading guest dashboard..."}</div>
        </div>
      </div>
    );
  }

  if (error || !domain) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--color-bg)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-primary)", fontFamily: "Inter, sans-serif", padding: "20px" }}>
        <div style={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: "12px", padding: "32px", maxWidth: "440px", width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: "40px", marginBottom: "16px" }}>🔒</div>
          <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "8px" }}>{t("shareAccessDenied") || "Access Denied"}</h2>
          <p style={{ fontSize: "14px", color: "var(--color-text-secondary)", lineHeight: "1.5", margin: 0 }}>
            {error || t("shareInvalidOrExpired") || "This share link is invalid or has been revoked by the site owner."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <SitePage
      siteDbId={siteId}
      domain={domain}
      readOnly={true}
      shareToken={token}
    />
  );
}
