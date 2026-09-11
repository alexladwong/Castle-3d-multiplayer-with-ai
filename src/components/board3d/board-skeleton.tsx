// src/components/board3d/board-skeleton.tsx
// The one loading state the 3D board has, shared by the two places that can be waiting:
// `board-3d-loader.tsx` while the ~1.2 MB chunk downloads, and `board-3d.tsx` from the
// moment the Canvas mounts until the renderer has actually put a frame on screen.
//
// Those two waits are consecutive and the second is the longer one (the piece GLB and
// the room HDRI both suspend inside the Canvas, and a WebGL canvas is transparent until
// something is drawn into it), so a skeleton that only covered the first left a bordered
// empty rectangle sitting in the board's ring for the rest of the wait.
"use client";
import { cn } from "@/lib/ui";

export interface Board3DSkeletonProps {
  className?: string;
}

/**
 * Deliberately tonal rather than decorative: a slow breath of light on the espresso
 * ground (the pulse is killed globally under `prefers-reduced-motion` by globals.css)
 * and one plain line of copy. `role="status"` announces it once; there is no second
 * sr-only string to double it up.
 *
 * FRAMELESS on purpose. DESIGN.md, Don'ts: "Don't frame the 3D board with a border,
 * card or box; its light is its edge." This skeleton covers the two consecutive waits
 * before the first frame, so a rounded hairline box here put the removed frame back on
 * screen for exactly as long as anyone was watching for it — and then snapped it away.
 * A soft radial wash carries the wait instead: no ring, no radius, no rectangle.
 */
export function Board3DSkeleton({ className }: Board3DSkeletonProps) {
  return (
    <div
      role="status"
      className={cn("grid h-full w-full place-items-center bg-background", className)}
    >
      <div
        aria-hidden
        className="col-start-1 row-start-1 h-full w-full animate-pulse bg-[radial-gradient(ellipse_at_center,var(--color-bg-elevated)_0%,transparent_70%)]"
      />
      <span className="col-start-1 row-start-1 text-sm text-fg-muted">Setting the board…</span>
    </div>
  );
}

export default Board3DSkeleton;
