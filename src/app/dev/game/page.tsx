// src/app/dev/game/page.tsx  [U2]
// UI_REDESIGN §8's mandatory verification harness. It renders the REAL
// `GameShellView` against `src/lib/mock/game-controller.ts`, so the game screen
// can be reviewed at 1440×900 and 390×844 without a Clerk session or a Convex
// deployment. The route does not exist in production.
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { GameHarness } from "./harness";

export const metadata: Metadata = {
  title: "Game harness",
  robots: { index: false, follow: false },
};

// Typed as a plain promise rather than `PageProps<"/dev/game">`: the generated
// route union only exists after a build, and this file must typecheck from cold.
export default async function GameDevPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const raw = params.scenario;
  const scenario = Array.isArray(raw) ? (raw[0] ?? null) : (raw ?? null);
  return <GameHarness scenario={scenario} />;
}
