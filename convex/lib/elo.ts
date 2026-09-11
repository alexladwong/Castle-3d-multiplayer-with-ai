// src/lib/elo.ts   (== convex/lib/elo.ts)
export const START_RATING = 1200;
export const K_ONLINE = 32;
export const K_AI = 16;
export const MIN_RATING = 100;

/** Score from white/player POV: 1 win, 0.5 draw, 0 loss. */
export type Score = 1 | 0.5 | 0;

export function expectedScore(rating: number, opponentRating: number): number {
  return 1 / (1 + Math.pow(10, (opponentRating - rating) / 400));
}

export function ratingDelta(
  rating: number,
  opponentRating: number,
  score: Score,
  k: number,
): number {
  return Math.round(k * (score - expectedScore(rating, opponentRating)));
}

export function applyDelta(rating: number, delta: number): number {
  return Math.max(MIN_RATING, rating + delta);
}

/** Result of an online game for both players in one call. */
export function onlineRatings(
  whiteRating: number,
  blackRating: number,
  winner: "w" | "b" | "draw",
): { whiteDelta: number; blackDelta: number } {
  const whiteScore: Score = winner === "w" ? 1 : winner === "draw" ? 0.5 : 0;
  const blackScore: Score = winner === "b" ? 1 : winner === "draw" ? 0.5 : 0;
  return {
    whiteDelta: ratingDelta(whiteRating, blackRating, whiteScore, K_ONLINE),
    blackDelta: ratingDelta(blackRating, whiteRating, blackScore, K_ONLINE),
  };
}

/** Result of an AI game for the human player. `aiRating` comes from AI_RATING. */
export function aiRatingDelta(
  playerRating: number,
  aiRating: number,
  playerScore: Score,
): number {
  return ratingDelta(playerRating, aiRating, playerScore, K_AI);
}
