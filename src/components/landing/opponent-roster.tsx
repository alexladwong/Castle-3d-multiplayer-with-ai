// The opponent roster shares the rankings' orderly rhythm and the hero's serif.
import { Display, Section } from "@/components/ui-kit";
import { MAX_HINTS_PER_GAME } from "@/lib/constants";
import { DIFFICULTIES, DIFFICULTY_ORDER } from "@/lib/difficulty";
import { SAMPLE_LINE } from "./sample-lines";

export function OpponentRoster() {
  return (
    <Section id="opponents" padding="none" className="scroll-mt-20 py-8 sm:py-12">
      <Display level={3} as="h2">Five opponents, five opinions.</Display>
      <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-muted-foreground">
        From your first game to your toughest. Each opponent makes its move, then explains the thinking.
      </p>
      <ul className="mt-10 grid border-t border-border sm:grid-cols-2 lg:grid-cols-5">
        {DIFFICULTY_ORDER.map((id, index) => {
          const config = DIFFICULTIES[id];
          return (
            <li key={id} className="min-w-0 border-b border-border py-7 sm:px-5 lg:border-b-0 lg:border-r lg:first:pl-0 lg:last:border-r-0 lg:last:pr-0">
              <div className="mb-6 flex items-center justify-between gap-3">
                <div aria-hidden className="flex gap-1.5">
                  {DIFFICULTY_ORDER.map((level, step) => (
                    <span key={level} className={`h-1 w-4 rounded-full ${step <= index ? "bg-primary" : "bg-border"}`} />
                  ))}
                </div>
                <span className="font-mono text-[13px] tabular-nums text-muted-foreground">{config.aiRating}</span>
              </div>
              <h3 className="font-display text-[2rem] leading-tight">{config.persona.name}</h3>
              <p className="mt-2 text-xs text-muted-foreground">
                {config.label}{config.hintsAllowed ? ` · ${MAX_HINTS_PER_GAME} hints` : ""}
              </p>
              <blockquote className="mt-5 text-[13px] leading-relaxed text-muted-foreground">
                “{SAMPLE_LINE[id]}”
              </blockquote>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
