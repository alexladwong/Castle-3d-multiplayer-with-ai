"use client";
// src/components/ai/engine-loading.tsx
//
// First-load state for the Stockfish worker (§E.4 step 3).
//
// The default build is stockfish@18.0.8 `lite-single` — 5.64 MB gzipped, so the first
// AI game of a session really does wait on a download. Its glue streams
// `{percent, loaded, total}` over a MessagePort (stockfish.md §4), which
// `use-stockfish` forwards into `aiStore.downloadPercent`, so the bar below is a REAL
// determinate progress bar for sf18.
//
// The no-SIMD fallback (stockfish@11.0.0, 669 KB gz) has no progress channel at all,
// so `downloadPercent` stays 0 there and the bar renders indeterminate until `uciok`
// (~108 ms warm).
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { useAiStore } from "@/lib/stores/ai-store";
import { useUiStore } from "@/lib/stores/ui-store";
import { cn } from "cn";

export interface EngineLoadingProps {
  /** Wire to `useAiTurn(...).retryEngine`. Omit to hide the retry button. */
  onRetry?: () => void;
  className?: string;
}

export function EngineLoading({ onRetry, className }: EngineLoadingProps) {
  const status = useAiStore((s) => s.engineStatus);
  const percent = useAiStore((s) => s.downloadPercent);
  const build = useUiStore((s) => s.engineBuild);

  if (status === "ready" || status === "idle") return null;

  if (status === "error") {
    return (
      <div
        role="alert"
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive",
          className,
        )}
      >
        <span className="flex-1">
          The chess engine could not start. The AI will still move, but more simply.
        </span>
        {onRetry !== undefined ? (
          <Button variant="outline" size="xs" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("space-y-1.5", className)} data-slot="engine-loading">
      <p className="text-xs text-muted-foreground" id="engine-loading-label">
        {percent > 0 && percent < 100
          ? `Loading chess engine… ${percent}%`
          : "Loading chess engine…"}
        {build === "sf11" ? " (compatibility engine)" : null}
      </p>
      <Progress
        // `value={null}` is Base UI's indeterminate mode — used until the first
        // progress event lands, and for the whole load on sf11 (no progress channel).
        value={percent > 0 ? percent : null}
        aria-labelledby="engine-loading-label"
        className="w-full"
      />
    </div>
  );
}
