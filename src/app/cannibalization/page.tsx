"use client";

// Portfolio-wide Keyword Cannibalization view (was /?tab=cannibalization).

import { Anchor } from "lucide-react";
import KeywordCannibalization from "@/components/KeywordCannibalization";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

export default function CannibalizationPage() {
  const { t } = useLanguage();
  return (
    <div className="main-content" style={{ gap: "8px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
        <Anchor size={22} style={{ color: "var(--color-accent-blue)" }} />
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--color-text-primary)", letterSpacing: "-0.02em", margin: 0 }}>{t("menuCannibalization")}</h1>
      </div>
      <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginBottom: "8px" }}>{t("cannibalizationPageSub")}</div>
      <KeywordCannibalization siteDbId="all" />
    </div>
  );
}
