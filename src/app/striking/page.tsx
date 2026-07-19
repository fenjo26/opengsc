"use client";

// Portfolio-wide Striking Distance view (was /?tab=striking). Self-contained: the
// component fetches /api/gsc/striking?siteId=all itself.

import { TrendingUp } from "lucide-react";
import StrikingDistanceKeywords from "@/components/StrikingDistanceKeywords";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

export default function StrikingPage() {
  const { t } = useLanguage();
  return (
    <div style={{ padding: "24px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
        <TrendingUp size={22} style={{ color: "var(--color-accent-blue)" }} />
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--color-text-primary)", letterSpacing: "-0.02em", margin: 0 }}>{t("menuStriking")}</h1>
      </div>
      <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginBottom: "8px" }}>{t("strikingPageSub")}</div>
      <StrikingDistanceKeywords siteDbId="all" />
    </div>
  );
}
