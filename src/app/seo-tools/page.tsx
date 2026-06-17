"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SeoToolsIndex() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/seo-tools/outline");
  }, [router]);
  return null;
}
