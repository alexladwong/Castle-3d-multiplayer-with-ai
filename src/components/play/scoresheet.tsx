"use client";
// src/components/play/scoresheet.tsx  [U5]
// "Your recent games" (UI_UPGRADE_2 §3.4), written the way a club writes one: a
// scoresheet. A real <table>, mono throughout, one row per game.
//
// The result mark carries the LETTER as well as the colour (W baize, L ember,
// D parchment), so colour is never the only signal; a game still in progress is
// marked with a baize dot and reads "In progress" to a screen reader, and its
// link says "Open" rather than "Replay".
//
// Rating change: `games.myRecentGames` returns `vGameSummary`, which carries
// `rated` but no delta — the Elo movement is applied to the player document and
// never stored per game. So an unrated game reads "unrated", a rated one reads
// "rated", and a delta is shown only where one is actually known. Product
// principle 1: nothing fake behind the glass. There is a request in the builder's
// report to add `ratingDelta` to `vGameSummary`, which this row already accepts.
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Skeleton } from "@/components/ui/skeleton";
import { DIFFICULTIES } from "@/lib/difficulty";
import {
  formatMode,
  formatOutcome,
  formatRatingDelta,
  outcomeFor,
  type ResultOutcome,
} from "@/lib/format";
import type { Colour, Difficulty, GameMode, GameStatus, Winner } from "@/lib/types";
import { cn } from "@/lib/ui";

export const RECENT_LIMIT = 8;

const MARK_LETTER: Record<Exclude<ResultOutcome, "ongoing">, string> = {
  win: "W",
  loss: "L",
  draw: "D",
};

// §3.4 wants "W in baize, L in ember, D in parchment, each with the letter so colour
// is never the only signal". The tint used to sit BEHIND the letter in its own hue,
// which dragged W to 3.88:1 and L to 3.82:1 in light theme — sub-threshold for exactly
// the readers the letter was added for. The chip is neutral now and the letter carries
// the colour: 5.04:1 / 4.97:1 light, 4.91:1 / 4.57:1 dark.
const MARK_CLASS: Record<Exclude<ResultOutcome, "ongoing">, string> = {
  win: "bg-secondary text-live",
  loss: "bg-secondary text-destructive",
  draw: "bg-secondary text-muted-foreground",
};

export interface ScoresheetGame {
  _id: string;
  mode: GameMode;
  difficulty?: Difficulty;
  status: GameStatus;
  winner?: Winner;
  opponentName: string;
  myColour: Colour | null;
  rated: boolean;
  /** Present only when the backend knows it; see the note at the top. */
  ratingDelta?: number;
}

function ResultMark({ outcome }: { outcome: ResultOutcome }) {
  if (outcome === "ongoing") {
    return (
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="size-1.5 rounded-full bg-live" />
        <span className="lobby-micro text-live">Live</span>
        <span className="sr-only">In progress</span>
      </span>
    );
  }
  return (
    <span
      className={cn(
        "grid size-6 place-items-center rounded-[0.375rem] text-[0.8125rem] font-semibold",
        MARK_CLASS[outcome],
      )}
    >
      <span aria-hidden>{MARK_LETTER[outcome]}</span>
      <span className="sr-only">{formatOutcome(outcome)}</span>
    </span>
  );
}

function modeText(game: ScoresheetGame): string {
  if (game.mode === "ai" && game.difficulty !== undefined) {
    return `AI · ${DIFFICULTIES[game.difficulty].label}`;
  }
  return formatMode(game.mode);
}

function ratingText(game: ScoresheetGame): { text: string; muted: boolean } {
  if (!game.rated) return { text: "unrated", muted: true };
  if (game.ratingDelta === undefined) return { text: "rated", muted: true };
  return { text: formatRatingDelta(game.ratingDelta), muted: false };
}

export function ScoresheetRow({ game }: { game: ScoresheetGame }) {
  const outcome = outcomeFor(game.status, game.winner, game.myColour);
  const rating = ratingText(game);
  const live = outcome === "ongoing";

  return (
    <tr className="group/row">
      <td className="w-9 py-2.5 pr-2 align-middle">
        <ResultMark outcome={outcome} />
      </td>

      <td className="min-w-0 py-2.5 pr-3 align-middle">
        <span className="lobby-body block truncate font-medium text-foreground">
          {game.opponentName}
        </span>
        {/* The mode has its own column from `sm` up; below that it rides here. */}
        <span className="lobby-micro block truncate text-muted-foreground sm:hidden">
          {modeText(game)}
        </span>
      </td>

      <td className="lobby-micro hidden py-2.5 pr-3 align-middle whitespace-nowrap text-muted-foreground sm:table-cell">
        {modeText(game)}
      </td>

      <td
        className={cn(
          "lobby-data py-2.5 pr-3 text-right align-middle whitespace-nowrap",
          rating.muted ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {rating.text}
      </td>

      <td className="py-2.5 text-right align-middle">
        <Link
          prefetch={false}
          href={`/game/${game._id}`}
          aria-label={`${live ? "Open" : "Replay"} the game against ${game.opponentName}`}
          className={cn(
            "lobby-micro inline-flex h-9 items-center rounded-[0.625rem] px-2.5 py-2",
            "text-muted-foreground transition-colors duration-150",
            "hover:bg-secondary hover:text-foreground",
            "outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          )}
        >
          {live ? "Open" : "Replay"}
        </Link>
      </td>
    </tr>
  );
}

export function ScoresheetSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="grid gap-px" aria-busy>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-[3.25rem] w-full rounded-[0.5rem]" />
      ))}
    </div>
  );
}

export function ScoresheetEmpty() {
  return (
    <p className="lobby-body rounded-[0.75rem] bg-bg-sunken px-4 py-8 text-center text-muted-foreground">
      Your games will be listed here once you have played one.
    </p>
  );
}

/** Pure — the /dev/pages harness renders this with fixed rows. */
export function ScoresheetView({ games }: { games: ScoresheetGame[] }) {
  if (games.length === 0) return <ScoresheetEmpty />;

  return (
    <table className="lobby-scoresheet">
      <caption className="sr-only">
        Your most recent games, newest first: result, opponent, mode, rating change and a
        link to the replay.
      </caption>
      <thead>
        <tr>
          <th scope="col" className="sr-only">
            Result
          </th>
          <th scope="col" className="eyebrow pb-2 text-left">
            Opponent
          </th>
          <th scope="col" className="eyebrow hidden pb-2 text-left sm:table-cell">
            Mode
          </th>
          <th scope="col" className="eyebrow pb-2 text-right">
            Rating
          </th>
          <th scope="col" className="sr-only">
            Replay
          </th>
        </tr>
      </thead>
      <tbody>
        {games.map((game) => (
          <ScoresheetRow key={game._id} game={game} />
        ))}
      </tbody>
    </table>
  );
}

/** The Convex-connected half. Stays skipped until the session is validated. */
export function Scoresheet({ enabled }: { enabled: boolean }) {
  const games = useQuery(api.games.myRecentGames, enabled ? { limit: RECENT_LIMIT } : "skip");

  if (games === undefined) return <ScoresheetSkeleton />;
  return <ScoresheetView games={games} />;
}
