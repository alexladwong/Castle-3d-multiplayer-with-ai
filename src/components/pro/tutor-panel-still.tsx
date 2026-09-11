// src/components/pro/tutor-panel-still.tsx  [PRO_TUTOR §3.1, §3.3, §3.6]
// A still of the tutor panel's empty state: the header plate, the opening bubble and
// the four suggestion chips — the panel's real anatomy, with the real strings.
//
// Nothing here is interactive and nothing pretends to be: the chips are `<span>`s and
// there is no composer, because a text field on a marketing page that swallows what
// you type into it is a lie told with markup. Everything on it is readable content,
// so no part of it is hidden from a screen reader either.
import { ChatMessage } from "@/components/ui-kit";
import { cn } from "@/lib/ui";

/** §3.3, verbatim: the four chips that fill the composer in the real panel. */
const SUGGESTIONS = [
  "Why was that a mistake?",
  "What's the plan here?",
  "Show me the threats",
  "Best move and why",
];

export function TutorPanelStill({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "w-full max-w-[24rem] rounded-xl border border-border bg-card p-4 text-[0.875rem]",
        className,
      )}
    >
      {/* §3.1 header plate: monogram disc, the name, the brass Pro chip. */}
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <span
          aria-hidden
          className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-[12px] font-medium text-primary-foreground"
        >
          T
        </span>
        <p className="text-[0.9375rem] font-semibold tracking-tight text-foreground">Tutor</p>
        {/* Uppercase, like the live panel's own chip: this still-life is the picture
            of the thing the reader is about to buy, and it sits one click from it. */}
        <span className="ml-auto rounded-full border border-primary/40 px-2 py-0.5 text-[0.75rem] font-medium tracking-wide text-primary uppercase">
          Pro
        </span>
      </div>

      <ul className="flex flex-col gap-2 py-4">
        {/* No `personaName`: the header plate two rows up already says "Tutor",
            and a bubble that repeats the speaker's name under their own heading is
            the panel talking to itself. */}
        <ChatMessage variant="ai" personaInitial="T">
          Ask me about any position. I will explain and mark the board.
        </ChatMessage>
      </ul>

      <ul className="flex flex-wrap gap-1.5 border-t border-border pt-3">
        {SUGGESTIONS.map((chip) => (
          <li
            key={chip}
            className="rounded-full bg-bg-sunken px-2.5 py-1 text-[0.75rem] leading-normal text-muted-foreground"
          >
            {chip}
          </li>
        ))}
      </ul>
    </div>
  );
}
