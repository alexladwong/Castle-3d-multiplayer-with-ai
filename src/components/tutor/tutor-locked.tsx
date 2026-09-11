"use client";
// src/components/tutor/tutor-locked.tsx
// The panel a member without the tutor sees (docs/PRO_TUTOR.md §3.2): what it
// does, in the host's voice; three questions it would answer; one brass way in.
// No fake conversation and no blurred screenshot — nothing here pretends to be
// the thing behind the wall.
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { ANNOTATION_TONE_TOKEN } from "@/lib/tutor/annotations";
import { cn } from "@/lib/ui";
import { rememberTutorReturn } from "./access";

/** §3.2: three of §3.3's four suggestions, as examples rather than as controls. */
const EXAMPLES = ["Why was that a mistake?", "What's the plan here?", "Show me the threats"];

export interface TutorLockedProps {
  /** Stored before leaving, so `/pro` can offer the way back to this game. */
  gameId: string | null;
  /** Shown above the CTA when the route itself refused a request (§3.5). */
  notice?: string | null;
  className?: string;
}

export function TutorLocked({ gameId, notice, className }: TutorLockedProps) {
  return (
    // TOP-ALIGNED under the header plate, not centred. Centring put the whole sales
    // case — a paragraph, three chips, the brass bar and one micro line — in a band at
    // y 390-610 of an 840px column, with the header plate stranded alone above it and
    // ~330px of empty walnut between the two; a 9px squint read the column as an
    // unfinished rectangle. A short pitch that starts where the eye starts reads as
    // deliberate, and ending early is not the same as being unfinished.
    <div className={cn("flex min-h-0 flex-1 flex-col overflow-y-auto p-4", className)}>
      <div className="flex flex-col gap-4 pt-2">
        {notice ? (
          <p role="alert" className="text-[13px] text-foreground">
            {notice}
          </p>
        ) : null}

        {/* §1's own words for what Pro buys, kept identical on this panel and on /pro. */}
        <p className="max-w-[46ch] text-[13px] leading-relaxed text-muted-foreground">
          Ask about any position, in any game. The tutor explains the idea and draws it on the
          board.
        </p>

        {/* The three examples as a taller list carrying the annotation chips' own
            tone dot — the same vocabulary the unlocked panel speaks, so the locked
            column is a picture of the thing rather than three grey pills. */}
        <ul className="flex flex-col items-start gap-2">
          {EXAMPLES.map((example, index) => (
            <li
              key={example}
              className="inline-flex items-center gap-2 rounded-full bg-bg-sunken px-3 py-1.5 text-[13px] text-muted-foreground"
            >
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{
                  backgroundColor:
                    ANNOTATION_TONE_TOKEN[(["bad", "idea", "threat"] as const)[index] ?? "idea"],
                }}
              />
              {example}
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-1.5 pt-1">
          <Link
            prefetch={false}
            href="/pro"
            onClick={() => {
              if (gameId !== null) rememberTutorReturn(gameId);
            }}
            className={cn(buttonVariants(), "w-full pointer-coarse:h-11")}
          >
            Go Pro
          </Link>
          <p className="text-center text-[12px] text-muted-foreground">Monthly. Cancel any time.</p>
        </div>
      </div>
    </div>
  );
}
