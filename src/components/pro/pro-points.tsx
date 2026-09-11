// src/components/pro/pro-points.tsx  [PRO_TUTOR §1, §7]
// The three points of §1, verbatim, as a ledger rather than three matching cards:
// full-width rows on a seam hairline, the point on the left and the drawing it
// describes on the right. Every position is real and every claim beside it is true of
// the board next to it — the diagrams are the product, not an illustration of it.
import { Display, Section } from "@/components/ui-kit";
import { TutorDiagram, type TutorDiagramProps } from "@/components/pro/tutor-diagram";

export interface Point {
  /** §1, verbatim. */
  title: string;
  /** One line about the position beside it — the board, not the product. */
  note: string;
  diagram: Omit<TutorDiagramProps, "className">;
}

/**
 * Exported so `__tests__/pro-points.test.ts` can hold the page to its word: every FEN
 * has to parse, every annotated square has to hold the piece the note talks about, and
 * "White has mate in one" has to be true of the position printed beside it. A sales
 * page that gets a chess position wrong is worse than one with no diagram at all.
 */
export const PRO_POINTS: Point[] = [
  {
    title: "Why a move was a mistake, in one paragraph",
    note: "Black has just played Nf6. White has mate in one.",
    diagram: {
      // 1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6
      fen: "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
      squares: [{ square: "f6", tone: "bad" }],
      caption: "Square f6 · mistake",
    },
  },
  {
    title: "The plan from here, with the squares that matter marked",
    note: "c3 has prepared d4. That is the whole plan, and it is one square.",
    diagram: {
      // 1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3
      fen: "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/2P2N2/PP1P1PPP/RNBQK2R b KQkq - 0 4",
      squares: [{ square: "d4", tone: "idea" }],
      arrow: { from: "d2", to: "d4", tone: "idea" },
      caption: "Square d4, arrow d2→d4 · idea",
    },
  },
  {
    title: "The threats, before they land",
    note: "The knight on g5 is already looking at f7.",
    diagram: {
      // 1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5
      fen: "r1bqkb1r/pppp1ppp/2n2n2/4p1N1/2B1P3/8/PPPP1PPP/RNBQK2R b KQkq - 5 4",
      squares: [{ square: "f7", tone: "threat" }],
      arrow: { from: "g5", to: "f7", tone: "threat" },
      caption: "Square f7, arrow g5→f7 · threat",
    },
  },
];

export function ProPoints() {
  return (
    <Section id="what-it-does" padding="none" className="scroll-mt-20 py-8 sm:py-12">
      <Display level={3} as="h2">
        What the tutor does.
      </Display>

      <ul className="mt-8 divide-y divide-border border-t border-border">
        {PRO_POINTS.map((point) => (
          <li key={point.title}>
            <div className="grid grid-cols-1 items-center gap-6 py-10 lg:grid-cols-12 lg:gap-x-8 lg:py-12">
              <div className="lg:col-span-6 lg:col-start-1">
                {/* headline-sm: one step under the section title, flat at every
                    width — these are points, not another page header. */}
                <h3 className="font-display text-[2rem] leading-[1.1] tracking-[-0.01em] text-balance text-foreground">
                  {point.title}
                </h3>
                <p className="mt-3 max-w-[52ch] text-[15px] leading-relaxed text-pretty text-muted-foreground">
                  {point.note}
                </p>
              </div>

              {/* Flush with the heading's left edge below lg — a square object centred
                  under left-aligned type reads as two unrelated blocks. */}
              <div className="flex justify-start lg:col-span-5 lg:col-start-8 lg:justify-end">
                <TutorDiagram {...point.diagram} />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
