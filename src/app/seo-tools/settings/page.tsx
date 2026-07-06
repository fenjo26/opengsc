"use client";

// Moved: SEO Tools settings (SERP/AI keys, models, policies) now live in the main
// project Settings (single place for every key in the app — see /settings, "seo-tools"
// nav item). This route just redirects old links/bookmarks there.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SeoToolsSettingsPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/settings?tab=seo-tools"); }, [router]);
  return null;
}
