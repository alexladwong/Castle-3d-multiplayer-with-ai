// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { useTutorStore } from "@/lib/stores/tutor-store";
import type { BoardAnnotations } from "../annotations";
import { drawingHasExpired, tutorSuggestions } from "../position-context";

const notes: BoardAnnotations = { squares: [], arrows: [{ from: "g1", to: "f3", tone: "idea" }], line: [] };
beforeEach(() => useTutorStore.setState(useTutorStore.getInitialState()));

describe("drawings belong to the illustrated piece", () => {
  it("survives no move, an unrelated piece moving, and the opponent replying", () => {
    expect(drawingHasExpired(notes, [], [])).toBe(false);
    expect(drawingHasExpired(notes, [], ["e4", "e5"])).toBe(false);
  });
  it("expires when that piece moves, including to a different destination", () => {
    expect(drawingHasExpired(notes, [], ["Nf3"])).toBe(true);
    expect(drawingHasExpired(notes, [], ["Nh3"])).toBe(true);
  });
  it("cannot return when the same piece returns to its original square", () => {
    expect(drawingHasExpired(notes, [], ["Nf3", "Nf6", "Ng1", "Ng8"])).toBe(true);
  });
  it("does not mistake an arrow's destination for the illustrated piece", () => {
    const threat: BoardAnnotations = { ...notes, arrows: [{ from: "f6", to: "e4", tone: "threat" }] };
    expect(drawingHasExpired(threat, ["e4", "Nf6"], ["e4", "Nf6", "e5"])).toBe(false);
  });
  it("tracks highlight-only pieces and the first move in a line", () => {
    expect(drawingHasExpired({ squares: [{ square: "e2", tone: "idea" }], arrows: [], line: [] }, [], ["e4"])).toBe(true);
    expect(drawingHasExpired({ squares: [], arrows: [], line: [{ from: "g1", to: "f3", san: "Nf3" }] }, [], ["Nf3"])).toBe(true);
  });
  it("expires on capture and when a referenced rook moves during castling", () => {
    const pawn: BoardAnnotations = { squares: [{ square: "e4", tone: "threat" }], arrows: [], line: [] };
    expect(drawingHasExpired(pawn, ["e4", "d5", "Nf3"], ["e4", "d5", "Nf3", "dxe4"])).toBe(true);
    const origin = ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6"];
    const rook: BoardAnnotations = { squares: [{ square: "h1", tone: "idea" }], arrows: [], line: [] };
    expect(drawingHasExpired(rook, origin, [...origin, "O-O"])).toBe(true);
  });
  it("clears invalidated history after a takeback", () => {
    expect(drawingHasExpired(notes, ["e4", "e5"], ["e4"])).toBe(true);
  });
});

describe("automatic drawing lifecycle", () => {
  it("clears on a committed move and stays cleared on remount or late streaming tools", () => {
    const store = useTutorStore.getState();
    store.showAutomatic(notes, "answer-1", "game:answer-1:1", [], []);
    store.reconcileMoves(["e4", "e5"]);
    expect(useTutorStore.getState().annotations).toEqual(notes);
    store.reconcileMoves(["e4", "e5", "Nf3"]);
    expect(useTutorStore.getState().annotations).toBeNull();
    store.showAutomatic(notes, "answer-1", "game:answer-1:2", [], ["e4", "e5", "Nf3"]);
    expect(useTutorStore.getState().annotations).toBeNull();
    store.showAutomatic(notes, "answer-2", "game:answer-2:1", [], []);
    expect(useTutorStore.getState().annotations).toEqual(notes);
  });
  it("does not redraw a manually cleared answer when the panel remounts", () => {
    const store = useTutorStore.getState();
    store.showAutomatic(notes, "answer-1", "game:answer-1:1", [], []);
    store.clearAnnotations();
    store.showAutomatic(notes, "answer-1", "game:answer-1:1", [], []);
    expect(useTutorStore.getState().annotations).toBeNull();
  });
  it("discards an answer arriving after its piece has already moved", () => {
    useTutorStore.getState().showAutomatic(notes, "late", "game:late:1", [], ["Nf3"]);
    expect(useTutorStore.getState().annotations).toBeNull();
  });
});

describe("context-aware suggestions", () => {
  it("changes with the board and the side to move", () => {
    expect(tutorSuggestions([], 0, [])[0]).toBe("How should I start this game?");
    expect(tutorSuggestions(["e4"], 1, [])).toContain("What's the plan for Black here?");
    expect(tutorSuggestions(["e4", "e5"], 2, [])).toContain("What changed after e5?");
  });
  it("prioritizes check and uses the reviewed position", () => {
    const moves = ["e4", "f6", "Qh5+"];
    expect(tutorSuggestions(moves, 3, [])[0]).toBe("How should Black get out of check?");
    expect(tutorSuggestions(moves, 0, [])[0]).toBe("How should I start this game?");
  });
  it("replaces questions already submitted", () => {
    const question = "What changed after e5?";
    const result = tutorSuggestions(["e4", "e5"], 2, [{ id: "q", role: "user", parts: [{ type: "text", text: question }] }]);
    expect(result).not.toContain(question);
    expect(result).toHaveLength(4);
  });
});
