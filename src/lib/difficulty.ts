// src/lib/difficulty.ts
import type { Difficulty } from "./types";

export interface Persona {
  key: string;
  name: string;
  blurb: string;
}

export interface DifficultyConfig {
  id: Difficulty;
  label: string;
  description: string;
  /** UCI `go depth`. */
  depth: number;
  /** UCI `MultiPV` for the candidate list handed to the agent. */
  multiPv: number;
  /** Hard `stop` timeout for the search; bestmove arrives ~50 ms later. */
  searchTimeoutMs: number;
  /**
   * PRD §3.8's "Stockfish Skill Level" column (0-20; 20 = full strength).
   *
   * It is used in exactly ONE place: the RAW ENGINE FALLBACK, i.e. when the agent
   * route failed and the client asks Stockfish itself to play a move
   * (`fallbackEngineMove` in `engine/fallback-move.ts`). There the engine's own
   * weakening is what we want — at Skill Level < 20 Stockfish picks a randomised
   * sub-optimal move at depth `1 + level` (stockfish.md §6).
   *
   * It is deliberately NOT used for candidate generation or for hints, which both
   * run at `STOCKFISH_CANDIDATE_SKILL_LEVEL` (20): below 20 Stockfish also forces
   * internal MultiPV >= 4 and its `bestmove` stops matching `multipv 1`, so the
   * ranking handed to the agent would not describe the move it plays (§E.4 step 4).
   */
  skillLevel: number;
  /**
   * PRD §3.8's selection policy, word for word, in both places it is applied:
   * pushed to the agent as `clientContext.selectionPolicy` (the primary chooser)
   * and implemented in `selectCandidate` (the fallback). The two MUST agree —
   * `difficulty.test.ts` asserts each string is also the matching row of
   * `agent/instructions.md`, so edit all three together.
   *
   * Candidate generation itself carries no handicap — it always runs at Skill
   * Level 20 so the ranking is honest; this policy is the handicap for the
   * agent/JS path, and `skillLevel` above is the handicap for the raw engine path.
   */
  selectionPolicy: string;
  persona: Persona;
  /** Fixed Elo used when rating an AI game (FR-49). */
  aiRating: number;
  hintsAllowed: boolean;
}

export const DIFFICULTIES: Record<Difficulty, DifficultyConfig> = {
  beginner: {
    id: "beginner",
    label: "Beginner",
    description: "Learning the ropes. Explains what you could have done better.",
    depth: 2, multiPv: 5, searchTimeoutMs: 800, skillLevel: 1,
    selectionPolicy:
      "Pick a random candidate from the top 5; about half the time prefer a quiet (non-capturing) move.",
    persona: { key: "pip", name: "Pip", blurb: "Cheerful club newcomer; encouraging, a bit nervous." },
    aiRating: 800,
    hintsAllowed: true,
  },
  casual: {
    id: "casual",
    label: "Casual",
    description: "A friendly game with a chatty café player.",
    depth: 6, multiPv: 3, searchTimeoutMs: 1200, skillLevel: 5,
    selectionPolicy: "Pick a random candidate from the top 3.",
    persona: { key: "marco", name: "Marco", blurb: "Friendly café player; chatty, light jokes." },
    aiRating: 1100,
    hintsAllowed: true,
  },
  intermediate: {
    id: "intermediate",
    label: "Intermediate",
    description: "A patient coach who names the idea behind each move.",
    depth: 10, multiPv: 3, searchTimeoutMs: 1800, skillLevel: 10,
    selectionPolicy: "Pick rank 1 about 70% of the time, otherwise rank 2.",
    persona: { key: "ada", name: "Ada", blurb: "Patient coach; names the idea (pin, outpost, tempo)." },
    aiRating: 1400,
    hintsAllowed: false,
  },
  advanced: {
    id: "advanced",
    label: "Advanced",
    description: "A serious tournament player. Terse and accurate.",
    depth: 14, multiPv: 2, searchTimeoutMs: 2400, skillLevel: 15,
    selectionPolicy: "Always pick rank 1 (the best move).",
    persona: { key: "viktor", name: "Viktor", blurb: "Dry, confident tournament player; terse." },
    aiRating: 1800,
    hintsAllowed: false,
  },
  grandmaster: {
    id: "grandmaster",
    label: "Grandmaster",
    description: "No mercy, and she will tell you about it.",
    depth: 18, multiPv: 2, searchTimeoutMs: 2600, skillLevel: 20,
    selectionPolicy: "Always pick rank 1 (the best move).",
    persona: { key: "kasparova", name: "Kasparova", blurb: "Imperious grandmaster; cutting one-liners." },
    aiRating: 2300,
    hintsAllowed: false,
  },
};

export const DIFFICULTY_ORDER: Difficulty[] = [
  "beginner", "casual", "intermediate", "advanced", "grandmaster",
];

export const AI_RATING: Record<Difficulty, number> = {
  beginner: 800, casual: 1100, intermediate: 1400, advanced: 1800, grandmaster: 2300,
};

export function aiDisplayName(difficulty: Difficulty): string {
  return DIFFICULTIES[difficulty].persona.name;
}
