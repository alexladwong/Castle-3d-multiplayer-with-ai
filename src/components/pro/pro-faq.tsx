// src/components/pro/pro-faq.tsx  [PRO_TUTOR §7]
// "a short FAQ in the host voice (what the tutor can and cannot do; cancellation;
// the tutor's engine runs in your browser)".
//
// Native `<details>`: it is keyboard-operable, findable by the browser's own find
// command when closed, and needs no JavaScript — so this whole band ships in the
// first HTML response with the rest of the static shell. The turn cap is printed from
// `MAX_TUTOR_TURNS_PER_GAME`, not typed out, so the answer cannot drift from the code.
import { ChevronDown } from "lucide-react";
import { Display, Section } from "@/components/ui-kit";
import { MAX_TUTOR_TURNS_PER_GAME } from "@/lib/constants";
import { cn, focusRing } from "@/lib/ui";

interface Question {
  q: string;
  a: React.ReactNode;
}

const QUESTIONS: Question[] = [
  {
    q: "Do I need Pro to play?",
    a: "No. Rated games, the five AI opponents, the rooms, spectating and the leaderboard are free and stay free. Pro adds the tutor, and nothing else.",
  },
  {
    q: "What can I ask it?",
    a: "Anything about the position in front of you: why a move went wrong, what the plan is, what your opponent is threatening, what the best move is and why. It answers in a short paragraph and marks the squares it is talking about.",
  },
  {
    q: "Which games does it sit in?",
    a: "All of them — online, against the AI, pass and play, spectating and replays. It follows the board, so if you review an earlier move it answers about that position instead of the live one.",
  },
  {
    q: "What will it not do?",
    a: `It will not play for you, and it will not take your turn. It answers up to ${MAX_TUTOR_TURNS_PER_GAME} questions in one game; after that, start a new game and it starts again.`,
  },
  {
    q: "Where does the analysis come from?",
    a: "The tutor's engine runs in your browser, not on a server — the same Stockfish the AI opponents play with. So the lines it reasons from are worked out on your own machine.",
  },
  {
    q: "How do I cancel?",
    a: "In your account, under Billing — the avatar menu in the header, or the Plan row in settings. There is no notice period.",
  },
];

export function ProFaq() {
  return (
    <Section id="questions" padding="none" className="scroll-mt-20 py-8 sm:py-12">
      <Display level={3} as="h2">
        Questions.
      </Display>

      <div className="mt-8 divide-y divide-border border-y border-border">
        {QUESTIONS.map((item, index) => (
          <details key={item.q} name="pro-faq" open={index === 0} className="group/faq">
            <summary
              className={cn(
                "flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 rounded-lg py-4 pr-1",
                "text-[1.25rem] font-semibold tracking-tight text-foreground transition-colors duration-(--dur-micro)",
                "hover:text-primary [&::-webkit-details-marker]:hidden",
                focusRing,
              )}
            >
              {item.q}
              <ChevronDown
                aria-hidden
                className="size-4 shrink-0 text-primary transition-transform duration-(--dur-micro) group-open/faq:rotate-180 motion-reduce:transition-none"
              />
            </summary>
            {/* 60ch, the widest measure used anywhere else in the app. 68ch rendered 676px
                at 15px — about 90 characters a line, above the readable 45-75 band and
                the only place in the repo that reached for it. */}
            <p className="max-w-[60ch] pb-5 text-[15px] leading-relaxed text-pretty text-muted-foreground">
              {item.a}
            </p>
          </details>
        ))}
      </div>
    </Section>
  );
}
