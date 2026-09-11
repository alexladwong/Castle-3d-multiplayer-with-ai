// convex/lib/validators.ts
import { v } from "convex/values";

export const vColour = v.union(v.literal("w"), v.literal("b"));
export const vWinner = v.union(v.literal("w"), v.literal("b"), v.literal("draw"));
export const vBoardView = v.union(v.literal("2d"), v.literal("3d"));
export const vQualityTier = v.union(
  v.literal("auto"),
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
);
export const vDifficulty = v.union(
  v.literal("beginner"),
  v.literal("casual"),
  v.literal("intermediate"),
  v.literal("advanced"),
  v.literal("grandmaster"),
);
export const vGameMode = v.union(v.literal("online"), v.literal("ai"), v.literal("local"));
export const vGameStatus = v.union(
  v.literal("waiting"), // created, awaiting a second player (friend-invite stretch)
  v.literal("active"),
  v.literal("checkmate"),
  v.literal("stalemate"),
  v.literal("draw"),
  v.literal("resigned"),
  v.literal("abandoned"),
);
export const vEndReason = v.union(
  v.literal("checkmate"),
  v.literal("stalemate"),
  v.literal("threefold"),
  v.literal("fifty-move"),
  v.literal("insufficient"),
  v.literal("agreement"),
  v.literal("resignation"),
  v.literal("abandonment"),
);
export const vRoomPreset = v.union(
  v.literal("study"),
  v.literal("space"),
  v.literal("park"),
  v.literal("arcade"),
  v.literal("minimal"),
  v.literal("custom"),
);
export const vRoomColors = v.object({
  background: v.string(),
  lightSquare: v.string(),
  darkSquare: v.string(),
});
export const vPromotionPiece = v.union(
  v.literal("q"),
  v.literal("r"),
  v.literal("b"),
  v.literal("n"),
);
export const vLastMove = v.object({
  from: v.string(),
  to: v.string(),
  san: v.string(),
  colour: vColour,
  captured: v.optional(v.string()),
  /** Only set when the captured piece did NOT stand on `to` — i.e. en passant. */
  capturedSquare: v.optional(v.string()),
  promotion: v.optional(v.string()),
});
export const vCommentarySource = v.union(
  v.literal("eve"),
  v.literal("fallback"),
  v.literal("hint"),
);
export const vRatingPool = v.union(v.literal("human"), v.literal("ai"));
export const vPresenceRole = v.union(v.literal("w"), v.literal("b"), v.literal("spectator"));
