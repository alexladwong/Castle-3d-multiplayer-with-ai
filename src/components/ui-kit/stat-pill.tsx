// src/components/ui-kit/stat-pill.tsx  [U0]
import { cn } from "@/lib/ui";

const TONE_CLASS = {
  default: "border-border bg-card text-foreground",
  live: "border-live/40 bg-live/10 text-live",
  brass: "border-primary/40 bg-primary/10 text-primary",
  danger: "border-destructive/40 bg-destructive/10 text-destructive",
} as const;

export interface StatPillProps extends React.ComponentProps<"span"> {
  /** The number, always tabular. */
  value: React.ReactNode;
  /** What the number counts, e.g. "playing now". */
  label?: React.ReactNode;
  tone?: keyof typeof TONE_CLASS;
  /** A leading status dot — pulses on the `live` tone. */
  dot?: boolean;
}

/** "● 14 playing now" (§3 hero). Chips are always fully rounded (§1.1). */
export function StatPill({
  value,
  label,
  tone = "default",
  dot = false,
  className,
  ...props
}: StatPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] leading-none",
        TONE_CLASS[tone],
        className,
      )}
      {...props}
    >
      {dot ? (
        // A steady baize dot, not a blinking one: DESIGN.md asks for "a leading
        // baize dot when the chip means live", and a dot that throbs next to a
        // 3D board is one more thing moving on a screen that already moves.
        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
      ) : null}
      <span className="tabular font-medium">{value}</span>
      {label ? <span>{label}</span> : null}
    </span>
  );
}
