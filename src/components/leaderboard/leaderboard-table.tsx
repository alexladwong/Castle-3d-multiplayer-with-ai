"use client";
// src/components/leaderboard/leaderboard-table.tsx  [U4]
// UI_REDESIGN §6: the top three as a podium row, the table below, pool tabs
// above. FR-50 / FR-52 are unchanged — top 100, live via subscription, three
// rating pools. The signed-in player is NOT pinned when outside the top 100:
// `leaderboard.top` returns a window, not a rank lookup, and the spec says to
// omit the pin rather than fake it.
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FILTER_HINTS,
  LeaderboardFilters,
  POOL_TABS,
} from "@/components/leaderboard/leaderboard-filters";
import { Podium } from "@/components/ui-kit";
import { LEADERBOARD_SIZE } from "@/lib/constants";
import { formatRating, formatRecord, formatWinRate, totalGames } from "@/lib/format";
import type { LeaderboardFilter } from "@/lib/types";
import { cn, focusRing, initials } from "@/lib/ui";

export interface LeaderboardRow {
  rank: number;
  playerId: string;
  username: string;
  avatarUrl: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
}

function profileHref(username: string): string {
  return `/profile/${encodeURIComponent(username)}`;
}

/** Draws count as half a win, exactly as `formatWinRate` reports them. */
function winRateFraction(row: LeaderboardRow): number {
  const played = totalGames(row);
  if (played === 0) return 0;
  return (row.wins + row.draws / 2) / played;
}

/** Pure: podium + table. The /dev/pages harness renders this with fixed rows. */
export function LeaderboardBody({ rows }: { rows: LeaderboardRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
        No rated players in this pool yet. Win a game and the board is yours.
      </p>
    );
  }

  return (
    <div className="grid gap-6">
      <Podium
        entries={rows.slice(0, 3).map((row) => ({
          rank: row.rank,
          name: row.username,
          rating: row.rating,
          avatarUrl: row.avatarUrl,
          record: formatRecord(row),
        }))}
        renderName={(entry) => (
          <Link
            prefetch={false}
            href={profileHref(entry.name)}
            className={cn("rounded-sm hover:text-primary", focusRing)}
          >
            {entry.name}
          </Link>
        )}
      />

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 text-right">#</TableHead>
              <TableHead>Player</TableHead>
              <TableHead className="text-right">Rating</TableHead>
              <TableHead className="text-right whitespace-nowrap">Record</TableHead>
              {/* Four columns is all 375-390 has room for: below sm the form column
                  was pushed off the end of its own scroller, so "Form" read as a
                  clipped "Fo" with nothing under it. The record beside it already
                  carries the win/loss story on a phone. */}
              <TableHead className="hidden w-32 text-right sm:table-cell">Form</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.playerId}>
                <TableCell className="tabular text-right font-mono text-muted-foreground">
                  {row.rank}
                </TableCell>
                <TableCell>
                  <Link
                    prefetch={false}
                    href={profileHref(row.username)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg font-medium transition-colors hover:text-primary",
                      focusRing,
                    )}
                  >
                    <Avatar size="sm">
                      <AvatarImage src={row.avatarUrl} alt="" />
                      <AvatarFallback>{initials(row.username)}</AvatarFallback>
                    </Avatar>
                    <span className="truncate">{row.username}</span>
                  </Link>
                </TableCell>
                <TableCell className="tabular text-right font-mono font-medium text-foreground">
                  {formatRating(row.rating)}
                </TableCell>
                <TableCell className="tabular text-right font-mono whitespace-nowrap text-muted-foreground">
                  {formatRecord(row)}
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <div className="flex items-center justify-end gap-2">
                    <span
                      aria-hidden
                      className="block h-1.5 w-16 overflow-hidden rounded-full bg-bg-sunken"
                    >
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{ width: `${Math.round(winRateFraction(row) * 100)}%` }}
                      />
                    </span>
                    <span className="tabular font-mono text-muted-foreground">
                      {formatWinRate(row)}
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function LeaderboardPool({ filter }: { filter: LeaderboardFilter }) {
  const rows = useQuery(api.leaderboard.top, { filter, limit: LEADERBOARD_SIZE });

  if (rows === undefined) {
    return (
      <div className="grid gap-3" aria-busy>
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  return <LeaderboardBody rows={rows} />;
}

export function LeaderboardTable() {
  const [filter, setFilter] = useState<LeaderboardFilter>("all");

  return (
    <Tabs
      value={filter}
      onValueChange={(value) => setFilter(value as LeaderboardFilter)}
      className="gap-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <LeaderboardFilters />
        <p className="text-[13px] text-muted-foreground">{FILTER_HINTS[filter]}</p>
      </div>

      {POOL_TABS.map((tab) => (
        <TabsContent key={tab.value} value={tab.value}>
          {/* Inactive panels are unmounted by Base UI, so exactly one pool is
              ever subscribed. */}
          <LeaderboardPool filter={tab.value} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
