// @vitest-environment node
// src/lib/__tests__/difficulty.test.ts
//
// PRD §3.8 is implemented in three places that must say the same thing:
//   1. `DIFFICULTIES[*].selectionPolicy` — pushed to the agent as
//      `clientContext.selectionPolicy` (the PRIMARY chooser, /api/ai/move);
//   2. the difficulty table in `agent/instructions.md` — the agent's own copy;
//   3. `selectCandidate` — the local FALLBACK when the agent does not answer.
// When (1)/(2) drift from (3) the same difficulty plays measurably differently
// depending on whether Eve answered, which breaks FR-49's fixed AI ratings.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DIFFICULTIES, DIFFICULTY_ORDER } from "../difficulty";
import { selectCandidate } from "../engine/candidates";
import type { Candidate } from "../types";

const INSTRUCTIONS = readFileSync(new URL("../../../agent/instructions.md", import.meta.url), "utf8");

/** `| beginner | <choose> | <persona> |` -> the two cells, or null. */
function tableRow(difficulty: string): { choose: string; persona: string } | null {
  for (const line of INSTRUCTIONS.split("\n")) {
    if (!line.startsWith(`| ${difficulty} |`)) continue;
    const cells = line.split("|").map((cell) => cell.trim());
    // ["", difficulty, choose, persona, ""]
    if (cells.length < 5) return null;
    return { choose: cells[2], persona: cells[3] };
  }
  return null;
}

function candidate(san: string, scoreCp: number, mateIn: number | null = null): Candidate {
  return { san, uci: "e2e4", scoreCp, mateIn, depth: 10, pv: ["e2e4"] };
}

describe("difficulty policy", () => {
  it("states one selection policy in agent/instructions.md and DIFFICULTIES", () => {
    for (const difficulty of DIFFICULTY_ORDER) {
      const row = tableRow(difficulty);
      expect(row, `agent/instructions.md has no row for ${difficulty}`).not.toBeNull();
      expect(row?.choose).toBe(DIFFICULTIES[difficulty].selectionPolicy);
      expect(row?.persona).toContain(DIFFICULTIES[difficulty].persona.name);
    }
  });

  it("matches PRD §3.8: top 5 / top 3 / 70-30 / best move", () => {
    expect(DIFFICULTIES.beginner.selectionPolicy).toMatch(/top 5/);
    expect(DIFFICULTIES.beginner.selectionPolicy).toMatch(/non-capturing/);
    expect(DIFFICULTIES.beginner.multiPv).toBe(5);
    expect(DIFFICULTIES.casual.selectionPolicy).toMatch(/top 3/);
    expect(DIFFICULTIES.casual.multiPv).toBe(3);
    expect(DIFFICULTIES.intermediate.selectionPolicy).toMatch(/70%/);
    for (const difficulty of ["advanced", "grandmaster"] as const) {
      expect(DIFFICULTIES[difficulty].selectionPolicy).toMatch(/rank 1/);
    }
  });

  it("is the policy `selectCandidate` actually applies (agent path == fallback path)", () => {
    const list = [
      candidate("Nf3", 40),
      candidate("Nxe5", 30),
      candidate("d4", 20),
      candidate("Bc4", 10),
      candidate("g3", 0),
    ];
    const seeded = (values: number[]) => {
      let index = 0;
      return () => values[Math.min(index++, values.length - 1)];
    };

    // beginner: the whole top 5 is reachable, rank 1 included.
    const reachable = new Set<string>();
    for (const r of [0, 0.25, 0.5, 0.75, 0.99]) {
      reachable.add(selectCandidate("beginner", list, seeded([0.9, r]))?.san ?? "");
    }
    expect(reachable).toEqual(new Set(["Nf3", "Nxe5", "d4", "Bc4", "g3"]));
    // …and half the time a quiet move is preferred over the capture.
    expect(selectCandidate("beginner", list, seeded([0.2, 0.99]))?.san).toBe("g3");

    // casual: exactly the top 3.
    expect(selectCandidate("casual", list, seeded([0]))?.san).toBe("Nf3");
    expect(selectCandidate("casual", list, seeded([0.99]))?.san).toBe("d4");

    // intermediate: 70 % rank 1, otherwise rank 2.
    expect(selectCandidate("intermediate", list, seeded([0.69]))?.san).toBe("Nf3");
    expect(selectCandidate("intermediate", list, seeded([0.7]))?.san).toBe("Nxe5");

    // advanced / grandmaster: always rank 1.
    for (const difficulty of ["advanced", "grandmaster"] as const) {
      expect(selectCandidate(difficulty, list, seeded([0.99]))?.san).toBe("Nf3");
    }
  });
});
