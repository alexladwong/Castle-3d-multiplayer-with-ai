"use client";
// src/hooks/use-heartbeat.ts  [P3]
// FR-32 / §E.9. Writes the caller's `presence` row every 15 s while the game is
// active and the tab is visible. It never touches the game document, so it does
// not push a new doc to the other subscribers (§I-2).
import { useEffect } from "react";
import { useMutation } from "convex/react";
import { HEARTBEAT_INTERVAL_MS } from "@/lib/constants";
import type { GameId } from "@/lib/types";
import { api } from "../../convex/_generated/api";

/**
 * `enabled` should be false for finished games and while the viewer is not
 * signed in — `games.heartbeat` requires a provisioned player.
 */
export function useHeartbeat(gameId: GameId, enabled: boolean): void {
  const heartbeat = useMutation(api.games.heartbeat);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const beat = () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      // Presence is best-effort: a failed beat must never surface as a game error.
      void heartbeat({ gameId }).catch(() => undefined);
    };

    beat();
    const id = setInterval(beat, HEARTBEAT_INTERVAL_MS);
    document.addEventListener("visibilitychange", beat);

    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [gameId, enabled, heartbeat]);
}
