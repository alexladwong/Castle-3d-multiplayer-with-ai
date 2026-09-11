// src/app/page.tsx  [UI upgrade 2 §2]
// `/` — public (§G). A server component: only the pieces that need the client
// (the hero board and its room switcher, the auth-aware CTA, the Convex queries)
// are client components, so the copy, the ledger and the footer are in the first
// HTML response.
//
// Order, top to bottom (§2): board → invitation → three ways to sit → who you
// will play → who is playing now → credits. No eyebrows anywhere; the headings
// carry themselves.
import type { Metadata } from "next";
import { Hero } from "@/components/landing/hero";
import { HeroBodyFlag } from "@/components/landing/hero-body-flag";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LiveNow } from "@/components/landing/live-now";
import { OpponentRoster } from "@/components/landing/opponent-roster";
import { WaysToSit } from "@/components/landing/ways-to-sit";

export const metadata: Metadata = {
  description:
    "Sit at a real 3D board in a room you chose. Rated matchmaking, five AI opponents with opinions, and pass-and-play on one device.",
};

export default function HomePage() {
  return (
    // 15px base on marketing pages (§1.2). `landing-page` carries the browser
    // surfaces this screen themes for itself — caret, selection, scrollbars —
    // from src/components/landing/landing.css.
    <div className="landing-page flex flex-col text-[15px]">
      <HeroBodyFlag />
      <Hero />
      <WaysToSit />
      <OpponentRoster />
      <LiveNow />
      <LandingFooter />
    </div>
  );
}
