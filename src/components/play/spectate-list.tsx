"use client";
// src/components/play/spectate-list.tsx  [U5]
// "At the boards" (UI_UPGRADE_2 §3.4): the games in progress as the SAME board
// tiles the landing shows — `BoardTile` from the shared kit, a MiniBoard of the
// live position with a player chip at each end, the baize live dot and the whole
// tile as one link. This file keeps the Convex plumbing; the tile itself is
// shared so the two surfaces cannot drift apart.
//
// Why a per-card subscription for the position: `games.listLive` returns names,
// ratings and counts but no FEN, and its return validator is shared with the
// landing ticker, so widening it is not this package's call. `games.get` is the
// existing query that carries the position, and a live game is a document that
// changes a few times a minute — a handful of extra subscriptions on a lobby page
// is the cheaper half of that trade. The grid is capped at LIVE_GRID_LIMIT for
// exactly that reason.
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { BoardTile } from "@/components/ui-kit";
import { Skeleton } from "@/components/ui/skeleton";
import type { SquareId } from "@/lib/types";

/** Nine cards fill three rows at the widest breakpoint and cap the subscriptions. */
export const LIVE_GRID_LIMIT = 9;

const GRID_CLASS = "grid gap-4 sm:grid-cols-2 lg:grid-cols-3";

const EMPTY_TEXT = "No live games right now. Start one and it will show up here.";

export interface SpectateGame {
  _id: string;
  whiteName: string;
  blackName: string;
  whiteRating: number;
  blackRating: number;
  moveCount: number;
  spectatorCount: number;
}

export interface SpectateCardViewProps {
  game: SpectateGame;
  /** The live position. Falls back to the opening position while it loads. */
  fen?: string;
  lastMove?: { from: SquareId; to: SquareId } | null;
}

/** Pure — the /dev/pages harness renders this with fixed positions.
 *
 *  §3.4: "the same board tiles as the landing". It IS the landing's tile now —
 *  `BoardTile` moved into the shared kit so the two surfaces cannot drift apart
 *  again. `fen === undefined` is the loading state (a skeleton, not a made-up
 *  position), which is exactly what the per-card subscription below hands it. */
export function SpectateCardView({ game, fen, lastMove = null }: SpectateCardViewProps) {
  return <BoardTile game={game} fen={fen} lastMove={lastMove} canWatch />;
}

function SpectateEmpty() {
  return (
    <p className="rounded-xl bg-bg-sunken px-4 py-10 text-center text-sm text-muted-foreground">
      {EMPTY_TEXT}
    </p>
  );
}

function SpectateCard({ game, enabled }: { game: SpectateGame; enabled: boolean }) {
  // `games.get` requires an identity, so it stays skipped until Convex has
  // validated the session — otherwise the first render throws inside the query.
  const view = useQuery(
    api.games.get,
    enabled ? { gameId: game._id as Id<"games"> } : "skip",
  );
  const doc = view?.game;
  const last = doc?.lastMove;

  return (
    <SpectateCardView
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

export interface SpectateGridViewProps {
  games: SpectateGame[];
  /** Renders the MiniBoards from these FENs instead of subscribing (harness only). */
  positions?: Record<string, string>;
}

/** Pure grid — used directly by the /dev/pages harness. */
export function SpectateGridView({ games, positions }: SpectateGridViewProps) {
  if (games.length === 0) return <SpectateEmpty />;
  return (
    <ul className={GRID_CLASS}>
      {games.map((game) => (
        <SpectateCardView key={game._id} game={game} fen={positions?.[game._id]} />
      ))}
    </ul>
  );
}

/** FR-8. `games.listLive` is public and already filtered to online games. */
export function SpectateList({ enabled }: { enabled: boolean }) {
  const games = useQuery(api.games.listLive, { limit: LIVE_GRID_LIMIT });

  if (games === undefined) {
    return (
      <ul className={GRID_CLASS} aria-busy>
        {Array.from({ length: 3 }, (_, i) => (
          <li key={i} className="min-w-0 p-2">
            <Skeleton className="mb-2.5 h-6 w-32 rounded-full" />
            <Skeleton className="aspect-square w-full rounded-md" />
            <Skeleton className="mt-2.5 h-6 w-32 rounded-full" />
          </li>
        ))}
      </ul>
    );
  }

  if (games.length === 0) return <SpectateEmpty />;

  return (
    <ul className={GRID_CLASS}>
      {games.map((game) => (
        <SpectateCard
          key={game._id}
          enabled={enabled}
          game={{
            _id: game._id,
            whiteName: game.whiteName,
            blackName: game.blackName,
            whiteRating: game.whiteRating,
            blackRating: game.blackRating,
            moveCount: game.moveCount,
            spectatorCount: game.spectatorCount,
          }}
        />
      ))}
    </ul>
  );
}
