"use client";
// src/components/ui-kit/room-card.tsx  [U0]
import { cn, focusRing } from "@/lib/ui";

export interface RoomCardProps extends React.ComponentProps<"button"> {
  name: string;
  description: string;
  /** Hex from ROOMS[...].board — drawn as the two square swatches. */
  lightSquare: string;
  darkSquare: string;
  /**
   * HDRI file name, printed instead of a photo. The spec forbids fabricating
   * thumbnails, so the swatches plus the source name are the preview (§3).
   */
  hdriName?: string;
  active?: boolean;
}

/** One room in "Choose your room"; brass ring when it is the active room (§3). */
export function RoomCard({
  name,
  description,
  lightSquare,
  darkSquare,
  hdriName,
  active = false,
  className,
  ...props
}: RoomCardProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "group flex w-full flex-col gap-2 rounded-xl border bg-card p-3 text-left transition-colors",
        focusRing,
        active
          ? "border-primary ring-2 ring-primary/40"
          : "border-border hover:border-primary/40 hover:bg-accent",
        className,
      )}
      {...props}
    >
      <span aria-hidden className="flex items-center gap-1">
        <span
          className="size-5 rounded-sm ring-1 ring-black/10"
          style={{ backgroundColor: lightSquare }}
        />
        <span
          className="size-5 rounded-sm ring-1 ring-black/10"
          style={{ backgroundColor: darkSquare }}
        />
      </span>
      <span className="text-sm font-medium text-foreground">{name}</span>
      <span className="text-[13px] leading-snug text-muted-foreground">{description}</span>
      {hdriName ? (
        <span className="mt-auto font-mono text-[12px] text-muted-foreground">{hdriName}</span>
      ) : null}
    </button>
  );
}
