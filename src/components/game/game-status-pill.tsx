"use client";
// src/components/game/game-status-pill.tsx  [U2]
// UI_REDESIGN §5.1: 'Status pill (centre top): "Move 12 · White to move" /
// "Check" (ember) / "Reviewing move 8 · Back to live" (brass, clickable) /
// result text when over. Difficulty badge for AI games.'
//
// Plus one state the spec did not name: before the first move, a player who has
// never met a 3D board is told what to do — "Your move — pick a piece".
import { RadioIcon, RotateCcwIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatPill } from "@/components/ui-kit";
import { cn } from "@/lib/ui";

export interface GameStatusPillProps {
  /** null while live; otherwise the ply being reviewed. */
  reviewPly: number | null;
  /** Whole moves played so far. */
  moveNumber: number;
  /** "You", "Marco", "Player 2" — from `controller.turnLabel`. */
  turnLabel: string;
  active: boolean;
  inCheck: boolean;
  /** True when this viewer may move right now — `controller.canMove`. */
  canMove?: boolean;
  /** Half-moves played so far; 0 means nobody has touched the board yet. */
  totalPlies?: number;
  /** The SAN played at `reviewPly`, so every arrow press changes the pill
   *  (§4.8 item 6) instead of leaving it on the same whole-move number. */
  reviewSan?: string | null;
  /** Shown once the game is over, e.g. "White wins by checkmate". */
  resultText: string | null;
  onBackToLive(): void;
  className?: string;
}

export function GameStatusPill({
  reviewPly,
  moveNumber,
  turnLabel,
  active,
  inCheck,
  canMove = false,
  totalPlies = 1,
  reviewSan = null,
  resultText,
  onBackToLive,
  className,
}: GameStatusPillProps) {
  if (reviewPly !== null) {
    // Ply 0 is the position before White's first move, not "move 0".
    // From ply 1 the pill reads as a scoresheet entry — "12…Nf6" — so arrowing
    // one half-move at a time visibly changes it.
    const number = Math.ceil(reviewPly / 2);
    const notation =
      reviewSan === null || reviewSan === ""
        ? `move ${number}`
        : reviewPly % 2 === 1
          ? `${number}. ${reviewSan}`
          : `${number}…${reviewSan}`;
    const where = reviewPly === 0 ? "the start" : notation;
    return (
      // Every other state of this pill is a `role="status"` live region, and review
      // is a state change worth hearing. The role cannot go on the button itself —
      // that would replace its `button` role and the way out would stop announcing
      // itself as pressable — so the live region wraps it.
      <span role="status" className={cn("inline-flex shrink-0", className)}>
        <Button
          variant="ghost"
          onClick={onBackToLive}
          aria-label={`Reviewing ${where}. Go back to the live position.`}
          // 32px, the DESIGN.md button token (the base adds 36px on a coarse
          // pointer); shadcn's `sm` was 28px and off the ramp.
          className="h-8 gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 text-[13px] text-primary hover:bg-primary/20"
        >
          <RotateCcwIcon aria-hidden />
          <span className="tabular">Reviewing {where}</span>
          <span aria-hidden className="hidden opacity-60 sm:inline">
            ·
          </span>
          <span aria-hidden className="hidden font-medium sm:inline">
            Back to live
          </span>
        </Button>
      </span>
    );
  }

  if (!active) {
    return (
      <StatPill
        role="status"
        className={cn("shrink-0", className)}
        value={resultText ?? "Game over"}
      />
    );
  }

  if (inCheck) {
    return (
      <StatPill
        role="status"
        tone="danger"
        className={cn("shrink-0", className)}
        value={
          <span className="inline-flex items-center gap-1.5">
            <TriangleAlertIcon className="size-3.5" aria-hidden />
            Check
          </span>
        }
        label={
          <>
            <span className="sr-only">· </span>
            <span className="sr-only sm:not-sr-only">{turnLabel} to move</span>
          </>
        }
      />
    );
  }

  // Nobody has moved yet and the board is waiting on this viewer. "Move 1 · You to
  // move" is a scoreboard reading; the first thing a player needs is what to DO.
  if (canMove && totalPlies === 0) {
    return (
      <StatPill
        role="status"
        tone="live"
        dot
        className={cn("shrink-0", className)}
        // One string, not value + label: StatPill's two spans are separated by a
        // flex gap and NOT by a text node, so a split here would announce (and
        // copy) as "Your move— pick a piece".
        value="Your move — pick a piece"
      />
    );
  }

  return (
    <StatPill
      role="status"
      tone="live"
      dot
      className={cn("shrink-0", className)}
      value={`Move ${Math.max(1, moveNumber)}`}
      label={<span className="sr-only sm:not-sr-only">· {turnLabel} to move</span>}
    />
  );
}

/** The small "live position" marker used in the Moves tab footer. */
export function LivePositionNote({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-center gap-1.5 text-[12px] text-muted-foreground", className)}>
      <RadioIcon className="size-3.5 text-live" aria-hidden />
      Live position
    </p>
  );
}
