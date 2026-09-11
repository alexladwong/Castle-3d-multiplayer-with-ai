"use client";
// src/components/game/game-result-dialog.tsx  [P3 → rebuilt U2 → UI_UPGRADE_2 §4.5 / §4.8 item 4]
// The verdict, said once. A Fraunces headline, one result line, one rating line
// in mono, and the three ways out in a single row.
//
// What this round removed: the inner box (a card inside a dialog is a nested
// card), and the badge cluster that restated in three chips what the sentence
// above it had already said. Initial focus lands on "Play again"; the page
// behind is inert while the dialog is open (Base UI's modal dialog does that).
//
// The delta and the take-back line stay EXCLUSIVE: a game with take-backs is
// unrated (FR-43), so it gets the sentence and no number.
//
// PURE: the rating row and the rematch mutation are fed in by `GameShell`, so
// /dev/game can open this dialog with no Convex at all.
import { useRef, useState } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Display } from "@/components/ui-kit";
import { formatEndReason, formatGameResult, formatRatingDelta, outcomeFor } from "@/lib/format";
import { cn } from "@/lib/ui";
import type { Colour, GameView } from "@/lib/types";

export interface GameResultDialogProps {
  view: GameView;
  /** The viewer's seat; null for spectators (they get a link, not a rematch). */
  seat: Colour | "both" | null;
  /** The viewer's rating change for this game, when there was one (FR-49). */
  rating: { delta: number; after: number } | null;
  /** True while the rematch mutation is in flight. */
  playAgainPending?: boolean;
  onPlayAgain(): void;
  /** Where "Back to lobby" goes. */
  lobbyHref?: string;
}

function headlineFor(view: GameView, seat: Colour | "both" | null): string {
  const { game } = view;
  const myColour: Colour | null = seat === "both" || seat === null ? null : seat;
  const outcome = outcomeFor(game.status, game.winner, myColour);
  if (outcome === "loss" && game.status === "resigned") return "You resigned";
  if (outcome === "win") return "You won";
  if (outcome === "loss") return "You lost";
  if (game.winner === "draw") return "Draw";
  return "Game over";
}

/** The host says small numbers as words: "one take-back", not "1 take-back". */
const NUMBER_WORDS = [
  "no",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
];

function spellCount(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

export function GameResultDialog({
  view,
  seat,
  rating,
  playAgainPending = false,
  onPlayAgain,
  lobbyHref = "/play",
}: GameResultDialogProps) {
  const { game } = view;
  const finished = game.status !== "active" && game.status !== "waiting";
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  // §4.8 item 4: focus lands on the thing most players want next, not on the
  // close button in the corner.
  const playAgainRef = useRef<HTMLButtonElement | null>(null);
  // `games.undo` resurrects a finished game (FR-43), so the SAME game can finish the
  // same way twice. `endedAt` is cleared by the take-back and rewritten by the next
  // finalize, which is what makes this key distinguish the two endings.
  const dismissKey = `${game._id}:${game.status}:${game.endedAt ?? 0}`;
  const open = finished && dismissedFor !== dismissKey;

  const myColour: Colour | null = seat === "both" || seat === null ? null : seat;
  const outcome = outcomeFor(game.status, game.winner, myColour);
  const detail = formatGameResult(game.status, game.winner, game.endReason, {
    whiteName: view.whiteName,
    blackName: view.blackName,
  });

  const takeBacks = game.undoCount;
  const seated = myColour !== null;
  const myRating =
    myColour === null ? null : (view[myColour === "w" ? "white" : "black"]?.rating ?? null);
  const verb = !seated ? "Played" : outcome === "win" ? "Won" : outcome === "loss" ? "Lost" : "Drew";
  // §4.8 item 4 and the Scoresheet Rule: this line is set in mono like the rating
  // line below it, and the rating itself is its own token, not a numeral buried in a
  // sentence.
  const takeBackLine =
    takeBacks === 0
      ? null
      : {
          text:
            `${verb} with ${spellCount(takeBacks)} take-back${takeBacks === 1 ? "" : "s"}` +
            (!seated ? "." : ", so the rating stays put"),
          rating: seated && myRating !== null ? myRating : null,
        };

  // One rating line, in mono, as prose. Never alongside the take-back sentence:
  // a take-back already unrated the game, and two answers to one question is
  // exactly the repetition this round set out to remove.
  const ratingLine =
    takeBacks > 0
      ? null
      : rating !== null
        ? {
            text: `Rating ${rating.after - rating.delta} → ${rating.after}`,
            delta: formatRatingDelta(rating.delta),
            up: rating.delta >= 0,
          }
        : null;

  const abandoned = game.status === "abandoned";
  const reason = game.endReason ? formatEndReason(game.endReason).replace(/^by /, "") : null;

  return (
    <Dialog
      open={open}
      modal
      onOpenChange={(next) => {
        if (!next) setDismissedFor(dismissKey);
      }}
    >
      <DialogContent
        // §4.5: dialogs float, so they rely on the shadow alone. The shadcn port
        // gives every popup a `ring-1` hairline; this one drops it.
        className="gap-3 sm:max-w-md"
        initialFocus={seat === null ? true : playAgainRef}
      >
        <DialogHeader>
          {/* The face and the size both ride on a child span, not on DialogTitle
              itself: the shadcn title already carries `font-heading text-base`,
              and a size set on the title loses to that `text-base` whichever way
              it is spelt. The span is what the reader sees and what the dialog is
              named by, and it sits on DESIGN.md's headline-sm step. */}
          <DialogTitle>
            <Display level={4} as="span" className="block">
              {headlineFor(view, seat)}
            </Display>
          </DialogTitle>
          {/* §4.8 item 4: never state the same fact twice. When the viewer has a
              seat the verdict above already says who won ("You won"), so this line
              carries only what the verdict does not — how it ended. Spectators and
              local games, where the verdict is "Game over" or "Draw", still get the
              full sentence with the names in it. */}
          <DialogDescription>
            {seated
              ? reason
                ? `${reason[0]?.toUpperCase()}${reason.slice(1)}.`
                : detail
              : `${detail}${
                  reason && !detail.toLowerCase().includes(reason.toLowerCase())
                    ? ` — ${reason}`
                    : ""
                }`}
            {abandoned ? " Your opponent left the game." : ""}
          </DialogDescription>
        </DialogHeader>

        {ratingLine ? (
          <p className="tabular font-mono text-[13px] text-muted-foreground">
            {ratingLine.text}{" "}
            <span
              className={cn("font-medium", ratingLine.up ? "text-primary" : "text-destructive")}
            >
              {ratingLine.delta}
            </span>
          </p>
        ) : takeBackLine ? (
          <p className="tabular font-mono text-[13px] text-muted-foreground">
            {takeBackLine.text}
            {takeBackLine.rating === null ? null : (
              <>
                {" — "}
                <span className="font-medium text-foreground">{takeBackLine.rating}</span>
              </>
            )}
          </p>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            {game.rated ? "This game counted toward your rating." : "This game was unrated."}
          </p>
        )}

        {/* One order at both widths: the shadcn footer reverses its column on
            mobile, which turned "Review game … Back to lobby, Play again" into
            "Back to lobby, Play again … Review game" on a phone. */}
        <DialogFooter className="flex-row flex-wrap items-center sm:justify-between">
          <Button variant="ghost" onClick={() => setDismissedFor(dismissKey)}>
            Review game
          </Button>
          <div className="flex flex-wrap gap-2">
            <Link
              prefetch={false}
              href={lobbyHref}
              // Ghost, not outline: a bordered, filled control inside a dialog is a
              // card inside a card, and this row already has its one brass action.
              className={buttonVariants({ variant: "ghost" })}
            >
              Back to lobby
            </Link>
            {seat === null ? null : (
              <Button
                ref={playAgainRef}
                // The brass fill is its own edge inside a dialog, so it drops the
                // shared Button's 1px transparent border.
                className="border-0"
                disabled={playAgainPending}
                onClick={onPlayAgain}
              >
                Play again
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
