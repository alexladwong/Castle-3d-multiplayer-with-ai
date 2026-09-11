/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as commentary from "../commentary.js";
import type * as crons from "../crons.js";
import type * as games from "../games.js";
import type * as leaderboard from "../leaderboard.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_chess from "../lib/chess.js";
import type * as lib_constants from "../lib/constants.js";
import type * as lib_elo from "../lib/elo.js";
import type * as lib_games from "../lib/games.js";
import type * as lib_returns from "../lib/returns.js";
import type * as lib_validators from "../lib/validators.js";
import type * as playerChat from "../playerChat.js";
import type * as players from "../players.js";
import type * as queue from "../queue.js";
import type * as ratingHistory from "../ratingHistory.js";
import type * as seedPlayers from "../seedPlayers.js";
import type * as seedProfile from "../seedProfile.js";
import type * as stats from "../stats.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  commentary: typeof commentary;
  crons: typeof crons;
  games: typeof games;
  leaderboard: typeof leaderboard;
  "lib/auth": typeof lib_auth;
  "lib/chess": typeof lib_chess;
  "lib/constants": typeof lib_constants;
  "lib/elo": typeof lib_elo;
  "lib/games": typeof lib_games;
  "lib/returns": typeof lib_returns;
  "lib/validators": typeof lib_validators;
  playerChat: typeof playerChat;
  players: typeof players;
  queue: typeof queue;
  ratingHistory: typeof ratingHistory;
  seedPlayers: typeof seedPlayers;
  seedProfile: typeof seedProfile;
  stats: typeof stats;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
};
