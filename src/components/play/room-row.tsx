"use client";
// src/components/play/room-row.tsx  [U5]
// The room row under the table preview (UI_UPGRADE_2 §3.3): five 36px round
// swatches painted from the room's own values in `src/lib/rooms.ts` — its key
// light on top, its dark square beneath — so a swatch IS the room rather than a
// decorative dot. Picking one writes `players.updateSettings({ roomPreset })`,
// which is what carries the choice into the game.
//
// No thumbnails: §3 forbids fabricating them. The swatch, the room's name and
// the live board above it are the honest version.
import { useCallback, useRef, useState } from "react";
import { preloadBoard3D } from "@/components/board3d/board-3d-loader";
import { ROOMS, ROOM_ORDER } from "@/lib/rooms";
import { useUiStore } from "@/lib/stores/ui-store";
import type { RoomPresetId } from "@/lib/types";
import { cn, focusRing } from "@/lib/ui";
import { rovingArrowKeys } from "./roving";

type PresetId = Exclude<RoomPresetId, "custom">;

/** Enough to survive a pointer crossing the row, short enough to feel immediate. */
const HOVER_DELAY_MS = 120;

export interface RoomRowProps {
  active: RoomPresetId;
  onSelect(room: PresetId): void;
  /** Previewed after a moment of hover; the click is what commits. */
  onPreview?(room: PresetId): void;
  disabled?: boolean;
  className?: string;
}

export function RoomRow({
  active,
  onSelect,
  onPreview,
  disabled = false,
  className,
}: RoomRowProps) {
  const listRef = useRef<HTMLUListElement | null>(null);
  const hoverTimer = useRef<number | null>(null);
  const warmed = useRef(new Set<string>());
  const [hovered, setHovered] = useState<PresetId | null>(null);

  const cancelHover = useCallback(() => {
    if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  }, []);

  /** Warm the room's HDRI (and the 3D chunk) the moment the player shows intent. */
  const warm = useCallback((room: PresetId) => {
    if (useUiStore.getState().webglAvailable === false) return;
    const hdri = ROOMS[room].hdri;
    if (warmed.current.has(hdri)) return;
    warmed.current.add(hdri);
    void preloadBoard3D([hdri]).catch(() => undefined);
  }, []);

  // Named during render, never in an effect: the caption follows whichever room
  // the pointer is over, and falls back to the committed one.
  const caption = ROOMS[(hovered ?? (active === "custom" ? "minimal" : active)) as PresetId];

  return (
    <div className={cn("grid gap-2", className)}>
      <ul
        ref={listRef}
        role="group"
        aria-label="Room"
        className="flex flex-wrap items-center gap-2"
        onKeyDown={(event) => rovingArrowKeys(event, listRef.current)}
        onPointerLeave={() => {
          cancelHover();
          setHovered(null);
        }}
      >
        {ROOM_ORDER.map((id) => {
          const room = ROOMS[id];
          const selected = active === id;
          return (
            <li key={id}>
              <button
                type="button"
                aria-pressed={selected}
                disabled={disabled}
                onClick={() => {
                  cancelHover();
                  warm(id);
                  onSelect(id);
                }}
                onPointerEnter={() => {
                  setHovered(id);
                  warm(id);
                  cancelHover();
                  if (!onPreview) return;
                  hoverTimer.current = window.setTimeout(() => onPreview(id), HOVER_DELAY_MS);
                }}
                onFocus={() => setHovered(id)}
                onBlur={() => setHovered(null)}
                className={cn(
                  "grid size-11 cursor-pointer place-items-center rounded-full",
                  focusRing,
                  "disabled:cursor-not-allowed disabled:opacity-50",
                )}
              >
                <span className="sr-only">{room.label}</span>
                <span
                  aria-hidden
                  className={cn(
                    "size-9 rounded-full transition-shadow duration-150",
                    selected
                      ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                      : "ring-1 ring-border",
                  )}
                  style={{
                    backgroundImage: `linear-gradient(180deg, ${room.lights.key.color} 0 50%, ${room.board.darkSquare} 50% 100%)`,
                  }}
                />
              </button>
            </li>
          );
        })}
      </ul>

      <p className="lobby-micro text-muted-foreground">
        <span className="text-foreground">{caption.label}</span> · {caption.description}
      </p>
    </div>
  );
}
