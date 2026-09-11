// src/lib/tutor/__tests__/overlay.test.ts
// docs/PRO_TUTOR.md §8: the overlay reducer, over all seven tool-part states.
import { describe, expect, it } from "vitest";
import {
  analysisStateOf,
  annotationsForSource,
  drawingChipLabel,
  drawingsFromMessage,
  latestDrawings,
  mergeAnnotations,
} from "../overlay";
import type { TutorUIMessage } from "../tools";

type Part = TutorUIMessage["parts"][number];

function tutorSays(id: string, ...parts: Part[]): TutorUIMessage {
  return { id, role: "assistant", parts };
}

const HIGHLIGHT: Part = {
  type: "tool-highlightSquares",
  toolCallId: "c1",
  state: "output-available",
  input: { squares: ["d5", "f7"], tone: "threat" },
  output: { ok: true, count: 2 },
};

const ARROWS: Part = {
  type: "tool-drawArrows",
  toolCallId: "c2",
  state: "input-available",
  input: { arrows: [{ from: "e4", to: "d5", tone: "idea" }] },
};

const LINE: Part = {
  type: "tool-showLine",
  toolCallId: "c3",
  state: "output-available",
  input: { san: ["Nxe5", "Qh5"] },
  output: {
    ok: true,
    steps: [
      { from: "f3", to: "e5", san: "Nxe5" },
      { from: "d8", to: "h5", san: "Qh5" },
    ],
  },
};

describe("drawingsFromMessage", () => {
  it("reads squares from the tool input and names the tone on the chip", () => {
    const [drawing] = drawingsFromMessage(tutorSays("m1", HIGHLIGHT));
    expect(drawing?.label).toBe("Squares d5, f7");
    expect(drawingChipLabel(drawing!)).toBe("Squares d5, f7 · threat");
    expect(drawing?.state).toBe("drawn");
    expect(drawing?.annotations.squares).toEqual([
      { square: "d5", tone: "threat" },
      { square: "f7", tone: "threat" },
    ]);
  });

  it("draws arrows as soon as the input is available", () => {
    const [drawing] = drawingsFromMessage(tutorSays("m1", ARROWS));
    expect(drawing?.label).toBe("Arrow e4→d5");
    expect(drawing?.annotations.arrows).toEqual([{ from: "e4", to: "d5", tone: "idea" }]);
  });

  it("splits one arrow call into a chip per tone, so no chip mis-names its colour", () => {
    const drawings = drawingsFromMessage(
      tutorSays("m1", {
        type: "tool-drawArrows",
        toolCallId: "c2",
        state: "input-available",
        input: {
          arrows: [
            { from: "e4", to: "d5", tone: "idea" },
            { from: "c1", to: "h6", tone: "threat" },
          ],
        },
      }),
    );
    expect(drawings.map((d) => drawingChipLabel(d))).toEqual([
      "Arrow e4→d5 · idea",
      "Arrow c1→h6 · threat",
    ]);
    expect(drawings.map((d) => d.id)).toEqual(["m1#0:idea", "m1#0:threat"]);
  });

  it("takes the line's squares from the OUTPUT, never from the SAN input", () => {
    const [drawing] = drawingsFromMessage(tutorSays("m1", LINE));
    expect(drawing?.label).toBe("Line Nxe5 Qh5");
    expect(drawing?.annotations.line).toEqual([
      { from: "f3", to: "e5", san: "Nxe5" },
      { from: "d8", to: "h5", san: "Qh5" },
    ]);
  });

  it("holds a place for a line whose squares are not known yet", () => {
    const [drawing] = drawingsFromMessage(
      tutorSays("m1", {
        type: "tool-showLine",
        toolCallId: "c3",
        state: "input-available",
        input: { san: ["Nxe5"] },
      }),
    );
    expect(drawing?.state).toBe("pending");
    expect(drawing?.annotations.line).toEqual([]);
  });

  it("keeps an illegal line as a chip that says why nothing was drawn", () => {
    const [drawing] = drawingsFromMessage(
      tutorSays("m1", {
        type: "tool-showLine",
        toolCallId: "c3",
        state: "output-available",
        input: { san: ["Qh9"] },
        output: { ok: false, reason: "Qh9 is not legal at step 1 from this position.", legalUpTo: 0 },
      }),
    );
    expect(drawing?.state).toBe("problem");
    expect(drawing?.problem).toContain("not legal");
  });

  it("draws nothing while the input is still streaming", () => {
    expect(
      drawingsFromMessage(
        tutorSays("m1", {
          type: "tool-highlightSquares",
          toolCallId: "c1",
          state: "input-streaming",
          input: { squares: ["d"] },
        }),
      ),
    ).toEqual([]);
  });

  it("draws nothing for a call waiting on approval, or one that was denied", () => {
    const requested = drawingsFromMessage(
      tutorSays("m1", {
        type: "tool-highlightSquares",
        toolCallId: "c1",
        state: "approval-requested",
        input: { squares: ["d5"], tone: "good" },
        approval: { id: "a1" },
      }),
    );
    const denied = drawingsFromMessage(
      tutorSays("m2", {
        type: "tool-drawArrows",
        toolCallId: "c2",
        state: "output-denied",
        input: { arrows: [{ from: "e4", to: "d5", tone: "idea" }] },
        approval: { id: "a1", approved: false },
      }),
    );
    expect(requested).toEqual([]);
    expect(denied).toEqual([]);
  });

  it("turns a failed tool call into a problem chip", () => {
    const [drawing] = drawingsFromMessage(
      tutorSays("m1", {
        type: "tool-highlightSquares",
        toolCallId: "c1",
        state: "output-error",
        input: { squares: ["d5"], tone: "good" },
        errorText: "The squares could not be marked.",
      }),
    );
    expect(drawing?.state).toBe("problem");
    expect(drawing?.problem).toBe("The squares could not be marked.");
  });

  it("ignores a player's own message", () => {
    expect(
      drawingsFromMessage({ id: "u1", role: "user", parts: [{ type: "text", text: "Why?" }] }),
    ).toEqual([]);
  });
});

describe("mergeAnnotations", () => {
  it("unions squares and arrows and keeps the last line", () => {
    const drawings = drawingsFromMessage(tutorSays("m1", HIGHLIGHT, ARROWS, LINE));
    const merged = mergeAnnotations(drawings);
    expect(merged.squares).toHaveLength(2);
    expect(merged.arrows).toHaveLength(1);
    expect(merged.line).toHaveLength(2);
  });

  it("does not repeat a square two chips both marked", () => {
    const a = drawingsFromMessage(tutorSays("m1", HIGHLIGHT));
    const b = drawingsFromMessage(tutorSays("m2", HIGHLIGHT));
    expect(mergeAnnotations([...a, ...b]).squares).toHaveLength(2);
  });
});

describe("annotationsForSource", () => {
  const messages: TutorUIMessage[] = [
    { id: "u1", role: "user", parts: [{ type: "text", text: "What is the plan?" }] },
    tutorSays("m1", HIGHLIGHT, ARROWS),
  ];

  it("a message id selects everything that answer drew", () => {
    const annotations = annotationsForSource(messages, "m1");
    expect(annotations?.squares).toHaveLength(2);
    expect(annotations?.arrows).toHaveLength(1);
  });

  it("a chip id selects that one drawing", () => {
    const annotations = annotationsForSource(messages, "m1#1");
    expect(annotations?.squares).toEqual([]);
    expect(annotations?.arrows).toHaveLength(1);
  });

  it("resolves an unknown id, and null, to a clean board", () => {
    expect(annotationsForSource(messages, "gone#3")).toBeNull();
    expect(annotationsForSource(messages, null)).toBeNull();
  });
});

describe("latestDrawings", () => {
  it("finds the newest answer that actually drew something", () => {
    const messages: TutorUIMessage[] = [
      tutorSays("m1", HIGHLIGHT),
      tutorSays("m2", { type: "text", text: "Nothing to draw here." }),
    ];
    expect(latestDrawings(messages)?.messageId).toBe("m1");
    expect(latestDrawings([])).toBeNull();
  });
});

describe("analysisStateOf", () => {
  it("reports the engine while it runs, and how it ended", () => {
    expect(
      analysisStateOf(
        tutorSays("m1", {
          type: "tool-requestAnalysis",
          toolCallId: "a1",
          state: "input-available",
          input: { depth: 16, multiPv: 3 },
        }),
      ),
    ).toBe("running");

    expect(
      analysisStateOf(
        tutorSays("m1", {
          type: "tool-requestAnalysis",
          toolCallId: "a1",
          state: "output-available",
          input: { depth: 16, multiPv: 3 },
          output: { fen: "8/8/8/8/8/8/8/8 w - - 0 1", lines: [], note: "engine-busy" },
        }),
      ),
    ).toBe("engine-busy");

    expect(analysisStateOf(tutorSays("m1", HIGHLIGHT))).toBe("idle");
  });
});
