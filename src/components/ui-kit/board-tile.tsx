"use client";
// src/components/ui-kit/board-tile.tsx  [UI upgrade 2 §2.4 / §3.4]
// One game in progress, shown as the thing it is: a board with a player at each
// end. Shared, because §3.4 says the lobby's "At the boards" shows "the same
// board tiles as the landing" — one component, so the two cannot drift again.
//
// The board is never framed (DESIGN.md): the tile has no card around it, and the
// hover state warms the board's own hairline instead of drawing a box.
import Link from "next/link";
import { MiniBoard } from "./mini-board";
import { PlayerChip } from "./player-chip";
import { Skeleton } from "@/components/ui/skeleton";
import { pluralize } from "@/lib/format";
import { cn, focusRing } from "@/lib/ui";
import type { SquareId } from "@/lib/types";

/** Squares only. A visitor who cannot read the position is not shown a made-up one. */
const EMPTY_BOARD_FEN = "8/8/8/8/8/8/8/8 w - - 0 1";

export interface BoardTileGame {
  _id: string;
  whiteName: string;
  blackName: string;
  whiteRating: number;
  blackRating: number;
  moveCount: number;
  spectatorCount: number;
}

export interface BoardTileProps {
  game: BoardTileGame;
  /** The live position. `undefined` while it loads, `null` when it is gated. */
  fen: string | null | undefined;
  lastMove: { from: SquareId; to: SquareId } | null;
  /** Signed-in visitors get the link; everyone else gets the boards. */
  canWatch: boolean;
}

export function BoardTile({ game, fen, lastMove, canWatch }: BoardTileProps) {
  const meta = (
    <span className="tabular inline-flex shrink-0 items-center gap-1.5 font-mono text-[12px] text-muted-foreground">
      <span aria-hidden className="size-1.5 rounded-full bg-live motion-safe:animate-pulse" />
      {pluralize(game.moveCount, "move")}
      {game.spectatorCount > 0 ? ` · ${game.spectatorCount} watching` : null}
    </span>
  );

  const body = (
    <>
      <PlayerChip
        size="sm"
        side="b"
        name={game.blackName}
        rating={game.blackRating > 0 ? game.blackRating : null}
        className="min-w-0"
      />

      <div className="relative mt-2.5">
        {fen === undefined ? (
          <Skeleton className="aspect-square w-full rounded-md" />
        ) : (
          <MiniBoard
            fen={fen ?? EMPTY_BOARD_FEN}
            size={220}
            lastMove={lastMove}
            className={cn(
              "h-auto w-full rounded-md ring-border transition duration-(--dur-micro)",
              canWatch && "group-hover/tile:ring-primary/50",
            )}
          />
        )}
        {fen === null ? (
          <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center">
            <span className="rounded-full bg-bg-sunken/90 px-2.5 py-1 text-[12px] text-muted-foreground">
              Position hidden
            </span>
          </span>
        ) : null}
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-3">
        <PlayerChip
          size="sm"
          side="w"
          name={game.whiteName}
          rating={game.whiteRating > 0 ? game.whiteRating : null}
          className="min-w-0"
        />
        {meta}
      </div>
    </>
  );

  if (!canWatch) {
    return <li className="min-w-0 rounded-xl p-2">{body}</li>;
  }

  return (
    <li className="min-w-0">
      <Link
        prefetch={false}
        href={`/game/${game._id}`}
        aria-label={`Watch ${game.whiteName} against ${game.blackName}`}
        className={cn(
          "group/tile block cursor-pointer rounded-xl p-2 transition-colors duration-(--dur-micro)",
          "hover:bg-card",
          focusRing,
        )}
      >
        {body}
      </Link>
    </li>
  );
}
