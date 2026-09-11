// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  vBoardView,
  vColour,
  vCommentarySource,
  vDifficulty,
  vEndReason,
  vGameMode,
  vGameStatus,
  vLastMove,
  vPresenceRole,
  vQualityTier,
  vRatingPool,
  vRoomColors,
  vRoomPreset,
  vWinner,
} from "./lib/validators";

export default defineSchema({
  // ---------------------------------------------------------------- players
  players: defineTable({
    clerkId: v.string(), // identity.subject, e.g. "user_2ab…"  (FR-3)
    tokenIdentifier: v.string(), // "<issuer>|<subject>" — the canonical auth key (Convex guidelines)
    username: v.string(), // identity.nickname (Clerk username, always set)
    usernameLower: v.string(), // lowercase, for case-insensitive /profile/[username] lookups
    avatarUrl: v.string(), // identity.pictureUrl

    rating: v.number(), // overall Elo, starts at 1200 (FR-48)
    ratingHuman: v.number(), // online games only  (FR-51)
    ratingAi: v.number(), // vs-AI games only     (FR-51)
    wins: v.number(),
    losses: v.number(),
    draws: v.number(),

    roomPreset: vRoomPreset, // FR-21l
    roomColors: v.optional(vRoomColors), // FR-21j
    roomImageStorageId: v.optional(v.id("_storage")), // FR-21k stretch
    boardFlipEnabled: v.boolean(), // FR-21e
    boardView: vBoardView, // FR-15
    qualityTier: vQualityTier, // FR-31
    postFxEnabled: v.boolean(), // FR-29 toggle

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_clerkId", ["clerkId"])
    .index("by_tokenIdentifier", ["tokenIdentifier"])
    .index("by_usernameLower", ["usernameLower"])
    .index("by_rating", ["rating"])
    .index("by_ratingHuman", ["ratingHuman"])
    .index("by_ratingAi", ["ratingAi"]),

  // ------------------------------------------------------------------ queue
  queue: defineTable({
    playerId: v.id("players"),
    rating: v.number(), // ratingHuman snapshot at join time
    joinedAt: v.number(),
  })
    .index("by_joinedAt", ["joinedAt"])
    .index("by_playerId", ["playerId"]),

  // ------------------------------------------------------------------ games
  games: defineTable({
    whiteId: v.union(v.id("players"), v.null()), // null when the AI plays white
    blackId: v.union(v.id("players"), v.null()), // null for AI side and for "Player 2" in local mode
    mode: vGameMode,
    localPlayerTwoName: v.optional(v.string()), // FR-21a
    difficulty: v.optional(vDifficulty), // FR-39, ai mode only
    aiColor: v.optional(vColour), // ai mode only

    fen: v.string(), // FR-12
    moves: v.array(v.string()), // SAN list — the source of truth for replay/undo (FR-44)
    pgn: v.string(), // FR-47
    turn: vColour,
    lastMove: v.optional(vLastMove), // denormalised for board highlighting

    status: vGameStatus, // FR-13
    winner: v.optional(vWinner),
    endReason: v.optional(vEndReason),
    drawOffer: v.optional(vColour), // FR-31: the colour that offered

    rated: v.boolean(), // false for local, and flipped to false by the first take-back (FR-49)
    undoCount: v.number(), // FR-45
    hintsUsed: v.number(), // FR-40, max 3
    // docs/PRO_TUTOR.md §5.3: a spend guard on the tutor, capped by
    // MAX_TUTOR_TURNS_PER_GAME. Optional so every row written before the tutor
    // existed stays valid; `?? 0` is the only way it is read.
    tutorTurnsUsed: v.optional(v.number()),
    spectatorCount: v.optional(v.number()), // denormalised by the presence cron

    eveSessionId: v.optional(v.string()), // durable Eve session for this game (eve-agent.md §3.3)
    playerChatThreadId: v.optional(v.string()), // private conversation between the two online players

    createdAt: v.number(),
    lastMoveAt: v.number(),
    endedAt: v.optional(v.number()),
  })
    // `mode` leads so ai/local rows can never occupy the window listLive and the
    // abandon sweep read — an idle vs-AI game must not hide a live online one.
    .index("by_mode_and_status_and_lastMoveAt", ["mode", "status", "lastMoveAt"])
    .index("by_whiteId_and_createdAt", ["whiteId", "createdAt"])
    .index("by_blackId_and_createdAt", ["blackId", "createdAt"])
    // (owner, status): the FR-26 active-game lookup, O(1) instead of a 100-row scan.
    .index("by_whiteId_and_status", ["whiteId", "status"])
    .index("by_blackId_and_status", ["blackId", "status"]),

  // --------------------------------------------------------------- presence
  // Heartbeats and spectator tracking live here, NOT on `games`: patching the game
  // document every 15 s would push a new doc to every subscriber (both players AND
  // every spectator) and re-render the board. See §I-2.
  presence: defineTable({
    gameId: v.id("games"),
    playerId: v.id("players"),
    role: vPresenceRole,
    lastSeen: v.number(),
  })
    .index("by_gameId_and_playerId", ["gameId", "playerId"])
    .index("by_gameId_and_role", ["gameId", "role"])
    .index("by_lastSeen", ["lastSeen"]),

  // ------------------------------------------------------------- commentary
  commentary: defineTable({
    gameId: v.id("games"),
    ply: v.number(), // moves.length AFTER the AI move this comments on
    text: v.string(),
    source: vCommentarySource,
    persona: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_gameId_and_ply", ["gameId", "ply"]),

  // ---------------------------------------------------------- ratingHistory
  ratingHistory: defineTable({
    playerId: v.id("players"),
    gameId: v.id("games"),
    pool: vRatingPool,
    before: v.number(),
    after: v.number(),
    delta: v.number(),
    createdAt: v.number(),
  })
    .index("by_playerId", ["playerId"]) // _creationTime is appended automatically -> sparkline order
    .index("by_gameId", ["gameId"]),
});
