// src/lib/mock/scenarios.ts  [U2]
// The §8 verification scenarios, as pure data.
//
// Deliberately free of React, zustand and chess.js *state*: the harness hook
// (`game-controller.ts`) and the vitest fixture check both import from here, and
// the test must be able to replay every scenario in a bare node environment.
import type { TutorErrorKind } from "@/hooks/use-tutor-chat";
import type { TutorUIMessage } from "@/lib/tutor/tools";
import type { ChatStatus } from "ai";
import { replay } from "@/lib/chess";
import { MAX_TUTOR_TURNS_PER_GAME } from "@/lib/constants";
import type { LayoutMode } from "@/lib/stores/ui-store";
import type {
  AiPhase,
  Colour,
  Difficulty,
  EndReason,
  EngineStatus,
  GameMode,
  GameStatus,
  HintResult,
  PlayerId,
  PlayerSummary,
  ViewerRole,
  Winner,
} from "@/lib/types";

/* ------------------------------------------------------------- scenarios */

export const MOCK_SCENARIO_IDS = [
  "ai-midgame",
  "ai-hint",
  "online-draw-offer",
  "local-flip",
  "review",
  "finished",
  "fullscreen",
  "tutor-pro",
  "tutor-locked",
  "tutor-empty",
  "tutor-thinking",
  "tutor-engine-busy",
  "tutor-quota",
  "tutor-network",
  "tutor-unavailable",
] as const;

export type MockScenarioId = (typeof MOCK_SCENARIO_IDS)[number];

export interface MockCommentaryRow {
  ply: number;
  text: string;
  source: "eve" | "fallback" | "hint";
  persona?: string;
}

export interface MockTutorState {
  /** "pro" renders the unlocked panel with `messages`; "locked" renders the teaser. */
  access: "pro" | "locked";
  /** A scripted conversation in AI SDK UIMessage shape (typed by the tutor tools). */
  messages: TutorUIMessage[];
  /**
   * docs/PRO_TUTOR.md §3: "all states must render in the dev harness". The panel's
   * state is the conversation PLUS these two, so the thinking row (§3.3) and the four
   * error rows (§3.5) need them or they can never be looked at. Both default to the
   * settled case: a finished answer and no error.
   */
  status?: ChatStatus;
  error?: TutorErrorKind;
}

export interface MockScenario {
  /**
   * docs/PRO_TUTOR.md §8: the tutor panel's state for this scenario. Absent = the
   * harness renders the game without a tutor column (pre-Pro behaviour).
   */
  tutor?: MockTutorState;
  id: MockScenarioId;
  label: string;
  summary: string;
  mode: GameMode;
  viewerRole: ViewerRole;
  difficulty?: Difficulty;
  aiColor?: Colour;
  /** SAN, oldest first. Validated by `src/lib/mock/__tests__/game-controller.test.ts`. */
  moves: string[];
  status: GameStatus;
  winner?: Winner;
  endReason?: EndReason;
  drawOffer?: Colour;
  rated: boolean;
  hintsUsed: number;
  undoCount: number;
  spectatorCount: number;
  /** Ply the shell opens on; null starts live. */
  reviewPly: number | null;
  layoutMode: LayoutMode;
  /** True on mount for the local hand-over overlay. */
  flipping: boolean;
  whiteName: string;
  blackName: string;
  white: PlayerSummary | null;
  black: PlayerSummary | null;
  commentary: MockCommentaryRow[];
  ai: {
    phase: AiPhase;
    engineStatus: EngineStatus;
    downloadPercent: number;
    hint: HintResult | null;
  };
  /** The viewer's rating change, for the finished scenario. */
  rating: { delta: number; after: number } | null;
}

const ITALIAN = [
  "e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "c3", "Nf6",
  "d4", "exd4", "cxd4", "Bb4+", "Nc3",
];

const SCHOLARS = ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"];

function player(id: string, username: string, rating: number): PlayerSummary {
  return {
    _id: id as PlayerId,
    username,
    avatarUrl: "",
    rating,
  };
}

const HUMAN = player("mock_player_human", "quinn", 1284);
const RIVAL = player("mock_player_rival", "adrienne", 1311);

const BASE: Omit<MockScenario, "id" | "label" | "summary"> = {
  mode: "ai",
  viewerRole: "white",
  difficulty: "beginner",
  aiColor: "b",
  moves: ITALIAN,
  status: "active",
  rated: true,
  hintsUsed: 1,
  undoCount: 0,
  spectatorCount: 0,
  reviewPly: null,
  layoutMode: "default",
  flipping: false,
  whiteName: "quinn",
  blackName: "Pip",
  white: HUMAN,
  black: null,
  commentary: [],
  ai: { phase: "idle", engineStatus: "ready", downloadPercent: 100, hint: null },
  rating: null,
};

const AI_COMMENTARY: MockCommentaryRow[] = [
  { ply: 4, text: "Knights before bishops — that is what my club captain says, anyway.", source: "eve", persona: "pip" },
  { ply: 8, text: "You have the centre. I am going to poke at it and see what falls over.", source: "eve", persona: "pip" },
  { ply: 12, text: "Check — not a scary one, but I had to try it before you castled.", source: "eve", persona: "pip" },
];

/**
 * The position both tutor scenarios sit on: ITALIAN after 13.Nc3, Black (Pip) to move,
 * the viewer on White. Asserted against `mockPosition(ITALIAN).fen` by the fixture test,
 * so a change to the move list cannot leave the scripted answers talking about a
 * position that is no longer on the board.
 */
export const TUTOR_SCENARIO_FEN = "r1bqk2r/pppp1ppp/2n2n2/8/1bBPP3/2N2N2/PP3PPP/R1BQK2R b KQkq - 2 7";

/**
 * §8's scripted conversation: two questions from the player (the composer's own
 * suggestion chips, §3) and two answers whose parts carry all three drawing tools plus
 * a `requestAnalysis` round trip. Every input is true of the position above — e4 and f7
 * really are the squares this Greco line turns on, and 13...Nxe4 14.Bxf7+ Kxf7 15.Qb3+
 * is legal from it, which the fixture test replays move by move.
 */
const TUTOR_MESSAGES: TutorUIMessage[] = [
  {
    id: "tutor-msg-1",
    role: "user",
    parts: [{ type: "text", text: "Show me the threats" }],
  },
  {
    id: "tutor-msg-2",
    role: "assistant",
    parts: [
      {
        type: "tool-requestAnalysis",
        toolCallId: "tutor-call-analysis",
        state: "output-available",
        input: { depth: 16, multiPv: 3 },
        output: {
          fen: TUTOR_SCENARIO_FEN,
          note: "ok",
          lines: [
            {
              san: "Nxe4",
              uci: "f6e4",
              scoreCp: 38,
              mateIn: null,
              depth: 16,
              pv: ["f6e4", "c4f7", "e8f7", "d1b3"],
            },
            {
              san: "O-O",
              uci: "e8g8",
              scoreCp: 14,
              mateIn: null,
              depth: 16,
              pv: ["e8g8", "e1g1", "b4c3", "b2c3"],
            },
            {
              san: "d5",
              uci: "d7d5",
              scoreCp: -12,
              mateIn: null,
              depth: 16,
              pv: ["d7d5", "e4d5", "f6d5", "e1g1"],
            },
          ],
        },
      },
      {
        type: "text",
        text:
          "Pip's knight on f6 wants e4. Your knight on c3 is pinned to the king by the " +
          "bishop on b4, so it cannot take back and the pawn is loose. Keep f7 in mind " +
          "too: your bishop on c4 is already looking at it. Those are the two squares " +
          "this position turns on.",
      },
      {
        type: "tool-highlightSquares",
        toolCallId: "tutor-call-squares",
        state: "output-available",
        input: { squares: ["e4", "f7"], tone: "threat" },
        output: { ok: true, count: 2 },
      },
      {
        type: "tool-drawArrows",
        toolCallId: "tutor-call-arrows",
        state: "output-available",
        input: { arrows: [{ from: "f6", to: "e4", tone: "threat" }] },
        output: { ok: true, count: 1 },
      },
    ],
  },
  {
    id: "tutor-msg-3",
    role: "user",
    parts: [{ type: "text", text: "What's the plan here?" }],
  },
  {
    id: "tutor-msg-4",
    role: "assistant",
    parts: [
      {
        type: "text",
        text:
          "Let it happen. If Pip takes on e4, Bxf7+ pulls the king out, and Qb3+ arrives " +
          "with check to collect the knight. That is the Greco line, and it is why your " +
          "bishop went to c4 in the first place. I have numbered it on the board.",
      },
      {
        type: "tool-showLine",
        toolCallId: "tutor-call-line",
        state: "output-available",
        input: { san: ["Nxe4", "Bxf7+", "Kxf7", "Qb3+"] },
        output: {
          ok: true,
          steps: [
            { from: "f6", to: "e4", san: "Nxe4" },
            { from: "c4", to: "f7", san: "Bxf7+" },
            { from: "e8", to: "f7", san: "Kxf7" },
            { from: "d1", to: "b3", san: "Qb3+" },
          ],
        },
      },
    ],
  },
];

/** §3.3's thinking row in full: a question asked, and the engine still searching. */
const TUTOR_THINKING: TutorUIMessage[] = [
  ...TUTOR_MESSAGES,
  { id: "tutor-msg-5", role: "user", parts: [{ type: "text", text: "Best move and why" }] },
  {
    id: "tutor-msg-6",
    role: "assistant",
    parts: [
      {
        type: "tool-requestAnalysis",
        toolCallId: "tutor-call-analysis-2",
        state: "input-available",
        input: { depth: 16, multiPv: 3 },
      },
    ],
  },
];

/** §3.5's engine notice: the search queued behind the opponent's move and timed out. */
const TUTOR_ENGINE_BUSY: TutorUIMessage[] = [
  { id: "tutor-busy-1", role: "user", parts: [{ type: "text", text: "Why was that a mistake?" }] },
  {
    id: "tutor-busy-2",
    role: "assistant",
    parts: [
      {
        type: "tool-requestAnalysis",
        toolCallId: "tutor-call-busy",
        state: "output-available",
        input: { depth: 16, multiPv: 3 },
        output: { fen: TUTOR_SCENARIO_FEN, note: "engine-busy", lines: [] },
      },
      {
        type: "text",
        text:
          "I could not get a search in — the engine is thinking about Pip's move. From " +
          "the shape alone: the bishop on b4 is doing the work, because it pins the " +
          "knight on c3 and takes the defender off e4.",
      },
    ],
  },
];

export const MOCK_SCENARIOS: Record<MockScenarioId, MockScenario> = {
  "ai-midgame": {
    ...BASE,
    id: "ai-midgame",
    label: "AI · mid-game",
    summary: "13 plies, three commentary rows, Pip thinking.",
    commentary: AI_COMMENTARY,
    ai: { phase: "agent", engineStatus: "ready", downloadPercent: 100, hint: null },
  },
  "ai-hint": {
    ...BASE,
    id: "ai-hint",
    label: "AI · hint",
    summary: "A hint has come back and is tagged in the chat.",
    hintsUsed: 2,
    commentary: AI_COMMENTARY,
    ai: {
      phase: "idle",
      engineStatus: "ready",
      downloadPercent: 100,
      hint: {
        san: "O-O",
        text: "Castle. Your king is still in the middle and the d-file is about to open.",
        source: "eve",
      },
    },
  },
  "online-draw-offer": {
    ...BASE,
    id: "online-draw-offer",
    label: "Online · draw offered",
    summary: "A rated online game with an offer standing from Black.",
    mode: "online",
    viewerRole: "white",
    difficulty: undefined,
    aiColor: undefined,
    blackName: "adrienne",
    black: RIVAL,
    drawOffer: "b",
    hintsUsed: 0,
    commentary: [],
  },
  "local-flip": {
    ...BASE,
    id: "local-flip",
    label: "Local · hand-over",
    summary: "Pass-and-play with the hand-over overlay showing.",
    mode: "local",
    viewerRole: "local",
    difficulty: undefined,
    aiColor: undefined,
    blackName: "Player 2",
    rated: false,
    hintsUsed: 0,
    flipping: true,
    commentary: [],
  },
  review: {
    ...BASE,
    id: "review",
    label: "Reviewing move 8",
    summary: "Live game with the board rewound to ply 8.",
    reviewPly: 8,
    commentary: AI_COMMENTARY,
  },
  finished: {
    ...BASE,
    id: "finished",
    label: "Finished · result dialog",
    summary: "Checkmate, rating delta and the result dialog open.",
    moves: SCHOLARS,
    status: "checkmate",
    winner: "w",
    endReason: "checkmate",
    hintsUsed: 3,
    undoCount: 1,
    commentary: [
      { ply: 2, text: "Same as last time then. Fine by me.", source: "eve", persona: "pip" },
      { ply: 6, text: "Oh. Oh no. I have seen this one before.", source: "eve", persona: "pip" },
    ],
    rating: { delta: 12, after: 1296 },
  },
  fullscreen: {
    ...BASE,
    id: "fullscreen",
    label: "Focus layout",
    summary: "The §5.2 board-focus layout with its floating HUD.",
    layoutMode: "focus",
    commentary: AI_COMMENTARY,
  },
  "tutor-pro": {
    ...BASE,
    id: "tutor-pro",
    label: "Tutor · Pro",
    summary: "The tutor has answered twice, with squares, an arrow and a numbered line.",
    commentary: AI_COMMENTARY,
    tutor: { access: "pro", messages: TUTOR_MESSAGES },
  },
  "tutor-locked": {
    ...BASE,
    id: "tutor-locked",
    label: "Tutor · locked",
    summary: "The same game without Pro: the panel says what the tutor does.",
    commentary: AI_COMMENTARY,
    tutor: { access: "locked", messages: [] },
  },

  /* §3's panel anatomy says "all states must render in the dev harness", and the six
   * below are the ones a member meets most: the first thing they see, the row that
   * covers every wait, and the four ways an answer can fail. They are data, not
   * fixtures — each is the same game with the panel put in one more state. */
  "tutor-empty": {
    ...BASE,
    id: "tutor-empty",
    label: "Tutor · empty",
    summary: "§3.6: unlocked with nothing asked yet — the one opening bubble.",
    commentary: AI_COMMENTARY,
    tutor: { access: "pro", messages: [] },
  },
  "tutor-thinking": {
    ...BASE,
    id: "tutor-thinking",
    label: "Tutor · thinking",
    summary: "§3.3: the thinking row while the player's engine is still searching.",
    commentary: AI_COMMENTARY,
    tutor: { access: "pro", messages: TUTOR_THINKING, status: "streaming" },
  },
  "tutor-engine-busy": {
    ...BASE,
    id: "tutor-engine-busy",
    label: "Tutor · engine busy",
    summary: "§3.5: the engine went to the opponent's move; the tutor answers anyway.",
    commentary: AI_COMMENTARY,
    tutor: { access: "pro", messages: TUTOR_ENGINE_BUSY },
  },
  "tutor-quota": {
    ...BASE,
    id: "tutor-quota",
    label: "Tutor · quota",
    summary: `§3.5: all ${MAX_TUTOR_TURNS_PER_GAME} turns spent — the composer says so.`,
    commentary: AI_COMMENTARY,
    tutor: { access: "pro", messages: TUTOR_MESSAGES, error: "quota" },
  },
  "tutor-network": {
    ...BASE,
    id: "tutor-network",
    label: "Tutor · no answer",
    summary: "§3.5: the answer did not arrive, with the retry beside it.",
    commentary: AI_COMMENTARY,
    tutor: { access: "pro", messages: TUTOR_MESSAGES, error: "network" },
  },
  "tutor-unavailable": {
    ...BASE,
    id: "tutor-unavailable",
    label: "Tutor · unavailable",
    summary: "§3.5: a 503 from the route — no retry, because a retry fails the same.",
    commentary: AI_COMMENTARY,
    tutor: { access: "pro", messages: TUTOR_MESSAGES, error: "unavailable" },
  },
};

export function isMockScenarioId(value: string | null): value is MockScenarioId {
  return value !== null && (MOCK_SCENARIO_IDS as readonly string[]).includes(value);
}

/* ------------------------------------------------------------ pure replay */

export interface MockPosition {
  fen: string;
  turn: Colour;
  moves: string[];
  isCheckmate: boolean;
  isDraw: boolean;
}

/**
 * Replays a scenario's SAN list. Throws on an illegal move — which is exactly
 * what `game-controller.test.ts` relies on to keep the fixtures honest.
 */
export function mockPosition(moves: string[]): MockPosition {
  const chess = replay(moves);
  return {
    fen: chess.fen(),
    turn: chess.turn(),
    moves: chess.history(),
    isCheckmate: chess.isCheckmate(),
    isDraw: chess.isDraw(),
  };
}
