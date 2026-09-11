// src/components/play/personas.ts  [U5]
// One line each, in character, all under 90 characters — the same brief the
// landing page's roster was written to. Names, labels and ratings come from
// `src/lib/difficulty.ts` so the lobby can never promise an opponent that does
// not exist; only these lines are authored here.
import type { Difficulty } from "@/lib/types";

export const SAMPLE_LINE: Record<Difficulty, string> = {
  beginner: "I nearly moved my queen out there. Glad I did not — your knight looks mean.",
  casual: "Coffee first, then castling. That is the correct order, my friend.",
  intermediate: "Your knight has nowhere to go now. The pin is doing all the work.",
  advanced: "Your bishop is a spectator. Mine is not.",
  grandmaster: "You had one move. That was not it.",
};
