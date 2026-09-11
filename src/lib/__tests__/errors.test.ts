// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  CONVEX_ERROR_CODES,
  DEFAULT_ERROR_MESSAGE,
  convexErrorCode,
  describeConvexError,
  describeGameError,
  errorCopyFor,
  type ConvexErrorCode,
} from "../errors";

const CONVEX_DIR = fileURLToPath(new URL("../../../convex", import.meta.url));

/** Directories inside `convex/` that are not part of the shipped function surface. */
const SKIPPED_DIRS = new Set(["_generated", "__tests__", "node_modules"]);

// Operator-only development fixtures have diagnostics rather than player-facing copy.
const INTERNAL_FIXTURES = new Set(["seedPlayers.ts", "seedProfile.ts"]);

function convexSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIPPED_DIRS.has(entry.name)) continue;
      out.push(...convexSourceFiles(join(dir, entry.name)));
    } else if (entry.name.endsWith(".ts")) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

/**
 * Every `throw new Error("code")` / `throw new ConvexError("code")` literal in the Convex
 * function surface. This is deliberately a source scan and not a hand-kept list: a code
 * added to a mutation without copy here fails the suite instead of reaching a user as
 * "Something went wrong".
 */
function thrownCodes(): Map<string, string[]> {
  const pattern = /throw new (?:Convex)?Error\(\s*"([^"]+)"\s*\)/g;
  const found = new Map<string, string[]>();
  for (const file of convexSourceFiles(CONVEX_DIR)) {
    const source = readFileSync(file, "utf8");
    if (INTERNAL_FIXTURES.has(file.slice(CONVEX_DIR.length + 1))) {
      // Fail if a fixture ever becomes a public endpoint instead of silently omitting it.
      if (!source.includes("internalMutation(") || /export\s+const\s+\w+\s*=\s*(?:mutation|query|action)\s*\(/.test(source)) {
        throw new Error("Only internal fixture functions may omit player-facing error copy.");
      }
      continue;
    }
    for (const match of source.matchAll(pattern)) {
      const code = match[1];
      const where = file.slice(CONVEX_DIR.length + 1);
      const seen = found.get(code);
      if (seen === undefined) found.set(code, [where]);
      else if (!seen.includes(where)) seen.push(where);
    }
  }
  return found;
}

describe("convex error copy completeness", () => {
  const thrown = thrownCodes();

  it("finds the codes it is supposed to scan", () => {
    // Sanity check on the scanner itself: if the regex or the path ever stops matching,
    // every other assertion in this block would pass vacuously.
    expect(thrown.size).toBeGreaterThan(15);
    expect([...thrown.keys()]).toContain("illegal-move");
    expect(thrown.get("illegal-move")).toContain("lib/chess.ts");
  });

  it("has user copy for every code thrown in convex/**", () => {
    const known = new Set<string>(CONVEX_ERROR_CODES);
    const missing = [...thrown.entries()]
      .filter(([code]) => !known.has(code))
      .map(([code, files]) => `${code} (${files.join(", ")})`);
    expect(missing).toEqual([]);
  });

  it("carries no copy for codes nothing throws", () => {
    const orphans = CONVEX_ERROR_CODES.filter((code) => !thrown.has(code));
    expect(orphans).toEqual([]);
  });

  it("gives every code a non-empty sentence on both layers", () => {
    for (const code of CONVEX_ERROR_CODES) {
      expect(errorCopyFor(code, "toast").length, code).toBeGreaterThan(0);
      expect(errorCopyFor(code, "game").length, code).toBeGreaterThan(0);
      expect(errorCopyFor(code, "toast"), code).not.toBe(DEFAULT_ERROR_MESSAGE);
    }
  });

  it("keeps every code unambiguous under substring matching", () => {
    // Matching is `raw.includes(code)`, so one code containing another would make the
    // shorter one unreachable (or, worse, win). Nothing may nest.
    for (const code of CONVEX_ERROR_CODES) {
      const nested = CONVEX_ERROR_CODES.filter((other) => other !== code && code.includes(other));
      expect(nested, code).toEqual([]);
    }
  });
});

describe("convexErrorCode", () => {
  it("digs the code out of Convex transport noise", () => {
    const raw = new Error(
      "[CONVEX M(games:makeMove)] [Request ID: 9f2c1a] Server Error\n" +
        "Uncaught Error: illegal-move\n    at handler (../convex/lib/chess.ts:91:11)",
    );
    expect(convexErrorCode(raw)).toBe("illegal-move");
  });

  it("accepts a bare code and a non-Error value", () => {
    expect(convexErrorCode(new Error("not-your-turn"))).toBe("not-your-turn");
    expect(convexErrorCode("stale-ai-move")).toBe("stale-ai-move");
  });

  it("returns null when there is no code to find", () => {
    expect(convexErrorCode(new Error("Failed to fetch"))).toBeNull();
    expect(convexErrorCode(undefined)).toBeNull();
  });
});

describe("describeConvexError (toast layer)", () => {
  // These strings are user-visible and were shipped by providers/convex-errors.ts.
  const cases: ReadonlyArray<readonly [ConvexErrorCode, string]> = [
    ["already-in-game", "You already have a game in progress. Finish or resign it first."],
    ["invalid-room-image", "That image is not usable — pick a PNG or JPEG under 5 MB."],
    ["upload-not-found", "The upload did not finish. Try picking the file again."],
    ["invalid-colour", "Those colours are not valid hex values."],
    ["hints-unavailable", "Hints are only available at Beginner and Casual."],
    ["hint-limit", "You have used all three hints in this game."],
    ["not-a-participant", "You are watching this game, not playing it."],
    ["game-not-found", "That game no longer exists."],
    ["game-not-active", "That game has already finished."],
    ["Player not provisioned", "Your profile is still being set up. Give it a second and try again."],
    ["Not authenticated", "You have been signed out. Sign in again to continue."],
  ];

  it.each(cases)("maps %s", (code, copy) => {
    expect(describeConvexError(new Error(code), "fallback")).toBe(copy);
  });

  it("uses the caller's fallback for an unknown failure", () => {
    expect(describeConvexError(new Error("ECONNRESET"), "Could not save that image.")).toBe(
      "Could not save that image.",
    );
  });

  it("falls back to the generic sentence when the caller gives none", () => {
    expect(describeConvexError(new Error("ECONNRESET"))).toBe(DEFAULT_ERROR_MESSAGE);
  });
});

describe("describeGameError (in-game layer)", () => {
  // These strings are user-visible and were shipped by useGameController's own map.
  const cases: ReadonlyArray<readonly [ConvexErrorCode, string]> = [
    ["illegal-move", "That move is not legal."],
    ["not-your-turn", "It is not your turn."],
    ["not-a-participant", "You are not playing in this game."],
    ["promotion-required", "Choose a promotion piece first."],
    ["game-not-active", "This game has already finished."],
    ["game-not-found", "That game no longer exists."],
    ["undo-not-allowed", "Take-backs are disabled in online matches."],
    ["invalid-ply", "That position is no longer part of this game."],
    ["stale-ai-move", "The position moved on — nothing was applied."],
    ["not-ai-turn", "It is not the AI's turn."],
    ["not-an-ai-game", "This is not a game against the AI."],
    ["no-draw-offer", "There is no draw offer to answer."],
    ["cannot-answer-own-offer", "You cannot answer your own draw offer."],
    ["draw-not-available", "Draws can only be agreed against another player."],
    ["hint-limit", "No hints left in this game."],
    ["hints-unavailable", "Hints are only available at Beginner and Casual."],
    ["Not authenticated", "Please sign in again."],
    ["Player not provisioned", "Your player profile is still being created."],
  ];

  it.each(cases)("maps %s", (code, copy) => {
    expect(describeGameError(new Error(code))).toBe(copy);
  });

  it("differs from the toast layer only where an override exists", () => {
    const overridden = CONVEX_ERROR_CODES.filter(
      (code) => errorCopyFor(code, "game") !== errorCopyFor(code, "toast"),
    );
    expect([...overridden].sort()).toEqual([
      "Not authenticated",
      "Player not provisioned",
      "game-not-active",
      "hint-limit",
      "not-a-participant",
    ]);
  });

  it("uses the generic sentence for an unknown failure", () => {
    expect(describeGameError(new Error("boom"))).toBe(DEFAULT_ERROR_MESSAGE);
  });
});
