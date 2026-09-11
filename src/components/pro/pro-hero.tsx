// src/components/pro/pro-hero.tsx  [PRO_TUTOR §1, §7]
// The top of /pro. The headline and the sub are §1's strings, verbatim; there is no
// eyebrow above the headline, here or anywhere else in this world.
import Link from "next/link";
import { Display, Section } from "@/components/ui-kit";
import { TutorPanelStill } from "@/components/pro/tutor-panel-still";
import { buttonVariants } from "@/components/ui/button";
import { cn, focusRing } from "@/lib/ui";

export function ProHero() {
  return (
    <Section padding="none" className="pt-12 pb-8 sm:pt-16 sm:pb-12">
      <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-x-8">
        <div className="lg:col-span-7 lg:col-start-1">
          <Display level={1} as="h1">
            A coach in the room.
          </Display>
          <p className="mt-5 max-w-[46ch] text-[1.25rem] leading-relaxed text-pretty text-muted-foreground">
            Ask about any position, in any game. The tutor explains the idea and draws it on the
            board.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            {/* A same-page jump, so it is an anchor and not a router link. */}
            <a
              href="#plans"
              className={cn(buttonVariants({ size: "lg" }), "min-h-11 px-4", focusRing)}
            >
              See what it costs
            </a>
            <Link
              prefetch={false}
              href="/play"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "min-h-11 px-4",
                focusRing,
              )}
            >
              Play a game
            </Link>
          </div>
        </div>

        <div className="flex justify-start lg:col-span-5 lg:col-start-8 lg:justify-end">
          <TutorPanelStill />
        </div>
      </div>
    </Section>
  );
}
