"use client";
// src/components/game/game-nameplate.tsx  [U2]
// UI_UPGRADE_2 §4.1. The two plain player rows become NAMEPLATES: a 48px walnut
// plate with a seam hairline carrying, in reading order,
//
//   turn lamp · avatar disc · name (title weight) + rating (mono) · mode chip
//   · [status pill slot] · captured tray + material balance (mono)
//
// The lamp is the only baize on the screen that is not the board: it lights for
// the side to move (DESIGN.md, The Live Green Rule) and switches to brass with
// the word "reviewing" while the board is rewound (§4.8 item 6), so a reader who
// arrows through the game always has a second place that agrees with the pill.
//
// On a phone the plate compresses to 40px and the tray hides behind its own
// balance chip, which expands it on tap.
import { WifiOffIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PieceGlyph } from "@/components/board2d/pieces-svg";
import { cn, initials } from "@/lib/ui";
import type { CapturedPieces, Colour, PlayerSummary } from "@/lib/types";
import { CapturedTray } from "./captured-tray";

export type NameplateLamp = "off" | "to-move" | "reviewing";

export interface GameNameplateProps extends React.ComponentProps<"div"> {
  name: string;
  player: PlayerSummary | null;
  colour: Colour;
  /** "off" is dark, "to-move" is baize, "reviewing" is brass (§4.8 item 6). */
  lamp: NameplateLamp;
  captured: CapturedPieces;
  /** "AI · Beginner", "Online · Rated", "Local" — the mode chip of §4.1. */
  modeChip?: string;
  /** Spectators, shown on the near plate only when above zero. */
  watching?: number;
  /** Only ever true for the opponent in an online game (FR-32). */
  stale?: boolean;
  /** Which edge carries the seam hairline. */
  seam?: "top" | "bottom";
  /** Slot before the tray — the status pill sits here on the far plate. */
  children?: React.ReactNode;
}

const LAMP_TEXT: Record<NameplateLamp, string | null> = {
  off: null,
  "to-move": "to move",
  reviewing: "reviewing",
};

export function GameNameplate({
  name,
  player,
  colour,
  lamp,
  captured,
  modeChip,
  watching = 0,
  stale = false,
  seam = "bottom",
  className,
  children,
  ...props
}: GameNameplateProps) {
  const lampText = LAMP_TEXT[lamp];

  return (
    <div
      data-slot="game-nameplate"
      className={cn(
        // Walnut plate, seam hairline, no shadow: this is structure, not a
        // floating layer (DESIGN.md, The Only-Floating-Things-Cast-Shadows Rule).
        "flex min-h-10 shrink-0 items-center gap-2 bg-card px-2 py-1 sm:min-h-12 sm:gap-2.5 sm:px-3",
        seam === "bottom" ? "border-b border-border" : "border-t border-border",
        className,
      )}
      {...props}
    >
      {/* --------------------------------------------------------- turn lamp */}
      <span
        className={cn(
          "flex shrink-0 items-center gap-1.5 text-[12px] leading-none font-medium",
          lamp === "to-move" && "text-live",
          lamp === "reviewing" && "text-primary",
        )}
      >
        <span
          aria-hidden
          data-lit={lamp === "off" ? "false" : lamp === "reviewing" ? "review" : "true"}
          className={cn(
            "game-lamp size-1.5 shrink-0 rounded-full",
            lamp === "off" && "bg-border",
            lamp === "to-move" && "bg-live",
            lamp === "reviewing" && "bg-primary",
          )}
        />
        {lampText ? (
          // Hidden below `sm` where the plate is 40px and the name has to win the
          // width; the status pill above the board still says whose move it is.
          <span className="hidden sm:inline">{lampText}</span>
        ) : null}
      </span>

      {/* ------------------------------------------------------------ player */}
      <Avatar size="sm" className="shrink-0">
        {player?.avatarUrl ? <AvatarImage src={player.avatarUrl} alt="" /> : null}
        <AvatarFallback>{initials(name)}</AvatarFallback>
      </Avatar>

      <div className="flex min-w-0 items-baseline gap-1.5">
        <PieceGlyph
          type="p"
          colour={colour}
          // The glyph's own outline is near-black; on walnut that puts the black
          // pawn at ~1.3:1 against the plate. Outlining it in the text colour
          // reads in both themes.
          className="size-3.5 shrink-0 translate-y-0.5 [&>g]:stroke-foreground/70"
          title={colour === "w" ? "Plays white" : "Plays black"}
        />
        <span className="truncate text-sm font-semibold text-foreground">{name}</span>
        {player?.rating == null ? null : (
          <span className="tabular shrink-0 font-mono text-[13px] text-muted-foreground">
            {player.rating}
          </span>
        )}
      </div>

      {/* §4.1: the tray is this player's material, so it sits with this player's
          name — not parked at the far edge of a 1040px plate where a single pawn
          glyph reads as a stray icon. The mode chip takes the `ml-auto` instead. */}
      <CapturedTray captured={captured} colour={colour} collapsible className="shrink-0" />

      {/* Everything that is about the GAME rather than about this player rides one
          `ml-auto` at the far end, so the plate reads as two groups and not as four
          things drifting apart. */}
      <div className="ml-auto flex min-w-0 shrink-0 items-center gap-2">
        {modeChip ? (
          <span className="hidden shrink-0 rounded-full bg-bg-sunken px-2 py-0.5 text-[12px] leading-none font-medium text-muted-foreground md:inline-block">
            {modeChip}
          </span>
        ) : null}

        {watching > 0 ? (
          <span className="tabular hidden shrink-0 font-mono text-[12px] text-muted-foreground sm:inline">
            {watching} watching
          </span>
        ) : null}

        {stale ? (
          <span
            role="status"
            className="hidden shrink-0 items-center gap-1.5 rounded-full bg-destructive/10 px-2 py-0.5 text-[12px] text-destructive sm:inline-flex"
          >
            <WifiOffIcon className="size-3.5" aria-hidden />
            May have disconnected
          </span>
        ) : null}

        {children}
      </div>
    </div>
  );
}
