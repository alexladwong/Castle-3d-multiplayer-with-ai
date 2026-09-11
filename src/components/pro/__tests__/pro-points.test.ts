// src/components/pro/__tests__/pro-points.test.ts
// /pro claims three things about three positions. These assertions are the claims.
import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { PRO_POINTS } from "@/components/pro/pro-points";

/** The same position with the other side to move — for asking "what is threatened". */
function withTurn(fen: string, turn: "w" | "b"): Chess {
  const parts = fen.split(" ");
  parts[1] = turn;
  // A side-to-move flip can leave an en-passant target that is no longer reachable.
  parts[3] = "-";
  return new Chess(parts.join(" "));
}

describe("/pro diagrams", () => {
  it("prints three positions that are legal chess", () => {
    expect(PRO_POINTS).toHaveLength(3);
    for (const point of PRO_POINTS) {
      expect(() => new Chess(point.diagram.fen)).not.toThrow();
    }
  });

  it("marks squares and draws arrows from pieces that are actually there", () => {
    for (const point of PRO_POINTS) {
      const game = new Chess(point.diagram.fen);
      const arrow = point.diagram.arrow;
      if (!arrow) continue;
      expect(game.get(arrow.from), `${point.title}: nothing on ${arrow.from}`).toBeTruthy();
    }
  });

  it("is right that White has mate in one after 3...Nf6", () => {
    const point = PRO_POINTS[0]!;
    const game = new Chess(point.diagram.fen);
    expect(game.turn()).toBe("w");
    // The mistake the diagram tints is the knight that just moved.
    expect(game.get("f6")).toMatchObject({ type: "n", color: "b" });

    const mates = game.moves({ verbose: true }).filter((move) => {
      const probe = new Chess(point.diagram.fen);
      probe.move(move.san);
      return probe.isCheckmate();
    });
    expect(mates.map((m) => m.san)).toContain("Qxf7#");
  });

  it("is right that c3 has prepared d4", () => {
    const point = PRO_POINTS[1]!;
    const game = new Chess(point.diagram.fen);
    expect(game.get("c3")).toMatchObject({ type: "p", color: "w" });
    expect(game.get("d2")).toMatchObject({ type: "p", color: "w" });
    expect(game.get("d4")).toBeFalsy();
    // The arrow is a plan, so d4 has to be playable on White's next turn.
    expect(withTurn(point.diagram.fen, "w").moves()).toContain("d4");
  });

  it("is right that the knight on g5 is looking at f7", () => {
    const point = PRO_POINTS[2]!;
    const game = new Chess(point.diagram.fen);
    expect(game.get("g5")).toMatchObject({ type: "n", color: "w" });
    expect(game.get("f7")).toMatchObject({ type: "p", color: "b" });
    expect(withTurn(point.diagram.fen, "w").moves()).toContain("Nxf7");
    // And the square the diagram tints is the one the arrow lands on.
    expect(point.diagram.squares?.map((s) => s.square)).toContain(point.diagram.arrow?.to);
  });
});
