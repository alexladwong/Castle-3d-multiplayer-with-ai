// src/app/pro/page.tsx  [PRO_TUTOR §7]
// `/pro` — public, and not listed in `src/proxy.ts`'s protected prefixes, because a
// visitor has to be able to read what Pro is before signing in for it.
//
// A static shell: the hero, the three points, the FAQ and the footer are server
// components in the first HTML response, and only the price band is client-side
// (Clerk's `<PricingTable/>` reads the plans at runtime, and the price is never
// written into this repo). The welcome state inside it reads `?welcome=1` with
// `useSearchParams` behind its own Suspense boundary, so the shell stays static.
import type { Metadata } from "next";
import { LandingFooter } from "@/components/landing/landing-footer";
import { ProFaq } from "@/components/pro/pro-faq";
import { ProHero } from "@/components/pro/pro-hero";
import { ProPoints } from "@/components/pro/pro-points";
import { ProPricing } from "@/components/pro/pro-pricing";

export const metadata: Metadata = {
  // Not the "%s · Castle" template: this page's name IS the product's name.
  title: { absolute: "Castle Pro" },
  description:
    "The tutor: ask about any position in any game, and get the idea explained and drawn on the board.",
};

export default function ProPage() {
  // 15px base on marketing surfaces (DESIGN.md, Typography).
  return (
    <div className="flex flex-col text-[15px]">
      <ProHero />
      <ProPoints />
      <ProPricing />
      <ProFaq />
      <LandingFooter />
    </div>
  );
}
