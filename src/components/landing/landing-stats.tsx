"use client";
// src/components/landing/landing-stats.tsx  [UI upgrade 2 §2.1]
// "● 3 playing now · 14 games played" — the two live counters as one chip that
// reads as one sentence, numbers in mono. Both come from the public
// `stats.landing` query and both are capped reads (see convex/stats.ts): at the
// cap the second one prints "1,000+" rather than a number that would quietly
// stop being true. Nothing is ever guessed: while the query is in flight the
// chip is a skeleton of its own size.
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/ui";

/** Keep in step with `GAMES_PLAYED_CAP` in convex/stats.ts. */
const GAMES_PLAYED_CAP = 1000;

function formatGamesPlayed(count: number): string {
  return count >= GAMES_PLAYED_CAP
    ? `${GAMES_PLAYED_CAP.toLocaleString("en-US")}+`
    : count.toLocaleString("en-US");
}

function Count({ children }: { children: React.ReactNode }) {
  return <span className="tabular font-mono font-medium text-foreground">{children}</span>;
}

export function LandingStats({ className }: { className?: string }) {
  const stats = useQuery(api.stats.landing, {});

  return (
    <div className={cn("flex h-8 items-center", className)}>
      {stats === undefined ? (
        <Skeleton className="h-8 w-60 rounded-full" />
      ) : (
        <p
          className={cn(
            "inline-flex h-8 items-center gap-2 rounded-full border border-border bg-card",
            "px-3 text-[13px] leading-none text-muted-foreground",
          )}
        >
          {/* The Live Green Rule: the dot only exists while somebody is playing. */}
          {stats.playingNow > 0 ? (
            <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-live motion-safe:animate-pulse" />
          ) : null}
          <span>
            <Count>{stats.playingNow.toLocaleString("en-US")}</Count> playing now
          </span>
          <span aria-hidden className="text-muted-foreground">
            ·
          </span>
          <span>
            <Count>{formatGamesPlayed(stats.gamesPlayed)}</Count> games played
          </span>
        </p>
      )}
    </div>
  );
}
