import type { Metadata } from "next";
import { LeaderboardTable } from "@/components/leaderboard/leaderboard-table";
import { Display, Eyebrow, Section } from "@/components/ui-kit";
import { LEADERBOARD_SIZE } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: `The top ${LEADERBOARD_SIZE} players by rating, updating live.`,
};

/** Public (§G) — `leaderboard.top` needs no identity. */
export default function LeaderboardPage() {
  return (
    <Section width="app" padding="md" className="pt-8 sm:pt-10">
      <header className="mb-8 grid gap-2">
        <Eyebrow>Rated players</Eyebrow>
        <Display level={3} as="h1">Leaderboard</Display>
        <p className="max-w-prose text-[15px] text-muted-foreground">
          The top {LEADERBOARD_SIZE} players, updating live as games finish.
        </p>
      </header>
      <LeaderboardTable />
    </Section>
  );
}
