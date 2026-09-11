// src/components/ui-kit/display.tsx  [U0]
import { cn } from "@/lib/ui";

/** 72 / 64 / 48 at the large breakpoint, stepped down for narrow screens (§1.2). */
const LEVEL_CLASS = {
  1: "text-[2.75rem] leading-[1.02] sm:text-[3.5rem] sm:leading-[0.98] lg:text-[4.5rem] lg:leading-[0.98]",
  2: "text-[2rem] leading-[1.06] sm:text-[2.75rem] sm:leading-[1] lg:text-[4rem] lg:leading-[0.98]",
  3: "text-[1.625rem] leading-[1.15] sm:text-[2.125rem] sm:leading-[1.08] lg:text-[3rem] lg:leading-[1.02]",
  /** `headline-sm` (DESIGN.md): 2rem / 1.1, one size at every width. */
  4: "headline-sm",
} as const;

export interface DisplayProps extends React.ComponentProps<"h1"> {
  /**
   * 1 = hero (72), 2 = section (64), 3 = page header (48), 4 = `headline-sm`
   * (32, flat) for the app frame's verdicts and overlays.
   */
  level?: 1 | 2 | 3 | 4;
  /** Override the tag without changing the size. */
  as?: "h1" | "h2" | "h3" | "h4" | "p" | "div" | "span";
}

/**
 * Fraunces headline. Wrap at most one word in `<em>` and it renders italic in
 * brass — the only decoration the system allows on a headline (§1.1, §1.2).
 */
export function Display({ level = 1, as, className, ...props }: DisplayProps) {
  const Tag = as ?? (`h${level}` as "h1" | "h2" | "h3" | "h4");
  return (
    <Tag
      className={cn(
        "font-display text-balance text-foreground",
        LEVEL_CLASS[level],
        "[&_em]:italic [&_em]:text-primary",
        className,
      )}
      {...props}
    />
  );
}
