"use client";
// src/components/game/accessibility/move-announcer.tsx  [P3]
// NFR-7: every position change is announced in an aria-live region. The text is
// derived from props only, so there is no state to keep in sync.
import type { Colour, GameStatus, LastMove, SquareId, Winner } from "@/lib/types";
import { formatColour, formatGameResult } from "@/lib/format";

export interface MoveAnnouncerProps {
  lastMove: LastMove | null;
  turn: Colour;
  checkSquare: SquareId | null;
  status: GameStatus;
  winner: Winner | undefined;
  whiteName: string;
  blackName: string;
  /** Null while live; announced instead of the turn when reviewing (FR-42). */
  reviewPly: number | null;
}

export function MoveAnnouncer({
  lastMove,
  turn,
  checkSquare,
  status,
  winner,
  whiteName,
  blackName,
  reviewPly,
}: MoveAnnouncerProps) {
  const parts: string[] = [];

  if (lastMove) {
    const mover = lastMove.colour === "w" ? whiteName : blackName;
    parts.push(`${mover} played ${lastMove.san}, ${lastMove.from} to ${lastMove.to}.`);
  }
  if (status !== "active" && status !== "waiting") {
    parts.push(formatGameResult(status, winner, undefined, { whiteName, blackName }));
  } else if (reviewPly !== null) {
    parts.push(`Reviewing move ${Math.ceil(reviewPly / 2)}.`);
  } else {
    if (checkSquare !== null) parts.push("Check.");
    parts.push(`${formatColour(turn)} to move.`);
  }

  return (
    <p aria-live="polite" aria-atomic="true" className="sr-only" data-slot="move-announcer">
      {parts.join(" ")}
    </p>
  );
}
