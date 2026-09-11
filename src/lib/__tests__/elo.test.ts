// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  applyDelta,
  aiRatingDelta,
  expectedScore,
  K_AI,
  K_ONLINE,
  MIN_RATING,
  onlineRatings,
  ratingDelta,
  START_RATING,
  type Score,
} from "../elo";
import { AI_RATING, DIFFICULTIES, DIFFICULTY_ORDER } from "../difficulty";
import {
  K_AI as K_AI_CONST,
  K_ONLINE as K_ONLINE_CONST,
  MIN_RATING as MIN_RATING_CONST,
  START_RATING as START_RATING_CONST,
} from "../constants";

describe("constants", () => {
  it("matches the copies re-exported from constants.ts (§C.7)", () => {
    expect(START_RATING).toBe(1200);
    expect(K_ONLINE).toBe(32);
    expect(K_AI).toBe(16);
    expect(MIN_RATING).toBe(100);
    expect(START_RATING_CONST).toBe(START_RATING);
    expect(K_ONLINE_CONST).toBe(K_ONLINE);
    expect(K_AI_CONST).toBe(K_AI);
    expect(MIN_RATING_CONST).toBe(MIN_RATING);
  });
});

describe("expectedScore", () => {
  it("is 0.5 for equal ratings", () => {
    expect(expectedScore(1200, 1200)).toBe(0.5);
  });

  it("is symmetric: E(a,b) + E(b,a) === 1", () => {
    for (const [a, b] of [
      [1200, 1400],
      [800, 2300],
      [1000, 1005],
      [2400, 100],
    ] as const) {
      expect(expectedScore(a, b) + expectedScore(b, a)).toBeCloseTo(1, 12);
    }
  });

  it("matches the reference formula 1 / (1 + 10^((Rb-Ra)/400))", () => {
    // 400 points of advantage => 10:1 odds => 10/11
    expect(expectedScore(1600, 1200)).toBeCloseTo(10 / 11, 12);
    expect(expectedScore(1200, 1600)).toBeCloseTo(1 / 11, 12);
  });

  it("is monotonic in the rating difference", () => {
    const values = [-400, -200, 0, 200, 400].map((d) => expectedScore(1200 + d, 1200));
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });
});

describe("ratingDelta", () => {
  it("returns 0 for a draw between equal players", () => {
    expect(ratingDelta(1200, 1200, 0.5, K_ONLINE)).toBe(0);
    expect(ratingDelta(1200, 1200, 0.5, K_AI)).toBe(0);
  });

  it("awards half of K for a win between equals (K=32)", () => {
    expect(ratingDelta(1200, 1200, 1, K_ONLINE)).toBe(16);
    expect(ratingDelta(1200, 1200, 0, K_ONLINE)).toBe(-16);
  });

  it("awards half of K for a win between equals (K=16)", () => {
    expect(ratingDelta(1200, 1200, 1, K_AI)).toBe(8);
    expect(ratingDelta(1200, 1200, 0, K_AI)).toBe(-8);
  });

  it("returns an integer for every score/K combination", () => {
    const scores: Score[] = [1, 0.5, 0];
    for (const score of scores) {
      for (const k of [K_ONLINE, K_AI]) {
        for (const opponent of [100, 777, 1200, 1543, 2300]) {
          const d = ratingDelta(1234, opponent, score, k);
          expect(Number.isInteger(d)).toBe(true);
          expect(Math.abs(d)).toBeLessThanOrEqual(k);
        }
      }
    }
  });

  it("rewards an upset more than an expected win", () => {
    const upset = ratingDelta(1000, 1800, 1, K_ONLINE);
    const expected = ratingDelta(1800, 1000, 1, K_ONLINE);
    expect(upset).toBeGreaterThan(expected);
    expect(upset).toBe(32); // 32 * (1 - E) with E ≈ 0.0099 rounds to the full K
    expect(expected).toBe(0); // 32 * (1 - 0.9901) rounds to 0
  });

  it("penalises losing to a much weaker player", () => {
    expect(ratingDelta(1800, 1000, 0, K_ONLINE)).toBe(-32);
  });
});

describe("applyDelta", () => {
  it("adds the delta", () => {
    expect(applyDelta(1200, 16)).toBe(1216);
    expect(applyDelta(1200, -16)).toBe(1184);
  });

  it("floors the rating at MIN_RATING (a losing streak cannot go negative)", () => {
    expect(applyDelta(110, -32)).toBe(MIN_RATING);
    expect(applyDelta(MIN_RATING, -32)).toBe(MIN_RATING);
    expect(applyDelta(0, 0)).toBe(MIN_RATING);
  });

  it("does not clamp upwards", () => {
    expect(applyDelta(2900, 32)).toBe(2932);
  });
});

describe("onlineRatings (K = 32)", () => {
  it("is zero-sum for equal ratings", () => {
    const { whiteDelta, blackDelta } = onlineRatings(1200, 1200, "w");
    expect(whiteDelta).toBe(16);
    expect(blackDelta).toBe(-16);
    expect(whiteDelta + blackDelta).toBe(0);
  });

  it("mirrors when black wins", () => {
    const { whiteDelta, blackDelta } = onlineRatings(1200, 1200, "b");
    expect(whiteDelta).toBe(-16);
    expect(blackDelta).toBe(16);
  });

  it("moves both ratings toward each other on a draw between unequal players", () => {
    const { whiteDelta, blackDelta } = onlineRatings(1600, 1200, "draw");
    expect(whiteDelta).toBeLessThan(0);
    expect(blackDelta).toBeGreaterThan(0);
    expect(whiteDelta).toBe(-13); // 32 * (0.5 - 10/11)
    expect(blackDelta).toBe(13);
  });

  it("gives no change on a draw between equals", () => {
    expect(onlineRatings(1500, 1500, "draw")).toEqual({ whiteDelta: 0, blackDelta: 0 });
  });

  it("uses K = 32, never K = 16", () => {
    // The largest possible swing is exactly K.
    const { whiteDelta } = onlineRatings(100, 2900, "w");
    expect(whiteDelta).toBe(K_ONLINE);
  });
});

describe("aiRatingDelta (K = 16)", () => {
  it("uses the fixed AI rating per difficulty", () => {
    expect(AI_RATING).toEqual({
      beginner: 800,
      casual: 1100,
      intermediate: 1400,
      advanced: 1800,
      grandmaster: 2300,
    });
  });

  it("keeps difficulty.aiRating in sync with AI_RATING", () => {
    for (const id of DIFFICULTY_ORDER) {
      expect(DIFFICULTIES[id].aiRating).toBe(AI_RATING[id]);
    }
  });

  it("beating the beginner bot from 1200 barely moves the needle", () => {
    const delta = aiRatingDelta(1200, AI_RATING.beginner, 1);
    expect(delta).toBe(1); // 16 * (1 - 0.9068)
  });

  it("losing to the beginner bot from 1200 hurts", () => {
    expect(aiRatingDelta(1200, AI_RATING.beginner, 0)).toBe(-15);
  });

  it("beating the grandmaster bot from 1200 is a big gain", () => {
    expect(aiRatingDelta(1200, AI_RATING.grandmaster, 1)).toBe(16);
  });

  it("draws against a stronger bot gain rating", () => {
    expect(aiRatingDelta(1200, AI_RATING.advanced, 0.5)).toBeGreaterThan(0);
  });

  it("never swings by more than K_AI", () => {
    for (const id of DIFFICULTY_ORDER) {
      for (const score of [1, 0.5, 0] as Score[]) {
        expect(Math.abs(aiRatingDelta(1200, AI_RATING[id], score))).toBeLessThanOrEqual(K_AI);
      }
    }
  });

  it("matches ratingDelta with K = 16", () => {
    expect(aiRatingDelta(1350, 1400, 1)).toBe(9);
    expect(aiRatingDelta(1350, 1400, 1)).toBe(ratingDelta(1350, 1400, 1, K_AI));
  });
});

describe("a full rating run", () => {
  it("converges upward when a 1200 player keeps beating a 1400 bot", () => {
    let rating = START_RATING;
    for (let i = 0; i < 25; i++) {
      rating = applyDelta(rating, aiRatingDelta(rating, AI_RATING.intermediate, 1));
    }
    expect(rating).toBeGreaterThan(START_RATING);
    // Gains shrink as the player passes the bot's fixed rating.
    expect(aiRatingDelta(rating, AI_RATING.intermediate, 1)).toBeLessThan(
      aiRatingDelta(START_RATING, AI_RATING.intermediate, 1),
    );
  });

  it("never drops below the floor over a long losing streak", () => {
    let rating = START_RATING;
    for (let i = 0; i < 500; i++) {
      rating = applyDelta(rating, aiRatingDelta(rating, AI_RATING.grandmaster, 0));
    }
    expect(rating).toBeGreaterThanOrEqual(MIN_RATING);
  });
});
