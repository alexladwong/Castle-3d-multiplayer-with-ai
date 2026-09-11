"use client";
// src/components/game/board-surface.tsx  [P3]
// Picks Board2D or P4's Board3D from the ui-store and hands it `BoardViewProps`.
// It sits BELOW the controller (§D.11.8), so a view swap never unmounts the game
// state: selection and review ply survive (FR-14).
import { useCallback, useEffect } from "react";
import { toast } from "sonner";
import { Board2D } from "@/components/board2d/board-2d";
import { resolveRoom } from "@/lib/rooms";
import { useUiStore } from "@/lib/stores/ui-store";
import { probeWebgl, renderFailureMessage } from "@/lib/webgl";
import type { BoardViewProps, RenderFailureReason } from "@/lib/types";
import { Board3DLoader, preloadBoard3D } from "./board-3d-loader";

export function BoardSurface(props: BoardViewProps) {
  const hydrated = useUiStore((s) => s.hydrated);
  const boardView = useUiStore((s) => s.boardView);
  const webglAvailable = useUiStore((s) => s.webglAvailable);

  // Safety net: <PlayerSync /> (P2) normally rehydrates the persisted settings.
  // `rehydrate()` is idempotent (§D.12.8), so calling it here cannot double-apply,
  // and it stops the board from being stuck behind the `hydrated` gate.
  useEffect(() => {
    if (useUiStore.getState().hydrated) return;
    void useUiStore.persist.rehydrate();
  }, []);

  // §E.10.1: probe BEFORE anything mounts a <Canvas>; three r185 is WebGL2-only
  // and fiber swallows the renderer-constructor throw.
  useEffect(() => {
    if (useUiStore.getState().webglAvailable !== null) return;
    const probe = probeWebgl();
    useUiStore.getState().setWebglAvailable(probe.ok);
    if (!probe.ok && probe.reason !== null) {
      toast.info(renderFailureMessage(probe.reason)); // FR-19
    }
  }, []);

  // NFR-10 / FR-21g: honour the OS reduced-motion preference for both boards.
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => useUiStore.getState().setReducedMotion(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  // NFR-2a: warm the 3D chunk (and the active room's HDRI) once the page mounts.
  const roomPreset = useUiStore((s) => s.roomPreset);
  const roomColors = useUiStore((s) => s.roomColors);
  useEffect(() => {
    if (useUiStore.getState().webglAvailable === false) return;
    const room = resolveRoom(roomPreset, roomColors);
    const id = setTimeout(() => void preloadBoard3D([room.hdri]).catch(() => undefined), 0);
    return () => clearTimeout(id);
  }, [roomPreset, roomColors]);

  const onRenderFailure = useCallback((reason: RenderFailureReason) => {
    useUiStore.getState().setWebglAvailable(false); // forces boardView back to "2d"
    toast.error(renderFailureMessage(reason));
  }, []);

  if (!hydrated) {
    // Same markup on the server and on the first client render (§D.12.6).
    return (
      <div
        className="size-full animate-pulse rounded-xl bg-muted"
        role="status"
        aria-label="Loading the board"
      />
    );
  }

  if (boardView === "3d" && webglAvailable !== false) {
    // Board3D fills its parent (`h-full`); U2's shell owns the square box around
    // this component, so both views occupy exactly the same space.
    return (
      // `[&>*]:min-h-0` cancels the `min-h-[320px]` Board3D carries for standalone
      // mounts. Inside the shell the box is a SQUARE the shell already sized, so on a
      // phone (241px wide before U2's mobile pass, ~390px after) that floor made the
      // canvas taller than its own frame and `overflow-hidden` sliced the bottom rank
      // off the board. The board decides nothing about its size here: the square does.
      // DESIGN.md: "Don't frame the 3D board with a border, card or box; its light
      // is its edge." UI_UPGRADE_2 §4.2: the canvas is not the board square, it
      // fills the whole board column, so its edges land on the column's own seams
      // (the nameplates above and below, the sidebar hairline) and the room reads as
      // the column's background. No mask: the owner asked for the room to stay
      // sharp to the edge (2026-09-11) — the earlier dissolve smeared the backdrop
      // into a brown halo, worst on the ivory ground of the light theme. The 2D
      // branch below keeps the square: its outer files and ranks are information.
      <div className="size-full overflow-hidden [&>*]:min-h-0">
        {/* §5.1 puts White / Black / Top / Orbit / Reset in the shell's own action
            bar (and in the mobile "More" sheet and the focus HUD), so the in-canvas
            copy of the same five buttons is redundant here and sits over the bottom
            rank of the board. Hiding it is presentation only: the wrapper stays a
            `role="application"` widget and the arrow / +- / R camera keys (NFR-7)
            still work when the board has focus. */}
        <Board3DLoader {...props} hideControls onRenderFailure={onRenderFailure} />
      </div>
    );
  }
  return (
    // §4.2: the shell keeps the square box around THIS branch only — the 2D board
    // stays a centred square with square corners, while the 3D canvas above fills
    // the whole column.
    <div className="grid size-full place-items-center">
      <Board2D {...props} />
    </div>
  );
}
