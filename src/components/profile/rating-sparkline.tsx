"use client";
// src/components/profile/rating-sparkline.tsx  [U4]
// The rating card of UI_REDESIGN §6. FR-53: hand-rolled inline SVG — no chart
// library, no extra dependency.
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Eyebrow } from "@/components/ui-kit";
import { formatRating, formatRatingDelta } from "@/lib/format";
import type { RatingPool } from "@/lib/types";
import { cn, focusRing } from "@/lib/ui";

const HISTORY_LIMIT = 60;

type Pool = RatingPool | "all";

const POOLS: ReadonlyArray<{ value: Pool; label: string }> = [
  { value: "all", label: "All" },
  { value: "human", label: "vs Humans" },
  { value: "ai", label: "vs AI" },
];

/**
 * Both degenerate cases have to be guarded or the `points` string fills with
 * NaN and the polyline silently renders nothing: a single point (divide by
 * `n - 1 === 0`) and a flat history (divide by `span === 0`).
 */
export function Sparkline({
  values,
  width = 320,
  height = 72,
  strokeWidth = 2,
  className,
}: {
  values: number[];
  width?: number;
  height?: number;
  strokeWidth?: number;
  className?: string;
}) {
  if (values.length === 0) return null;

  const p = strokeWidth; // padding keeps the stroke inside the viewBox
  const n = values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;

  const points = values.map((value, i) => {
    const x = n > 1 ? p + (i * (width - 2 * p)) / (n - 1) : width / 2;
    const y = span === 0 ? height / 2 : p + (1 - (value - min) / span) * (height - 2 * p);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const first = values[0];
  const last = values[n - 1];
  const trend =
    last > first ? "text-live" : last < first ? "text-destructive" : "text-muted-foreground";
  const [lastX, lastY] = points[n - 1].split(",");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      // `min-w-0`: the viewBox gives this SVG an intrinsic width (~356px at
      // this height), which would otherwise be the grid track's minimum.
      className={cn("h-20 w-full min-w-0", trend, className)}
      role="img"
      aria-label={`Rating history from ${formatRating(first)} to ${formatRating(last)}`}
      preserveAspectRatio="none"
    >
      <polygon
        points={`${p},${height} ${points.join(" ")} ${width - p},${height}`}
        fill="currentColor"
        fillOpacity={0.12}
      />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={lastX} cy={lastY} r={strokeWidth * 1.6} fill="currentColor" />
    </svg>
  );
}

export interface RatingSparklineViewProps {
  pool: Pool;
  onPoolChange(pool: Pool): void;
  /** undefined = still loading. */
  values?: number[];
  gameCount: number;
}

/** Pure — the /dev/pages harness renders this with a fixed series. */
export function RatingSparklineView({
  pool,
  onPoolChange,
  values,
  gameCount,
}: RatingSparklineViewProps) {
  const net =
    values !== undefined && values.length > 1 ? values[values.length - 1] - values[0] : 0;

  return (
    <section
      aria-label="Rating history"
      className="grid gap-4 rounded-xl border border-border bg-card p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Eyebrow as="span">Rating history</Eyebrow>
        <div role="group" aria-label="Rating pool" className="flex flex-wrap gap-1.5">
          {POOLS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={option.value === pool}
              onClick={() => onPoolChange(option.value)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[12px] leading-none transition-colors",
                focusRing,
                option.value === pool
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {values === undefined ? (
        <Skeleton className="h-20 w-full" />
      ) : values.length < 2 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Not enough rated games in this pool yet to draw a line.
        </p>
      ) : (
        <div className="grid gap-2">
          <Sparkline values={values} />
          <p className="tabular font-mono text-[12px] text-muted-foreground">
            {formatRating(values[0])} → {formatRating(values[values.length - 1])} (
            {formatRatingDelta(net)}) over {gameCount} rated{" "}
            {gameCount === 1 ? "game" : "games"}
          </p>
        </div>
      )}
    </section>
  );
}

export function RatingSparkline({ username }: { username: string }) {
  const [pool, setPool] = useState<Pool>("all");
  const history = useQuery(api.ratingHistory.forPlayer, {
    username,
    pool,
    limit: HISTORY_LIMIT,
  });

  // Rows arrive oldest-first, so prefixing the first row's `before` gives the
  // starting rating and n+1 points for n rated games.
  const values =
    history === undefined
      ? undefined
      : history.length === 0
        ? []
        : [history[0].before, ...history.map((row) => row.after)];

  return (
    <RatingSparklineView
      pool={pool}
      onPoolChange={setPool}
      values={values}
      gameCount={history?.length ?? 0}
    />
  );
}
