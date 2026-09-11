"use client";
// src/components/leaderboard/leaderboard-filters.tsx  [U4]
// The three rating pools as tabs (UI_REDESIGN §6). One pool is shown at a time
// and each has its own subscription, so a tab really does control a panel —
// which is what makes the tab semantics honest here.
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { LeaderboardFilter } from "@/lib/types";

export interface PoolTab {
  value: LeaderboardFilter;
  label: string;
  hint: string;
}

export const POOL_TABS: readonly PoolTab[] = [
  { value: "all", label: "All", hint: "Overall rating across every mode" },
  { value: "human", label: "vs Humans", hint: "Rating from online games only" },
  { value: "ai", label: "vs AI", hint: "Rating from games against the computer" },
];

export const FILTER_HINTS: Record<LeaderboardFilter, string> = {
  all: POOL_TABS[0].hint,
  human: POOL_TABS[1].hint,
  ai: POOL_TABS[2].hint,
};

/** The tab strip itself — must be rendered inside a `<Tabs>` root. */
export function LeaderboardFilters() {
  return (
    <TabsList variant="line" aria-label="Rating pool" className="h-8">
      {POOL_TABS.map((tab) => (
        <TabsTrigger key={tab.value} value={tab.value} className="px-2.5">
          {tab.label}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
