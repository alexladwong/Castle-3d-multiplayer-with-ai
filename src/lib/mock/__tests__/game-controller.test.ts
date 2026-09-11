// @vitest-environment node
// src/lib/mock/__tests__/game-controller.test.ts  [U2]
// The /dev/game harness is only useful if its fixtures are real chess. Every §8
// scenario is replayed through chess.js here, so a typo in a SAN list fails the
// suite instead of blanking the harness board.
import { describe, expect, it } from "vitest";
import {
  MOCK_SCENARIOS,
  MOCK_SCENARIO_IDS,
  TUTOR_SCENARIO_FEN,
  isMockScenarioId,
  mockPosition,
} from "../scenarios";
import { SQUARE_PATTERN, validateLine } from "@/lib/tutor/tools";
import { analysisStateOf } from "@/lib/tutor/overlay";

describe("mock scenarios", () => {
  it("covers every scenario UI_REDESIGN §8 asks for", () => {
    expect([...MOCK_SCENARIO_IDS]).toEqual([
      "ai-midgame",
      "ai-hint",
      "online-draw-offer",
      "local-flip",
      "review",
      "finished",
      "fullscreen",
      "tutor-pro",
      "tutor-locked",
      // docs/PRO_TUTOR.md §3: "all states must render in the dev harness".
      "tutor-empty",
      "tutor-thinking",
      "tutor-engine-busy",
      "tutor-quota",
      "tutor-network",
      "tutor-unavailable",
    ]);
  });

  it.each(MOCK_SCENARIO_IDS)("%s replays as a legal game", (id) => {
    const scenario = MOCK_SCENARIOS[id];
    const position = mockPosition(scenario.moves);
    // chess.js re-emits the SAN it accepted; a mismatch means the fixture was
    // written in a spelling chess.js does not produce.
    expect(position.moves).toEqual(scenario.moves);
    expect(position.fen.split(" ")[1]).toBe(position.turn);
    // Side to move alternates from white, so the ply count fixes the turn.
    expect(position.turn).toBe(scenario.moves.length % 2 === 0 ? "w" : "b");
  });

  it("only marks a scenario finished when the position really is", () => {
    for (const id of MOCK_SCENARIO_IDS) {
      const scenario = MOCK_SCENARIOS[id];
      const position = mockPosition(scenario.moves);
      if (scenario.status === "checkmate") {
        expect(position.isCheckmate, `${id} is not mate`).toBe(true);
      } else if (scenario.status === "active") {
        expect(position.isCheckmate, `${id} is mate but marked active`).toBe(false);
        expect(position.isDraw, `${id} is drawn but marked active`).toBe(false);
      }
    }
  });

  it("opens each scenario on a ply the game actually has", () => {
    for (const id of MOCK_SCENARIO_IDS) {
      const { reviewPly, moves } = MOCK_SCENARIOS[id];
      if (reviewPly === null) continue;
      expect(reviewPly).toBeGreaterThanOrEqual(0);
      expect(reviewPly).toBeLessThan(moves.length);
    }
  });

  it("only ever files commentary against a move that was played", () => {
    for (const id of MOCK_SCENARIO_IDS) {
      const { commentary, moves } = MOCK_SCENARIOS[id];
      for (const row of commentary) {
        expect(row.ply, `${id} commentary ply`).toBeGreaterThan(0);
        expect(row.ply, `${id} commentary ply`).toBeLessThanOrEqual(moves.length);
      }
    }
  });

  /* ------------------------------------------------- docs/PRO_TUTOR.md §8 */

  /** Every scenario whose id names the tutor carries a tutor state; no other does. */
  const TUTOR_IDS = MOCK_SCENARIO_IDS.filter((id) => id.startsWith("tutor-"));

  it("gives every tutor scenario the position its answers talk about", () => {
    for (const id of TUTOR_IDS) {
      expect(mockPosition(MOCK_SCENARIOS[id].moves).fen, id).toBe(TUTOR_SCENARIO_FEN);
    }
  });

  it("locks one tutor scenario, unlocks the rest, and leaves every other alone", () => {
    expect(MOCK_SCENARIOS["tutor-pro"].tutor).toMatchObject({ access: "pro" });
    expect(MOCK_SCENARIOS["tutor-pro"].tutor?.messages.length).toBe(4);
    expect(MOCK_SCENARIOS["tutor-locked"].tutor).toEqual({ access: "locked", messages: [] });
    for (const id of MOCK_SCENARIO_IDS) {
      if (TUTOR_IDS.includes(id)) {
        expect(MOCK_SCENARIOS[id].tutor, `${id} should have tutor state`).toBeDefined();
        continue;
      }
      expect(MOCK_SCENARIOS[id].tutor, `${id} should have no tutor state`).toBeUndefined();
    }
  });

  /**
   * §3's panel anatomy: "all states must render in the dev harness". A scenario has
   * to exist for the empty bubble, the thinking row, the engine notice and each of
   * the three error rows, or those states can never be looked at.
   */
  it("has a scenario for every state of the panel §3 names", () => {
    expect(MOCK_SCENARIOS["tutor-empty"].tutor).toEqual({ access: "pro", messages: [] });
    expect(MOCK_SCENARIOS["tutor-thinking"].tutor?.status).toBe("streaming");
    expect(MOCK_SCENARIOS["tutor-quota"].tutor?.error).toBe("quota");
    expect(MOCK_SCENARIOS["tutor-network"].tutor?.error).toBe("network");
    expect(MOCK_SCENARIOS["tutor-unavailable"].tutor?.error).toBe("unavailable");
    // The engine notice is a property of the conversation, not of `error`.
    const busy = MOCK_SCENARIOS["tutor-engine-busy"].tutor!.messages.at(-1)!;
    expect(analysisStateOf(busy)).toBe("engine-busy");
  });

  it("scripts every drawing tool, with inputs the position actually supports", () => {
    const parts = MOCK_SCENARIOS["tutor-pro"].tutor!.messages.flatMap((message) => message.parts);
    const byType = (type: string) => parts.filter((part) => part.type === type);

    // All three drawing tools plus the engine round trip, all answered.
    for (const tool of ["highlightSquares", "drawArrows", "showLine", "requestAnalysis"]) {
      const calls = byType(`tool-${tool}`);
      expect(calls.length, tool).toBeGreaterThan(0);
      for (const call of calls) expect(call).toMatchObject({ state: "output-available" });
    }

    for (const call of byType("tool-highlightSquares")) {
      const input = (call as { input: { squares: string[] } }).input;
      for (const square of input.squares) expect(square).toMatch(SQUARE_PATTERN);
    }
    for (const call of byType("tool-drawArrows")) {
      const input = (call as { input: { arrows: { from: string; to: string }[] } }).input;
      for (const arrow of input.arrows) {
        expect(arrow.from).toMatch(SQUARE_PATTERN);
        expect(arrow.to).toMatch(SQUARE_PATTERN);
        expect(arrow.from).not.toBe(arrow.to);
      }
    }

    // The scripted line is real chess from the scripted position, and the steps the
    // fixture hands the board are the ones chess.js derives.
    for (const call of byType("tool-showLine")) {
      const { input, output } = call as {
        input: { san: string[] };
        output: { ok: boolean; steps?: { from: string; to: string; san: string }[] };
      };
      const replayed = validateLine(TUTOR_SCENARIO_FEN, input.san);
      expect(replayed.ok, input.san.join(" ")).toBe(true);
      expect(output.steps).toEqual(replayed.ok ? replayed.steps : undefined);
    }

    // The engine round trip reports the position it was asked about.
    for (const call of byType("tool-requestAnalysis")) {
      const output = (call as { output: { fen: string; lines: { san: string }[] } }).output;
      expect(output.fen).toBe(TUTOR_SCENARIO_FEN);
      expect(output.lines.length).toBeGreaterThan(0);
    }
  });

  it("recognises its own ids and nothing else", () => {
    expect(isMockScenarioId("ai-midgame")).toBe(true);
    expect(isMockScenarioId("nope")).toBe(false);
    expect(isMockScenarioId(null)).toBe(false);
  });
});
