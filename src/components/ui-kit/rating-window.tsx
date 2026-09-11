// src/components/ui-kit/rating-window.tsx  [UI upgrade 2 §2.2 / §3.2.1]
// The rating window as a measuring bracket on a rating rail.
//
// Shared, because §3.2.1 says the lobby's waiting state shows "the same visual as
// the landing artefact, now live". The landing renders it with no numbers — the
// rail is the scale a rating sits on and the bracket is the shape of the queue's
// search, both labelled as such — and the lobby renders the same object with the
// player's own rating at the centre and the bracket widening with the real range.
//
// The one-time "breath" on reveal is `.window-bracket` in landing.css, keyed off the
// Reveal wrapper's `data-revealed`; the lobby loads no such rule, so there the
// bracket simply moves as the range changes.
import { QUEUE_BASE_RANGE, QUEUE_WIDEN_INTERVAL_MS } from "@/lib/constants";
import { cn } from "@/lib/ui";

/** Bottom to top of the rated pool, evenly spaced. */
const TICKS = [800, 1200, 1600, 2000, 2400] as const;

const RAIL_MIN = TICKS[0];
const RAIL_MAX = TICKS[TICKS.length - 1];

/** Where a rating falls on the rail, 0–100, clamped to the drawn scale. */
function railPercent(rating: number): number {
  return Math.min(100, Math.max(0, ((rating - RAIL_MIN) / (RAIL_MAX - RAIL_MIN)) * 100));
}

export interface RatingWindowProps extends Omit<React.ComponentProps<"figure">, "children"> {
  /**
   * The player's rating, which is where the bracket is centred. `null` (the
   * landing artefact) centres it on the rail and labels it "you".
   */
  rating?: number | null;
  /** ± rating points the bracket spans. `null` uses the artefact's resting shape. */
  range?: number | null;
  /** Replaces the default "±N to start · wider every Ns" line. */
  caption?: React.ReactNode;
}

export function RatingWindow({
  rating = null,
  range = null,
  caption,
  className,
  ...props
}: RatingWindowProps) {
  const live = rating !== null && range !== null;
  const centre = live ? railPercent(rating) : 50;
  const start = live ? railPercent(rating - range) : 27;
  const end = live ? railPercent(rating + range) : 73;

  return (
    <figure className={cn("w-full", className)} {...props}>
      <div className="relative h-16">
        <span
          className="tabular absolute top-0 -translate-x-1/2 font-mono text-[12px] font-medium text-primary"
          style={{ left: `${centre}%` }}
        >
          {live ? rating : "you"}
        </span>
        {/* The bracket: brass end caps and a top rule, the way a measurement is
            drawn on a plan. `window-bracket` carries the one-time breath. */}
        <div
          aria-hidden
          className="window-bracket absolute bottom-0 h-9 border-x-2 border-t-2 border-primary/70 transition-[left,width] duration-(--dur-room) ease-(--ease-out-soft)"
          style={{ left: `${start}%`, width: `${Math.max(2, end - start)}%` }}
        />
        <div
          aria-hidden
          className="absolute bottom-0 h-9 w-px -translate-x-1/2 bg-primary/45"
          style={{ left: `${centre}%` }}
        />
      </div>

      <div className="relative border-t border-border pt-2.5">
        {TICKS.map((tick, index) => (
          <span
            key={`tick-${tick}`}
            aria-hidden
            className="absolute top-0 h-1.5 w-px bg-border"
            style={{ left: `${index * 25}%` }}
          />
        ))}

        <div className="relative h-4">
          {TICKS.map((tick, index) => (
            <span
              key={tick}
              className={cn(
                "tabular absolute top-0 font-mono text-[12px] text-muted-foreground",
                index === 0 && "left-0",
                index === TICKS.length - 1 && "right-0",
              )}
              style={
                index === 0 || index === TICKS.length - 1
                  ? undefined
                  : { left: `${index * 25}%`, transform: "translateX(-50%)" }
              }
            >
              {tick}
            </span>
          ))}
        </div>
      </div>

      <figcaption className="tabular mt-4 text-center font-mono text-[12px] text-muted-foreground">
        {caption ??
          `±${QUEUE_BASE_RANGE} to start · wider every ${QUEUE_WIDEN_INTERVAL_MS / 1000}s`}
      </figcaption>
    </figure>
  );
}
