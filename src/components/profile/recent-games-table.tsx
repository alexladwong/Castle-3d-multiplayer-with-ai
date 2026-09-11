"use client";
// src/components/profile/recent-games-table.tsx  [U4]
// UI_REDESIGN §6: recent games as rows with a 48px MiniBoard of the final
// position, the opponent, a result pill and a replay link. FR-53 — every row
// links to /game/[id], which opens finished games in review.
//
// The position comes from a per-row `games.get` subscription: `gamesForProfile`
// returns the summary only (no FEN, no move list) and its return validator is
// shared with `games.myRecentGames`, so widening it is not this package's call.
// A finished game is an immutable document, so those subscriptions never fire
// again after the first value — and the list is capped at RECENT_LIMIT.
import Link from "next/link";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { MiniBoard } from "@/components/ui-kit";
import { DIFFICULTIES } from "@/lib/difficulty";
import { DEFAULT_FEN } from "@/lib/constants";
import {
  formatColour,
  formatDate,
  formatMode,
  formatOutcome,
  outcomeFor,
  pluralize,
  type ResultOutcome,
} from "@/lib/format";
import type { Colour, Difficulty, GameMode, GameStatus, SquareId, Winner } from "@/lib/types";
import { cn } from "@/lib/ui";

const RECENT_LIMIT = 12;

const OUTCOME_CLASS: Record<ResultOutcome, string> = {
  win: "border-live/40 bg-live/12 text-live",
  loss: "border-destructive/40 bg-destructive/12 text-destructive",
  draw: "border-border bg-bg-sunken text-muted-foreground",
  ongoing: "border-primary/40 bg-primary/12 text-primary",
};

export interface RecentGame {
  _id: string;
  mode: GameMode;
  difficulty?: Difficulty;
  status: GameStatus;
  winner?: Winner;
  opponentName: string;
  myColour: Colour | null;
  moveCount: number;
  undoCount: number;
  rated: boolean;
  createdAt: number;
}

export interface RecentGameRowProps {
  game: RecentGame;
  /** The final position. Falls back to the opening position while it loads. */
  fen?: string;
  lastMove?: { from: SquareId; to: SquareId } | null;
}

/** Pure — the /dev/pages harness renders this with fixed positions. */
export function RecentGameRow({ game, fen, lastMove = null }: RecentGameRowProps) {
  const outcome = outcomeFor(game.status, game.winner, game.myColour);

  return (
    // `min-w-0` on the row and `overflow-hidden` on the text column: without both,
    // the row's non-wrapping meta line becomes the grid track's minimum width and
    // pushes the whole page sideways at 375 (measured: 536px of content in a 343px
    // column). `truncate` alone does not do it — it only clips once a width exists.
    <li className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
      <MiniBoard
        fen={fen ?? DEFAULT_FEN}
        size={48}
        orientation={game.myColour ?? "w"}
        lastMove={lastMove}
        label={`Final position against ${game.opponentName}`}
        className={cn(fen === undefined && "opacity-60")}
      />

      <div className="min-w-0 flex-1 overflow-hidden">
        <p className="truncate text-sm font-medium text-foreground">
          {game.opponentName}
          {game.myColour !== null ? (
            <span className="font-normal text-muted-foreground">
              {" "}
              · as {formatColour(game.myColour)}
            </span>
          ) : null}
        </p>
        <p className="truncate text-[12px] text-muted-foreground">
          {formatMode(game.mode)}
          {game.difficulty !== undefined ? ` · ${DIFFICULTIES[game.difficulty].label}` : ""}
          <span className="tabular font-mono"> · {pluralize(game.moveCount, "move")}</span>
          {" · "}
          {formatDate(game.createdAt)}
          {!game.rated ? " · unrated" : ""}
          {game.undoCount > 0 ? ` · ${pluralize(game.undoCount, "take-back")}` : ""}
        </p>
      </div>

      <span
        className={cn(
          "shrink-0 rounded-full border px-2.5 py-1 text-[12px] leading-none",
          OUTCOME_CLASS[outcome],
        )}
      >
        {formatOutcome(outcome)}
      </span>

      <Link
        prefetch={false}
        href={`/game/${game._id}`}
        aria-label={`${outcome === "ongoing" ? "Open" : "Replay"} the game against ${game.opponentName}`}
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "hidden sm:inline-flex")}
      >
        {outcome === "ongoing" ? "Open" : "Replay"}
      </Link>
    </li>
  );
}

function RecentGameRowLive({ game, enabled }: { game: RecentGame; enabled: boolean }) {
  // `games.get` requires an identity, so it stays skipped until Convex has
  // validated the session.
  const view = useQuery(
    api.games.get,
    enabled ? { gameId: game._id as Id<"games"> } : "skip",
  );
  const doc = view?.game;
  const last = doc?.lastMove;

  return (
    <RecentGameRow
      game={game}
      fen={doc?.fen}
      lastMove={
        last === undefined || last === null
          ? null
          : { from: last.from as SquareId, to: last.to as SquareId }
      }
    />
  );
}

/** Pure list — used directly by the /dev/pages harness. */
export function RecentGamesView({
  games,
  positions,
}: {
  games: RecentGame[];
  positions?: Record<string, string>;
}) {
  if (games.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
        No games played yet. The first one shows up here the moment it ends.
      </p>
    );
  }
  return (
    <ul className="grid gap-2">
      {games.map((game) => (
        <RecentGameRow key={game._id} game={game} fen={positions?.[game._id]} />
      ))}
    </ul>
  );
}

export function RecentGamesTable({ username }: { username: string }) {
  const { isAuthenticated } = useConvexAuth();
  const games = useQuery(api.games.gamesForProfile, { username, limit: RECENT_LIMIT });

  return (
    <section aria-label="Recent games" className="grid gap-3">
      <h2 className="eyebrow">Recent games</h2>

      {games === undefined ? (
        <div className="grid gap-2" aria-busy>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[4.5rem] w-full rounded-xl" />
          ))}
        </div>
      ) : games.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          No games played yet. The first one shows up here the moment it ends.
        </p>
      ) : (
        <ul className="grid gap-2">
          {games.map((game) => (
            <RecentGameRowLive key={game._id} game={game} enabled={isAuthenticated} />
          ))}
        </ul>
      )}
    </section>
  );
}
