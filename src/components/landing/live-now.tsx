"use client";
// src/components/landing/live-now.tsx  [UI upgrade 2 §2.4]
// "Games in progress." — the club's own room, shown as boards rather than rows.
// `games.listLive` is a public query so this renders for guests too; `games.get`
// (the position) requires an identity, so a signed-out visitor sees the tiles,
// the players and the move counts, and is told plainly that the positions and
// the games themselves are behind the door.
import Link from "next/link";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { BoardTile, Display, Section } from "@/components/ui-kit";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowUpRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { cn, focusRing, initials } from "@/lib/ui";
import type { LiveGameSummary, SquareId } from "@/lib/types";

const LIVE_LIMIT = 6;
const TOP_LIMIT = 5;

function profileHref(username: string): string {
  return `/profile/${encodeURIComponent(username)}`;
}

/** One subscription per tile for the position — the same trade the lobby makes. */
function LiveTile({ game, canWatch }: { game: LiveGameSummary; canWatch: boolean }) {
  const view = useQuery(
    api.games.get,
    canWatch ? { gameId: game._id as Id<"games"> } : "skip",
  );
  const doc = view?.game;
  const last = doc?.lastMove;

  return (
    <BoardTile
      canWatch={canWatch}
      game={{
        _id: game._id,
        whiteName: game.whiteName,
        blackName: game.blackName,
        whiteRating: game.whiteRating,
        blackRating: game.blackRating,
        moveCount: game.moveCount,
        spectatorCount: game.spectatorCount,
      }}
      fen={canWatch ? doc?.fen : null}
      lastMove={
        last === undefined || last === null
          ? null
          : { from: last.from as SquareId, to: last.to as SquareId }
      }
    />
  );
}

export function LiveNow() {
  const { isAuthenticated } = useConvexAuth();
  const games = useQuery(api.games.listLive, { limit: LIVE_LIMIT });
  const top = useQuery(api.leaderboard.top, { filter: "all", limit: TOP_LIMIT });

  return (
    <Section
      id="live-now"
      padding="none"
      className="scroll-mt-20 py-8 sm:py-12"
      aria-labelledby="live-now-heading"
    >
      <Display level={3} as="h2" id="live-now-heading">
        Games in progress.
      </Display>

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-12">
        <div>
          {games === undefined ? (
            <ul className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3" aria-busy>
              {[0, 1, 2].map((i) => (
                <li key={i} className="p-2">
                  <Skeleton className="h-5 w-32 rounded-full" />
                  <Skeleton className="mt-2.5 aspect-square w-full rounded-md" />
                  <Skeleton className="mt-2.5 h-5 w-32 rounded-full" />
                </li>
              ))}
            </ul>
          ) : games.length === 0 ? (
            <p className="flex min-h-48 items-center border-y border-border py-8 text-sm leading-relaxed text-muted-foreground">
              No live games right now. Start one and it will show up here.
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              {games.map((game) => (
                <LiveTile key={game._id} game={game} canWatch={isAuthenticated} />
              ))}
            </ul>
          )}

          {games !== undefined && games.length > 0 && !isAuthenticated ? (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                prefetch={false}
                href="/sign-in"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "h-10 cursor-pointer px-4 transition-colors duration-(--dur-micro)",
                )}
              >
                Sign in to watch
              </Link>
              <p className="text-[13px] text-muted-foreground">
                Positions and live boards open once you are in.
              </p>
            </div>
          ) : null}
        </div>

        <aside aria-labelledby="top-players" className="min-w-0 rounded-xl border border-border bg-card px-5">
          <div className="flex items-baseline justify-between gap-4 py-5">
            <h3 id="top-players" className="font-display text-2xl">Top rated</h3>
            <span className="text-xs text-muted-foreground">Overall rating</span>
          </div>
          <div className="grid grid-cols-[2rem_minmax(0,1fr)_4.5rem] gap-3 border-y border-border py-2 font-mono text-xs text-muted-foreground" aria-hidden>
            <span>#</span><span>Player</span><span className="text-right">Rating</span>
          </div>
          {top === undefined ? (
            <ul className="divide-y divide-border" aria-label="Loading top rated players" aria-busy>
              {[0, 1, 2, 3, 4].map((i) => (
                <li key={i} className="flex h-16 items-center gap-3">
                  <Skeleton className="size-8 rounded-sm" />
                  <Skeleton className="h-4 flex-1 rounded-sm" />
                  <Skeleton className="h-4 w-12 rounded-sm" />
                </li>
              ))}
            </ul>
          ) : top.length === 0 ? (
            <p className="py-8 text-sm leading-relaxed text-muted-foreground">
              No rated players yet. Finish a rated game to join the leaderboard.
            </p>
          ) : (
            <ol className="divide-y divide-border" aria-label="Top rated players">
              {top.map((row) => (
                <li key={row.playerId}>
                  <Link
                    prefetch={false}
                    href={profileHref(row.username)}
                    className={cn("group grid min-h-16 grid-cols-[2rem_minmax(0,1fr)_4.5rem] items-center gap-3 py-3 transition-colors hover:bg-secondary", focusRing)}
                  >
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">{String(row.rank).padStart(2, "0")}</span>
                    <span className="flex min-w-0 items-center gap-3">
                      <Avatar className="size-8 shrink-0">
                        {row.avatarUrl ? <AvatarImage src={row.avatarUrl} alt="" /> : null}
                        <AvatarFallback className="text-xs">{initials(row.username)}</AvatarFallback>
                      </Avatar>
                      <span className="truncate text-sm font-medium group-hover:text-primary">{row.username}</span>
                    </span>
                    <span className="text-right font-mono text-sm tabular-nums">{row.rating.toLocaleString("en-US")}</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
          <Link prefetch={false} href="/leaderboard" className={cn("mt-3 flex min-h-11 items-center justify-between gap-3 border-t border-border text-sm font-medium transition-colors hover:text-primary", focusRing)}>
            See the leaderboard <ArrowUpRight aria-hidden className="size-4" />
          </Link>
        </aside>
      </div>
    </Section>
  );
}
