"use client";

// Portfolio-wide Content Decay view (was /?tab=decay).

import { BarChart2 } from "lucide-react";
import ContentDecayMap from "@/components/ContentDecayMap";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

export default function DecayPage() {
  const { t } = useLanguage();
  return (
    <div className="main-content" style={{ gap: "8px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
        <BarChart2 size={22} style={{ color: "var(--color-accent-blue)" }} />
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--color-text-primary)", letterSpacing: "-0.02em", margin: 0 }}>{t("menuDecay")}</h1>
      </div>
      <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginBottom: "8px" }}>{t("decayPageSub")}</div>
      <ContentDecayMap domain="" siteDbId="all" />
    </div>
  );
}
