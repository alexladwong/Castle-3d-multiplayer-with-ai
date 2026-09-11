"use client";
// src/components/profile/profile-header.tsx  [U4]
// The profile header card of UI_REDESIGN §6: avatar 72, name, the three pool
// ratings in mono, the record.
import { usePreloadedQuery, type Preloaded } from "convex/react";
import type { api } from "../../../convex/_generated/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Display, Eyebrow } from "@/components/ui-kit";
import { formatDate, formatRating, formatRecord, formatWinRate } from "@/lib/format";
import { cn, initials } from "@/lib/ui";

export interface ProfileSummary {
  username: string;
  avatarUrl: string;
  rating: number;
  ratingHuman: number;
  ratingAi: number;
  wins: number;
  losses: number;
  draws: number;
  createdAt: number;
}

function Stat({
  label,
  value,
  hint,
  emphasis = false,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-bg-sunken px-3 py-2.5">
      <dt className="eyebrow text-[11px]">{label}</dt>
      <dd
        className={cn(
          "tabular mt-1 font-mono text-lg leading-none",
          emphasis ? "text-primary" : "text-foreground",
        )}
      >
        {value}
      </dd>
      {hint ? <p className="mt-1 text-[12px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Pure — the /dev/pages harness renders this with a fixed profile. */
export function ProfileHeaderView({ profile }: { profile: ProfileSummary }) {
  return (
    <header className="grid gap-5 rounded-xl border border-border bg-card p-5 shadow-soft sm:p-6">
      <div className="flex items-center gap-4">
        <Avatar className="size-16 sm:size-18">
          <AvatarImage src={profile.avatarUrl} alt="" />
          <AvatarFallback className="text-lg">{initials(profile.username)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <Eyebrow>Player</Eyebrow>
          <Display level={3} as="h1" className="mt-1 truncate text-[2rem] sm:text-[2.5rem]">
            {profile.username}
          </Display>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Playing since {formatDate(profile.createdAt)}
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Overall" value={formatRating(profile.rating)} emphasis />
        <Stat label="vs Humans" value={formatRating(profile.ratingHuman)} />
        <Stat label="vs AI" value={formatRating(profile.ratingAi)} />
        <Stat
          label="Record"
          value={formatRecord(profile)}
          hint={`${formatWinRate(profile)} win rate`}
        />
      </dl>
    </header>
  );
}

/**
 * Preloaded on the server so the name and ratings are in the first HTML payload,
 * then kept live by the same subscription (`usePreloadedQuery`).
 */
export function ProfileHeader({
  preloaded,
}: {
  preloaded: Preloaded<typeof api.players.getByUsername>;
}) {
  const profile = usePreloadedQuery(preloaded);
  if (profile === null) return null;
  return <ProfileHeaderView profile={profile} />;
}
