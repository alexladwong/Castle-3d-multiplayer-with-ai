"use client";
// src/components/landing/notation-strip.tsx  [U1]
// "A mono notation strip under it prints the moves as they land" (§1.4): one line,
// muted, newest move in --fg, scrolled to the latest move. Fixed height, because it
// sits directly under the hero canvas and must never move the caption.
import { useEffect, useRef } from "react";
import { cn, useReducedMotion } from "@/lib/ui";

export interface NotationStripProps {
  /** The whole game; `ply` decides how much of it has been played. */
  moves: readonly string[];
  /** Half-moves landed so far. */
  ply: number;
  className?: string;
}

export function NotationStrip({ moves, ply, className }: NotationStripProps) {
  const reducedMotion = useReducedMotion();
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const newest = scroller.querySelector<HTMLElement>("[data-newest='true']");
    if (!newest) {
      scroller.scrollLeft = 0;
      return;
    }
    // scrollIntoView would scroll the PAGE as well as this box; compute the offset
    // instead. `scroller` is positioned, so offsetLeft is relative to it.
    const left = newest.offsetLeft + newest.offsetWidth - scroller.clientWidth + 24;
    scroller.scrollTo({ left: Math.max(0, left), behavior: reducedMotion ? "auto" : "smooth" });
  }, [ply, reducedMotion]);

  const played = moves.slice(0, ply);

  return (
    <div
      ref={scrollerRef}
      className={cn(
        // `no-scrollbar` is the shared utility in globals.css (integration pass);
        // it hides the bar in both engines without touching scrollability.
        "no-scrollbar relative h-7 overflow-x-auto overflow-y-hidden",
        "[mask-image:linear-gradient(to_right,transparent,black_16px)]",
        className,
      )}
    >
      <ol
        aria-label="Moves played so far"
        className="tabular flex h-7 items-center gap-x-1.5 pr-6 pl-4 font-mono text-[13px] whitespace-nowrap text-muted-foreground"
      >
        {played.map((san, index) => {
          const newest = index === played.length - 1;
          return (
            <li key={`${index}-${san}`} className="flex shrink-0 items-center gap-1.5">
              {index % 2 === 0 ? (
                <span className="text-muted-foreground">{index / 2 + 1}.</span>
              ) : null}
              <span
                data-newest={newest ? "true" : "false"}
                className={newest ? "text-foreground" : undefined}
              >
                {san}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
