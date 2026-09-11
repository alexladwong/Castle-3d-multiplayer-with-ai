"use client";
// src/components/board2d/square-2d.tsx  [P3]
// One board square: colour, highlights, coordinates and the click/keyboard target.
// It is a `gridcell` inside the board's `grid`/`row` structure (NFR-7).
import { cn } from "@/lib/utils";
import type { SquareId } from "@/lib/types";

export interface Square2DProps {
  square: SquareId;
  light: boolean;
  /** Room palette colours (FR-21j); null falls back to the --board-* tokens. */
  colour: string | null;
  selected: boolean;
  legal: boolean;
  capture: boolean;
  lastMove: boolean;
  check: boolean;
  /** The roving-tabindex cursor (only one square in the board is tabbable). */
  cursor: boolean;
  label: string;
  fileLabel: string | null;
  rankLabel: string | null;
  disabled: boolean;
  onSelect(square: SquareId): void;
  onFocusSquare(square: SquareId): void;
}

export function Square2D({
  square,
  light,
  colour,
  selected,
  legal,
  capture,
  lastMove,
  check,
  cursor,
  label,
  fileLabel,
  rankLabel,
  disabled,
  onSelect,
  onFocusSquare,
}: Square2DProps) {
  return (
    <div
      role="gridcell"
      data-square={square}
      aria-label={label}
      aria-selected={selected}
      aria-disabled={disabled || undefined}
      tabIndex={cursor ? 0 : -1}
      onClick={() => onSelect(square)}
      onFocus={() => onFocusSquare(square)}
      className={cn(
        "relative touch-manipulation outline-none select-none",
        colour === null && (light ? "bg-board-light" : "bg-board-dark"),
        !disabled && "cursor-pointer",
        "focus-visible:z-20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
      )}
      style={colour === null ? undefined : {
        backgroundColor: colour,
        color: readableCoordinateColor(colour),
      }}
    >
      {/* last move (FR-16) */}
      {lastMove ? (
        <span className="pointer-events-none absolute inset-0 bg-board-last/45" aria-hidden />
      ) : null}
      {/* selection (FR-16) */}
      {selected ? (
        <span
          className="pointer-events-none absolute inset-0 bg-board-select/55 ring-2 ring-board-select ring-inset"
          aria-hidden
        />
      ) : null}
      {/* king in check */}
      {check ? (
        <span
          className="pointer-events-none absolute inset-0 bg-board-check/55 ring-2 ring-board-check ring-inset"
          aria-hidden
        />
      ) : null}
      {/* legal destination: dot for a quiet move, ring for a capture */}
      {legal && !capture ? (
        <span
          className="pointer-events-none absolute top-1/2 left-1/2 h-[28%] w-[28%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-board-legal/80"
          aria-hidden
        />
      ) : null}
      {legal && capture ? (
        <span
          className="pointer-events-none absolute inset-[8%] rounded-full ring-[4px] ring-board-capture/85 ring-inset"
          aria-hidden
        />
      ) : null}
      {/* coordinates (FR-16) */}
      {rankLabel ? (
        <span
          className="pointer-events-none absolute top-0.5 left-1 text-[clamp(7px,1.4vw,11px)] leading-none font-medium text-current tabular-nums"
          aria-hidden
        >
          {rankLabel}
        </span>
      ) : null}
      {fileLabel ? (
        <span
          className="pointer-events-none absolute right-1 bottom-0.5 text-[clamp(7px,1.4vw,11px)] leading-none font-medium text-current"
          aria-hidden
        >
          {fileLabel}
        </span>
      ) : null}
    </div>
  );
}

/** Coordinates need contrast on both the charcoal rooms and Minimal's grey squares. */
function readableCoordinateColor(hex: string): string {
  const channels = [1, 3, 5].map((i) => {
    const value = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return luminance > 0.18 ? "#20242c" : "#f8f6f0";
}
