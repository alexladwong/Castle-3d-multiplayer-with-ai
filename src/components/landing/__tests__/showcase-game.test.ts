// @vitest-environment node
// src/components/landing/__tests__/showcase-game.test.ts  [U1]
// UI_REDESIGN §1.4 asks for the Opera Game "validated with chess.js in code". The
// hero would throw on the first render if the SAN list were wrong, so the check
// belongs in CI rather than in a visitor's browser.
import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { OPERA_GAME_SAN } from "../use-showcase-game";

describe("the Opera Game replay", () => {
  it("is a legal game that ends in checkmate", () => {
    const chess = new Chess();
    for (const san of OPERA_GAME_SAN) {
      expect(() => chess.move(san)).not.toThrow();
    }
    expect(chess.isCheckmate()).toBe(true);
    expect(chess.turn()).toBe("b"); // White mates; Black is to move and has none.
  });

  it("is the 33 half-moves of the 1858 game", () => {
    expect(OPERA_GAME_SAN).toHaveLength(33);
    expect(OPERA_GAME_SAN[0]).toBe("e4");
    expect(OPERA_GAME_SAN.at(-1)).toBe("Rd8#");
  });
});
