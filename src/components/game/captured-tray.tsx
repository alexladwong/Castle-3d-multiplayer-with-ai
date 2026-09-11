"use client";
// src/components/game/captured-tray.tsx  [P3 → U2 §4.1]
// FR-16 captured pieces + material count. The 3D scene has its own tray (P4);
// this one belongs to the nameplates and the side panel.
//
// §4.1: "On mobile the plates compress to 40px and drop the tray behind a `+2`
// that expands the tray on tap." `collapsible` turns the balance into a button
// below `sm`; from `sm` up the glyphs are simply there.
import { useState } from "react";
import { PIECE_VALUES } from "@/lib/constants";
import { formatMaterialAdvantage } from "@/lib/format";
import { cn, focusRing } from "@/lib/ui";
import type { CapturedPieces, Colour, PieceSymbol } from "@/lib/types";
import { PieceGlyph, pieceName } from "@/components/board2d/pieces-svg";

const ORDER: PieceSymbol[] = ["q", "r", "b", "n", "p"];

export interface CapturedTrayProps {
  captured: CapturedPieces;
  /** The side whose captures are shown. */
  colour: Colour;
  /** Hide the glyphs behind their own balance chip below `sm` (§4.1). */
  collapsible?: boolean;
  className?: string;
}

export function CapturedTray({
  captured,
  colour,
  collapsible = false,
  className,
}: CapturedTrayProps) {
  const [expanded, setExpanded] = useState(false);
  const taken = [...captured[colour]].sort(
    (a, b) => PIECE_VALUES[b] - PIECE_VALUES[a] || ORDER.indexOf(a) - ORDER.indexOf(b),
  );
  // "" when this side is level or behind — only the player who is ahead carries
  // the number, so the pair of trays never states the same fact twice.
  const advantage = formatMaterialAdvantage(captured, colour);
  const opponent: Colour = colour === "w" ? "b" : "w";
  const side = colour === "w" ? "white" : "black";

  const glyphs = (
    <>
      {/* §4.1: "glyphs + material diff in mono". 16px keeps a full tray inside the
          48px plate and pairs with the 12px micro step beside it. */}
      {taken.map((type, index) => (
        <PieceGlyph
          key={`${type}-${index}`}
          type={type}
          colour={opponent}
          className="size-4 shrink-0"
          title={index === 0 ? pieceName(type, opponent) : undefined}
        />
      ))}
      {advantage ? (
        <>
          <span
            aria-hidden
            className="tabular ml-1 font-mono text-[12px] font-medium tracking-[0.02em] text-muted-foreground"
          >
            {advantage}
          </span>
          {/* On its own "+2" is a bare number in the middle of a nameplate. */}
          <span className="sr-only">, {advantage.slice(1)} ahead in material</span>
        </>
      ) : null}
    </>
  );

  return (
    <div
      role="group"
      className={cn("flex min-h-6 flex-wrap items-center gap-0.5", className)}
      aria-label={`Pieces captured by ${side}`}
    >
      {/* §4.1 asks for a SIGNED BALANCE on mobile ("+2"), so the chip appears only
          for the side that is ahead. It used to fall back to `taken.length` whenever
          material was level, which put a bare unlabelled "1" on both plates at once
          and read as a notification badge. */}
      {collapsible && advantage !== "" ? (
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={
            expanded
              ? `Hide the ${taken.length} pieces ${side} has captured, ${advantage.slice(1)} ahead`
              : `Show the ${taken.length} pieces ${side} has captured, ${advantage.slice(1)} ahead`
          }
          onClick={() => setExpanded((open) => !open)}
          className={cn(
            "tabular flex h-6 min-w-8 items-center justify-center rounded-full bg-bg-sunken px-2",
            // §4.8 item 3: a thumb needs 36px even inside a 40px plate.
            "pointer-coarse:size-9 pointer-coarse:min-w-9",
            "font-mono text-[12px] font-medium text-muted-foreground",
            "transition-colors hover:text-foreground sm:hidden",
            focusRing,
          )}
        >
          {advantage}
        </button>
      ) : null}

      <div
        className={cn(
          "flex min-h-6 flex-wrap items-center gap-0.5",
          collapsible && taken.length > 0 && !expanded && "hidden sm:flex",
        )}
      >
        {glyphs}
      </div>
    </div>
  );
}
