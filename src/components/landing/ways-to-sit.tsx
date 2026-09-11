"use client";
// src/components/landing/ways-to-sit.tsx  [UI upgrade 2 §2.2]
// "Three ways to sit down." — a ledger, not a card grid: three full-width rows
// separated by seam hairlines, each one a 12-column split with the title and the
// copy on the left and a working artefact on the right. The title is the row's
// only link, and each artefact is a piece of the real product rather than an
// illustration of it: the queue's rating window, two of the opponent's own chat
// bubbles, and a board that turns to face whoever is to move.
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ChatMessage, Display, RatingWindow, Reveal, Section } from "@/components/ui-kit";
import { DIFFICULTIES } from "@/lib/difficulty";
import { QUEUE_BASE_RANGE, QUEUE_WIDEN_INTERVAL_MS } from "@/lib/constants";
import { cn, focusRing } from "@/lib/ui";
import { useState } from "react";
import { SeatPreview } from "./seat-preview";
import { SAMPLE_LINE } from "./sample-lines";

const WIDEN_SECONDS = QUEUE_WIDEN_INTERVAL_MS / 1000;

/** The opponent's own bubbles, exactly as they look in a game (§2.2). */
function ChatArtefact() {
  return (
    // One entrance, not two: `ChatMessage` already carries its own `game-bubble-in`,
    // so the `bubble-in` reveal class that used to sit here made the artefact play a
    // mount animation and a reveal animation on nested elements (§2.6 asks for one).
    <ul className="mx-auto flex w-full max-w-[22rem] flex-col gap-2.5 lg:mr-0">
      <ChatMessage variant="you">You played O-O</ChatMessage>
      <ChatMessage
        variant="ai"
        personaName={DIFFICULTIES.casual.persona.name}
        moveLabel="7. Nc3"
      >
        {SAMPLE_LINE.casual}
      </ChatMessage>
    </ul>
  );
}

interface Way {
  href: string;
  title: string;
  copy: string;
  artefact(active: boolean): React.ReactNode;
}

const WAYS: Way[] = [
  {
    href: "/play?mode=online",
    title: "Find a match",
    copy: `Rated games against people near your rating. The window starts at ±${QUEUE_BASE_RANGE} and widens every ${WIDEN_SECONDS} seconds until someone sits down.`,
    artefact: () => <RatingWindow />,
  },
  {
    href: "/play?mode=ai",
    title: "Play the AI",
    copy: "Five opponents from Beginner to Grandmaster. Each one tells you what it was thinking after every move.",
    artefact: () => <ChatArtefact />,
  },
  {
    href: "/play?mode=local",
    title: "Pass and play",
    copy: "Two people, one device. The board turns to face whoever is to move, and either of you can undo.",
    artefact: (active) => <SeatPreview active={active} />,
  },
];

function LedgerRow({ way, index }: { way: Way; index: number }) {
  const [active, setActive] = useState(false);

  return (
    <li
      onPointerEnter={() => setActive(true)}
      onPointerLeave={() => setActive(false)}
      onFocusCapture={() => setActive(true)}
      onBlurCapture={() => setActive(false)}
    >
      <Reveal delayIndex={index}>
        <div className="grid grid-cols-1 gap-6 py-8 lg:grid-cols-12 lg:grid-rows-[auto_1fr] lg:items-start lg:gap-x-8 lg:gap-y-4 lg:py-10">
          <h3 className="order-1 lg:order-1 lg:col-span-6 lg:col-start-1 lg:row-start-1">
            <Link
              prefetch={false}
              href={way.href}
              className={cn(
                // headline-sm (2rem) on a phone, the full headline step (2.5rem)
                // from `sm` up — the ledger titles are the page's second voice.
                "font-display group/row inline-flex min-h-9 items-baseline gap-2.5 rounded-sm py-1 text-[2rem] leading-[1.05] text-foreground",
                "transition-colors duration-(--dur-micro) hover:text-primary sm:text-[2.5rem]",
                focusRing,
              )}
            >
              {way.title}
              <ArrowRight
                aria-hidden
                className="size-5 shrink-0 translate-y-0.5 text-primary transition-transform duration-(--dur-micro) group-hover/row:translate-x-1"
              />
            </Link>
          </h3>

          <p className="order-2 max-w-[58ch] text-[15px] leading-relaxed text-pretty text-muted-foreground lg:order-2 lg:col-span-6 lg:col-start-1 lg:row-start-2">
            {way.copy}
          </p>

          {/* All three artefacts end at the same right edge as the seam hairlines
              above and below the row — the section's right margin used to staircase
              inward because rows 2 and 3 floated centred in their column. */}
          <div className="order-3 flex justify-center lg:order-3 lg:justify-end lg:col-span-5 lg:col-start-8 lg:row-span-2 lg:row-start-1 lg:self-center">
            {way.artefact(active)}
          </div>
        </div>
      </Reveal>
    </li>
  );
}

export function WaysToSit() {
  return (
    // 96px between sections on desktop, 64 on mobile (§2): the band owns half
    // of each gap, so two adjacent bands add up to the figure in the brief.
    <Section id="modes" padding="none" className="scroll-mt-20 py-8 sm:py-12">
      <Display level={3} as="h2">
        Three ways to sit down.
      </Display>

      <ul className="mt-8 divide-y divide-border border-t border-border">
        {WAYS.map((way, index) => (
          <LedgerRow key={way.href} way={way} index={index} />
        ))}
      </ul>
    </Section>
  );
}
