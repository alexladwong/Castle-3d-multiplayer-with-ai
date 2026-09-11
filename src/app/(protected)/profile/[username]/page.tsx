import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { preloadQuery, preloadedQueryResult } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import { ProfileHeader } from "@/components/profile/profile-header";
import { RatingSparkline } from "@/components/profile/rating-sparkline";
import { RecentGamesTable } from "@/components/profile/recent-games-table";
import { Section } from "@/components/ui-kit";

export async function generateMetadata(
  props: PageProps<"/profile/[username]">,
): Promise<Metadata> {
  const { username } = await props.params;
  return { title: username };
}

/**
 * `params` is a Promise in Next 15+/16 — always await it.
 *
 * `players.getByUsername` is a public query, so no Convex token is needed. It is
 * preloaded rather than fetched so the same subscription that renders the first
 * HTML keeps the ratings live afterwards, and so a missing player becomes a real
 * 404 instead of an empty page.
 */
export default async function ProfilePage(props: PageProps<"/profile/[username]">) {
  // Next already URL-decodes route params — decoding again would corrupt any
  // username containing a literal `%`. Links encode on the way in.
  const { username } = await props.params;

  const preloaded = await preloadQuery(api.players.getByUsername, { username });
  if (preloadedQueryResult(preloaded) === null) notFound();

  return (
    <Section width="app" padding="md" className="pt-8 sm:pt-10" innerClassName="grid gap-6">
      <ProfileHeader preloaded={preloaded} />
      <RatingSparkline username={username} />
      <RecentGamesTable username={username} />
    </Section>
  );
}
