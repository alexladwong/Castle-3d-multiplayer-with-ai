"use client";
// src/hooks/use-review.ts  [P3]
// Review / replay ply navigation (FR-42, FR-54, §E.8). Owned by the controller so
// the review position survives a 2D<->3D swap (FR-14).
import { useCallback, useEffect, useState } from "react";
import { REPLAY_AUTOPLAY_MS } from "@/lib/constants";

interface ReviewState {
  /** null = live. */
  ply: number | null;
  /** True when the last navigation moved at most one ply (drives animation). */
  stepped: boolean;
}

export interface ReviewController {
  /** Clamped to `[0, totalPlies)`; null means "showing the live position". */
  reviewPly: number | null;
  isLive: boolean;
  autoplay: boolean;
  /** True when the last jump was a single step — larger jumps are not animated (§E.8.6). */
  stepped: boolean;
  goToPly(ply: number | null): void;
  stepReview(delta: number): void;
  setAutoplay(on: boolean): void;
}

const LIVE: ReviewState = { ply: null, stepped: true };

/**
 * `totalPlies` is `game.moves.length`. A take-back shortens it, so the stored ply is
 * clamped on read rather than corrected in an effect (no cascading renders).
 */
export function useReview(totalPlies: number): ReviewController {
  const [state, setState] = useState<ReviewState>(LIVE);
  const [autoplay, setAutoplayState] = useState(false);

  // Clamp on read: ply === totalPlies is the live position, so it collapses to null.
  const raw = state.ply;
  const reviewPly =
    raw === null || raw >= totalPlies ? null : Math.max(0, Math.min(raw, totalPlies));
  const isLive = reviewPly === null;

  const goToPly = useCallback(
    (ply: number | null) => {
      if (ply === null) {
        setState((prev) => ({
          ply: null,
          stepped: prev.ply === null || Math.abs(totalPlies - prev.ply) <= 1,
        }));
        setAutoplayState(false);
        return;
      }
      setState((prev) => {
        const next = Math.max(0, Math.min(Math.round(ply), totalPlies));
        const from = prev.ply === null ? totalPlies : prev.ply;
        const stepped = Math.abs(next - from) <= 1;
        if (next >= totalPlies) return { ply: null, stepped };
        return { ply: next, stepped };
      });
      if (ply >= totalPlies) setAutoplayState(false);
    },
    [totalPlies],
  );

  const stepReview = useCallback(
    (delta: number) => {
      setState((prev) => {
        const from = prev.ply === null ? totalPlies : prev.ply;
        const next = Math.max(0, Math.min(from + delta, totalPlies));
        const stepped = Math.abs(next - from) <= 1;
        if (next >= totalPlies) return { ply: null, stepped };
        return { ply: next, stepped };
      });
    },
    [totalPlies],
  );

  const setAutoplay = useCallback(
    (on: boolean) => {
      if (on && totalPlies === 0) return;
      if (on) {
        // Pressing play while live restarts the replay from the first move.
        setState((prev) => (prev.ply === null ? { ply: 0, stepped: false } : prev));
      }
      setAutoplayState(on);
    },
    [totalPlies],
  );

  // Autoplay ticks one ply at a time; reaching the end returns to live (§E.8.4).
  useEffect(() => {
    if (!autoplay) return;
    const id = setInterval(() => {
      setState((prev) => {
        const from = prev.ply === null ? totalPlies : prev.ply;
        const next = from + 1;
        if (next >= totalPlies) return { ply: null, stepped: true };
        return { ply: next, stepped: true };
      });
    }, REPLAY_AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [autoplay, totalPlies]);

  // Stop autoplay once the replay has returned to the live position.
  useEffect(() => {
    if (!autoplay || !isLive) return;
    const id = setTimeout(() => setAutoplayState(false), 0);
    return () => clearTimeout(id);
  }, [autoplay, isLive]);

  return {
    reviewPly,
    isLive,
    autoplay,
    stepped: state.stepped,
    goToPly,
    stepReview,
    setAutoplay,
  };
}
