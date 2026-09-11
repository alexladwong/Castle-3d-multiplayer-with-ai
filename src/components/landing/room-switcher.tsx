"use client";
// src/components/landing/room-switcher.tsx  [UI upgrade 2 §2.1]
// The room switcher moved into the hero: a segmented control of five buttons,
// each a 36px swatch painted from the room's own floor and key-light colours
// (src/lib/rooms.ts) with the label beside it. Hover previews, click commits,
// arrow keys move between rooms and take the selection with them.
//
// The `<ul id="rooms">` and its five buttons are pinned by e2e/public.spec.ts;
// nothing else may live inside that list.
import { useCallback, useEffect, useRef } from "react";
import { preloadBoard3D } from "@/components/board3d/board-3d-loader";
import { ROOMS, ROOM_ORDER } from "@/lib/rooms";
import { useUiStore } from "@/lib/stores/ui-store";
import { cn, focusRing } from "@/lib/ui";
import type { RoomPresetId } from "@/lib/types";
import { useMediaQuery } from "./use-in-view";

type RoomId = Exclude<RoomPresetId, "custom">;

/** Long enough to survive a pointer crossing the strip, short enough to feel live. */
const HOVER_DELAY_MS = 120;

/**
 * The two halves of the swatch, both read out of the room preset:
 * the light is the key light the room actually lights the board with, the floor
 * is whatever that room stands on (a painted floor, its flat background, or —
 * for the HDRI rooms — the dark squares the room gives the board).
 */
function swatchColours(id: RoomId): { light: string; floor: string } {
  const room = ROOMS[id];
  return {
    light: room.lights.key.color,
    floor: room.floor.color ?? room.backgroundColor ?? room.board.darkSquare,
  };
}

export interface RoomSwitcherProps {
  /** The committed room — the one the board sits in when nothing is hovered. */
  value: RoomId;
  /** Commit a room (click, or arrow keys). */
  onChange(room: RoomId): void;
  /** Preview a room without committing; `null` returns the board to `value`. */
  onPreview(room: RoomId | null): void;
  className?: string;
}

export function RoomSwitcher({ value, onChange, onPreview, className }: RoomSwitcherProps) {
  const canHover = useMediaQuery("(hover: hover)");
  const hoverTimer = useRef<number | null>(null);
  const warmed = useRef(new Set<string>());
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const cancelHover = useCallback(() => {
    if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  }, []);

  useEffect(() => cancelHover, [cancelHover]);

  /** Warm the room's HDRI (and the 3D chunk) the moment a visitor shows intent. */
  const warm = useCallback((room: RoomId) => {
    if (useUiStore.getState().webglAvailable === false) return;
    const hdri = ROOMS[room].hdri;
    if (warmed.current.has(hdri)) return;
    warmed.current.add(hdri);
    void preloadBoard3D([hdri]).catch(() => undefined);
  }, []);

  const commit = useCallback(
    (room: RoomId) => {
      cancelHover();
      warm(room);
      onPreview(null);
      onChange(room);
    },
    [cancelHover, onChange, onPreview, warm],
  );

  // Roving arrow keys across the group; selection follows focus, which is what a
  // segmented control does and what makes the preview reachable without a mouse.
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      const step =
        event.key === "ArrowRight" || event.key === "ArrowDown"
          ? 1
          : event.key === "ArrowLeft" || event.key === "ArrowUp"
            ? -1
            : event.key === "Home"
              ? -index
              : event.key === "End"
                ? ROOM_ORDER.length - 1 - index
                : 0;
      if (step === 0) return;
      event.preventDefault();
      const next = (index + step + ROOM_ORDER.length) % ROOM_ORDER.length;
      buttons.current[next]?.focus();
      commit(ROOM_ORDER[next]!);
    },
    [commit],
  );

  return (
    <ul
      id="rooms"
      aria-label="Rooms"
      className={cn("flex flex-wrap items-center gap-1.5 scroll-mt-24", className)}
      onPointerLeave={() => {
        cancelHover();
        onPreview(null);
      }}
    >
      {ROOM_ORDER.map((id, index) => {
        const room = ROOMS[id];
        const { light, floor } = swatchColours(id);
        const selected = value === id;
        return (
          <li key={id}>
            <button
              type="button"
              ref={(node) => {
                buttons.current[index] = node;
              }}
              aria-pressed={selected}
              // No roving tabindex: the container is a plain `<ul>` with no composite
              // widget role, so removing four of the five rooms from the tab order
              // hid them with nothing in the accessible tree to say arrow keys reach
              // them. The lobby's room row (play/room-row.tsx) keeps every swatch
              // tabbable and adds arrows on top; this matches it.
              onKeyDown={(event) => onKeyDown(event, index)}
              onClick={() => commit(id)}
              onFocus={() => warm(id)}
              onPointerEnter={() => {
                if (!canHover) return;
                warm(id);
                cancelHover();
                hoverTimer.current = window.setTimeout(() => onPreview(id), HOVER_DELAY_MS);
              }}
              onPointerLeave={cancelHover}
              className={cn(
                "flex h-11 cursor-pointer items-center gap-2.5 rounded-full border pr-4 pl-1",
                "text-[13px] font-medium transition-colors duration-(--dur-micro)",
                focusRing,
                selected
                  ? "border-transparent bg-secondary text-foreground ring-2 ring-primary/70"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              <span
                aria-hidden
                className="room-swatch size-9 shrink-0 rounded-full ring-1 ring-black/15 ring-inset"
                style={
                  {
                    "--swatch-light": light,
                    "--swatch-floor": floor,
                  } as React.CSSProperties
                }
              />
              {room.label}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
