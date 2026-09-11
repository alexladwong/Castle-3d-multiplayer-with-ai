"use client";
// src/components/landing/seat-preview.tsx  [UI upgrade 2 §2.2]
// The artefact beside "Pass and play": one board that turns to face whoever is
// to move, with the two seat chips swapping ends as it turns — which is the
// whole of what pass-and-play does.
//
// It turns once when the row scrolls in (the row's own small motion, §2.6) and
// again whenever the row is hovered or focused. Under reduced motion it never
// turns: white stays at the bottom and the chips stay put.
import { useEffect, useState } from "react";
import { MiniBoard } from "@/components/ui-kit";
import { DEFAULT_FEN } from "@/lib/constants";
import { cn, useReducedMotion, useReveal } from "@/lib/ui";
import type { Colour } from "@/lib/types";

/** How long the board rests on black during the one automatic turn. */
const DEMO_HOLD_MS = 1700;
const DEMO_DELAY_MS = 500;

function SeatChip({ side, name }: { side: Colour; name: string }) {
  return (
    <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
      <span
        aria-hidden
        className={cn(
          "size-2.5 shrink-0 rounded-full border",
          side === "w" ? "border-board-light/70 bg-board-light" : "border-board-dark bg-board-dark",
        )}
      />
      <span className="font-medium text-foreground">{side === "w" ? "White" : "Black"}</span>
      <span aria-hidden>·</span>
      {name}
    </p>
  );
}

export interface SeatPreviewProps {
  /** The row is hovered or focused. */
  active: boolean;
  className?: string;
}

export function SeatPreview({ active, className }: SeatPreviewProps) {
  const reducedMotion = useReducedMotion();
  const { ref, revealed } = useReveal<HTMLDivElement>({ disabled: reducedMotion });
  const [demo, setDemo] = useState(false);

  // One turn on reveal, then back — the artefact showing its own trick once.
  useEffect(() => {
    if (!revealed || reducedMotion) return;
    const turn = window.setTimeout(() => setDemo(true), DEMO_DELAY_MS);
    const back = window.setTimeout(() => setDemo(false), DEMO_DELAY_MS + DEMO_HOLD_MS);
    return () => {
      window.clearTimeout(turn);
      window.clearTimeout(back);
    };
  }, [revealed, reducedMotion]);

  const flipped = !reducedMotion && (active || demo);
  const orientation: Colour = flipped ? "b" : "w";
  const top = flipped ? "w" : "b";
  const bottom = flipped ? "b" : "w";

  return (
    <div ref={ref} className={cn("flex flex-col items-center gap-3 lg:items-end", className)}>
      <SeatChip side={top} name={top === "w" ? "Player 1" : "Player 2"} />

      <MiniBoard
        fen={DEFAULT_FEN}
        orientation={orientation}
        size={200}
        label="A board that turns to face whoever is to move"
        className="h-auto w-full max-w-[13rem] rounded-md transition-opacity duration-(--dur-room)"
      />

      <SeatChip side={bottom} name={bottom === "w" ? "Player 1" : "Player 2"} />
    </div>
  );
}
