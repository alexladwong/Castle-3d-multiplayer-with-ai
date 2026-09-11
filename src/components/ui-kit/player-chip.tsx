// src/components/ui-kit/player-chip.tsx  [U0]
import { PieceGlyph } from "@/components/board2d/pieces-svg";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, initials } from "@/lib/ui";
import type { Colour } from "@/lib/types";

export interface PlayerChipProps extends React.ComponentProps<"div"> {
  name: string;
  avatarUrl?: string | null;
  /** Shown in mono, tabular. */
  rating?: number | null;
  /** Which colour they play — drawn as a pawn glyph. */
  side?: Colour | null;
  /** Adds the baize dot and the "to move" label (§5.1 player rows). */
  toMove?: boolean;
  /**
   * What the lit lamp says. Optional and defaults to "to move"; the game screen
   * passes "reviewing" while the board is rewound (UI_UPGRADE_2 §4.8 item 6).
   */
  toMoveLabel?: string;
  /** e.g. "AI · Beginner", "Spectating". */
  subtitle?: React.ReactNode;
  size?: "sm" | "md";
}

/** Avatar + name + rating + turn indicator. Falls back to initials (§7). */
export function PlayerChip({
  name,
  avatarUrl,
  rating,
  side,
  toMove = false,
  toMoveLabel = "to move",
  subtitle,
  size = "md",
  className,
  ...props
}: PlayerChipProps) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)} {...props}>
      <Avatar size={size === "sm" ? "sm" : "default"} className="shrink-0">
        {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
        <AvatarFallback>{initials(name)}</AvatarFallback>
      </Avatar>

      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          {side ? (
            <PieceGlyph
              type="p"
              colour={side}
              // The glyph's own outline is near-black, which on a dark card puts the
              // black pawn at about 1.3:1 against the surface — the shape all but
              // disappears. Outlining it in the text colour instead reads in both
              // themes: ivory on espresso, ink on ivory, with the fill still saying
              // which side it is. The `title` carries the same fact to a screen
              // reader either way.
              className="size-3.5 shrink-0 [&>g]:stroke-foreground/70"
              title={side === "w" ? "Plays white" : "Plays black"}
            />
          ) : null}
          <span
            className={cn(
              "truncate font-medium text-foreground",
              size === "sm" ? "text-[13px]" : "text-sm",
            )}
          >
            {name}
          </span>
          {rating != null ? (
            <span className="tabular shrink-0 font-mono text-[13px] text-muted-foreground">
              {rating}
            </span>
          ) : null}
        </div>

        {toMove || subtitle ? (
          <div className="flex min-w-0 items-center gap-1.5 text-[12px] leading-tight">
            {toMove ? (
              <>
                <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-live" />
                <span className="text-live">{toMoveLabel}</span>
              </>
            ) : null}
            {subtitle ? <span className="truncate text-muted-foreground">{subtitle}</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
