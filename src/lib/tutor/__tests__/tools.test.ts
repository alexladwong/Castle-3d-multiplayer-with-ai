// @vitest-environment node
// src/lib/tutor/__tests__/tools.test.ts — docs/PRO_TUTOR.md §5.5 / §8.
//
// `showLine` is the only tool with real logic on the server: it turns the model's SAN
// into the from/to squares the board draws, and it is the thing that stops the tutor
// drawing an illegal line. The rejection shape matters as much as the acceptance —
// the model is told to read `reason` and try again.
import { describe, expect, test } from "vitest";
import { createTutorTools, validateLine } from "../tools";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
// 1. e4 e5 2. Nf3 Nc6 3. Bc4 — the Italian, black to move.
const ITALIAN = "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 5 3";

describe("validateLine", () => {
  test("a legal line comes back as steps with from/to and the canonical SAN", () => {
    const result = validateLine(START, ["e4", "e5", "Nf3"]);

    expect(result).toEqual({
      ok: true,
      steps: [
        { from: "e2", to: "e4", san: "e4" },
        { from: "e7", to: "e5", san: "e5" },
        { from: "g1", to: "f3", san: "Nf3" },
      ],
    });
  });

  test("it plays from the position in view, not from the start", () => {
    const result = validateLine(ITALIAN, ["Nf6", "Ng5", "d5"]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steps.map((step) => `${step.from}${step.to}`)).toEqual([
      "g8f6",
      "f3g5",
      "d7d5",
    ]);
  });

  test("a single legal move is a line, and so is a twelve-move line", () => {
    expect(validateLine(START, ["d4"]).ok).toBe(true);
    expect(
      validateLine(START, [
        "e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6", "O-O", "Be7", "Re1", "b5",
      ]).ok,
    ).toBe(true);
  });

  test("an illegal move names the step and says how far the line was legal", () => {
    // 1. e4 e5 2. Qh5 and then Kd7 — the king's own pawn is on d7.
    const result = validateLine(START, ["e4", "e5", "Qh5", "Kd7", "Qxf7#"]);

    expect(result).toEqual({
      ok: false,
      reason: "Kd7 is not legal at step 4 from this position.",
      // Three moves stood up; the drawing may show those.
      legalUpTo: 3,
    });
  });

  test("the very first move being illegal reports legalUpTo 0", () => {
    // Black's move in a position where white is to play.
    expect(validateLine(START, ["Nf6"])).toEqual({
      ok: false,
      reason: "Nf6 is not legal at step 1 from this position.",
      legalUpTo: 0,
    });
  });

  test("gibberish is a rejection, never a throw", () => {
    expect(validateLine(START, ["banana"])).toMatchObject({ ok: false, legalUpTo: 0 });
    expect(validateLine(START, ["e4", ""])).toMatchObject({ ok: false, legalUpTo: 1 });
  });

  test("an unreadable position is reported, not thrown", () => {
    expect(validateLine("not a fen", ["e4"])).toEqual({
      ok: false,
      reason: "The position could not be read.",
      legalUpTo: 0,
    });
  });
});

describe("createTutorTools", () => {
  test("the three drawing tools execute on the server; requestAnalysis does not", () => {
    const tools = createTutorTools({ fen: START });

    expect(typeof tools.highlightSquares.execute).toBe("function");
    expect(typeof tools.drawArrows.execute).toBe("function");
    expect(typeof tools.showLine.execute).toBe("function");
    // No `execute` is what forwards the call to the player's browser, where
    // Stockfish runs. If this ever gains one, the tutor stops asking the engine.
    expect(tools.requestAnalysis.execute).toBeUndefined();
  });

  test("showLine validates against the FEN the tools were built with", async () => {
    const tools = createTutorTools({ fen: ITALIAN });

    expect(await tools.showLine.execute?.({ san: ["Nf6"] }, toolCallOptions())).toMatchObject({
      ok: true,
    });
    // Legal from the start position, illegal here.
    expect(await tools.showLine.execute?.({ san: ["e4"] }, toolCallOptions())).toMatchObject({
      ok: false,
      legalUpTo: 0,
    });
  });

  test("the drawing tools answer immediately so the tool loop continues", async () => {
    const tools = createTutorTools({ fen: START });

    expect(
      await tools.highlightSquares.execute?.(
        { squares: ["d5", "f7"], tone: "threat" },
        toolCallOptions(),
      ),
    ).toEqual({ ok: true, count: 2 });
    expect(
      await tools.drawArrows.execute?.(
        { arrows: [{ from: "e4", to: "d5", tone: "idea" }] },
        toolCallOptions(),
      ),
    ).toEqual({ ok: true, count: 1 });
  });
});

/** The AI SDK passes a second argument to `execute`; none of these tools read it. */
function toolCallOptions() {
  return { toolCallId: "call_1", messages: [] } as unknown as Parameters<
    NonNullable<ReturnType<typeof createTutorTools>["showLine"]["execute"]>
  >[1];
}
