// src/components/landing/sample-lines.ts  [UI upgrade 2 §2.2, §2.3]
// One line each, in character, all under 90 characters. The names, labels and
// ratings around them come from `DIFFICULTIES` so the landing page can never
// drift from the opponent a visitor actually gets; only these lines are written
// here, and they are quoted rather than generated.
import type { Difficulty } from "@/lib/types";

export const SAMPLE_LINE: Record<Difficulty, string> = {
  beginner: "I nearly moved my queen out there. Glad I did not — your knight looks mean.",
  casual: "Coffee first, then castling. That is the correct order, my friend.",
  intermediate: "Your knight has nowhere to go now. The pin is doing all the work.",
  advanced: "Your bishop is a spectator. Mine is not.",
  grandmaster: "You had one move. That was not it.",
};
