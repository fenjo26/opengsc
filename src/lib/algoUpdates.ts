// Known Google algorithm updates — single source of truth for chart annotations.
// Idea borrowed from sundios/SEO-Dashboard (algo_updates.json): typed updates with
// per-type colors. To add a new update, append an entry here.
//
// Colors: core = orange, spam = purple, discover = green, other = blue.

export type AlgoUpdateType = "core" | "spam" | "discover" | "other";

export interface AlgoUpdate {
  date: string;  // start date, ISO YYYY-MM-DD
  name: string;  // short label shown on the chart
  type: AlgoUpdateType;
  duration?: string;
}

export const ALGO_UPDATE_COLORS: Record<AlgoUpdateType, string> = {
  core: "#F59E0B",
  spam: "#8B5CF6",
  discover: "#10B981",
  other: "#3B82F6",
};

export const ALGO_UPDATES: AlgoUpdate[] = [
  { date: "2023-08-22", name: "Aug 2023 Core",     type: "core", duration: "16 days" },
  { date: "2023-10-04", name: "Oct 2023 Spam",     type: "spam", duration: "16 days" },
  { date: "2023-10-05", name: "Oct 2023 Core",     type: "core", duration: "14 days" },
  { date: "2023-11-02", name: "Nov 2023 Core",     type: "core", duration: "26 days" },
  { date: "2023-11-08", name: "Nov 2023 Reviews",  type: "other", duration: "29 days" },
  { date: "2024-03-05", name: "Mar 2024 Core",     type: "core", duration: "45 days" },
  { date: "2024-03-05", name: "Mar 2024 Spam",     type: "spam", duration: "15 days" },
  { date: "2024-06-20", name: "Jun 2024 Spam",     type: "spam", duration: "7 days" },
  { date: "2024-08-15", name: "Aug 2024 Core",     type: "core", duration: "19 days" },
  { date: "2024-11-11", name: "Nov 2024 Core",     type: "core", duration: "24 days" },
  { date: "2024-12-12", name: "Dec 2024 Core",     type: "core", duration: "6 days" },
  { date: "2024-12-19", name: "Dec 2024 Spam",     type: "spam", duration: "8 days" },
  { date: "2025-03-13", name: "Mar 2025 Core",     type: "core", duration: "14 days" },
  { date: "2025-06-30", name: "Jun 2025 Core",     type: "core", duration: "16 days" },
  { date: "2025-08-26", name: "Aug 2025 Spam",     type: "spam", duration: "18 days" },
  { date: "2025-12-11", name: "Dec 2025 Core",     type: "core", duration: "12 days" },
  { date: "2026-02-10", name: "Feb 2026 Discover", type: "discover", duration: "8 days" },
  { date: "2026-03-27", name: "Mar 2026 Core",     type: "core", duration: "12 days" },
  { date: "2026-03-27", name: "Mar 2026 Spam",     type: "spam", duration: "9 days" },
];

// Chart X axes use "MMM d" labels — convert an ISO date to the same format.
export function algoDateLabel(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Updates that fall inside an ISO date window (inclusive).
export function algoUpdatesInRange(startIso: string, endIso: string): AlgoUpdate[] {
  return ALGO_UPDATES.filter(u => u.date >= startIso && u.date <= endIso);
}
