// src/components/ui-kit/podium.tsx  [U0]
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, initials } from "@/lib/ui";

export interface PodiumEntry {
  /** 1, 2 or 3. */
  rank: number;
  name: string;
  rating: number;
  avatarUrl?: string | null;
  /** "18-4-2" or similar. */
  record?: string;
}

export interface PodiumProps extends React.ComponentProps<"ol"> {
  entries: PodiumEntry[];
  /** Wrap each name in a link to the profile. */
  renderName?(entry: PodiumEntry): React.ReactNode;
  /**
   * `"podium"` (default) is the three-column shape: 2 · 1 · 3, first place
   * raised. `"stack"` is the same three entries in one column — a narrow aside,
   * for instance — where that visual order would simply reverse the reading
   * order, so it is dropped.
   */
  layout?: "podium" | "stack";
}

/** Visual order 2 · 1 · 3 on wide screens; reading order stays 1, 2, 3. */
const ORDER_CLASS: Record<number, string> = {
  1: "sm:order-2",
  2: "sm:order-1",
  3: "sm:order-3",
};

/** The top three of a leaderboard (§6): avatar 56, rating in Fraunces 40. */
export function Podium({
  entries,
  renderName,
  layout = "podium",
  className,
  ...props
}: PodiumProps) {
  const stacked = layout === "stack";
  return (
    <ol
      className={cn(
        "grid gap-3",
        stacked ? "sm:grid-cols-1" : "sm:grid-cols-3 sm:items-end",
        className,
      )}
      aria-label="Top three"
      {...props}
    >
      {entries.slice(0, 3).map((entry) => {
        const first = entry.rank === 1;
        return (
          <li
            key={entry.rank}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border bg-card px-4 text-center",
              stacked ? null : ORDER_CLASS[entry.rank],
              // DESIGN.md, Elevation: cards at rest carry no shadow, and the
              // soft float is reserved for layers that genuinely float. A
              // podium entry is page structure — the brass hairline and the
              // extra padding are what raise first place.
              first
                ? cn("border-primary/50", stacked ? "py-4 sm:py-5" : "py-6")
                : "border-border py-4 sm:py-5",
            )}
          >
            <span className="eyebrow">
              {entry.rank === 1 ? "1st" : entry.rank === 2 ? "2nd" : "3rd"}
            </span>
            <Avatar className={first ? "size-14" : "size-11"}>
              {entry.avatarUrl ? <AvatarImage src={entry.avatarUrl} alt="" /> : null}
              <AvatarFallback>{initials(entry.name)}</AvatarFallback>
            </Avatar>
            {/* The Scoresheet Rule: a rating is something a player writes down, so it
                is Geist Mono with tabular figures, never the display face. The name
                carries the title weight instead — the podium is about who, and the
                rating is the evidence. */}
            <span
              className={cn(
                "max-w-full truncate text-foreground",
                first ? "text-xl font-semibold" : "text-sm font-medium",
              )}
            >
              {renderName ? renderName(entry) : entry.name}
            </span>
            <span className="tabular font-mono text-[13px] font-medium text-primary">
              {entry.rating}
            </span>
            {entry.record ? (
              <span className="tabular font-mono text-[12px] text-muted-foreground">
                {entry.record}
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
