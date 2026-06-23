"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function IndexerIndex() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/indexer/stats");
  }, [router]);
  return null;
}
