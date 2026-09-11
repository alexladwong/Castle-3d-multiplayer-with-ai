// @vitest-environment node
// src/lib/tutor/__tests__/guard.test.ts — docs/PRO_TUTOR.md §8.
//
// The tutor route's whole security surface: signed in, Pro, a game the caller can
// read, a ply that exists, a credential, and the per-game quota. Clerk's `auth()` and
// both Convex calls are mocked; nothing here touches the network.
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { GameDoc, GameView } from "@/lib/types";

const auth = vi.fn();
const fetchQuery = vi.fn();
const fetchMutation = vi.fn();
const getAuthToken = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({ auth: () => auth() }));
vi.mock("convex/nextjs", () => ({
  fetchQuery: (...args: unknown[]) => fetchQuery(...args),
  fetchMutation: (...args: unknown[]) => fetchMutation(...args),
}));
vi.mock("@/lib/convex-server", () => ({ getAuthToken: () => getAuthToken() }));

const { guardTutorRequest } = await import("../guard");

const SCHOLARS = ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"];

function gameView(overrides: Partial<GameDoc> = {}): GameView {
  const game = {
    _id: "game_1",
    _creationTime: 0,
    whiteId: "player_1",
    blackId: "player_2",
    mode: "online",
    fen: "startpos",
    moves: SCHOLARS,
    pgn: "",
    turn: "b",
    status: "checkmate",
    winner: "w",
    endReason: "checkmate",
    rated: true,
    undoCount: 0,
    hintsUsed: 0,
    createdAt: 0,
    lastMoveAt: 0,
    ...overrides,
  } as unknown as GameDoc;
  return {
    game,
    white: { _id: "player_1", username: "alice", avatarUrl: "", rating: 1420 } as GameView["white"],
    black: { _id: "player_2", username: "bob", avatarUrl: "", rating: 1380 } as GameView["black"],
    whiteName: "alice",
    blackName: "bob",
    viewerRole: "white",
  };
}

function post(body: unknown): Request {
  return new Request("http://localhost:3000/api/tutor", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  gameId: "game_1",
  ply: 4,
  messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "What's the plan here?" }] }],
};

beforeEach(() => {
  vi.clearAllMocks();
  // The happy path, which each test then breaks in exactly one place.
  auth.mockResolvedValue({ userId: "user_1", has: () => true });
  getAuthToken.mockResolvedValue("convex-token");
  fetchQuery.mockResolvedValue(gameView());
  fetchMutation.mockResolvedValue({ tutorTurnsUsed: 1, remaining: 39 });
  process.env.AI_GATEWAY_API_KEY = "test-key";
});

describe("guardTutorRequest", () => {
  test("401 when nobody is signed in, and it never reads the body or the game", async () => {
    auth.mockResolvedValue({ userId: null, has: () => false });

    expect(await guardTutorRequest(post(VALID_BODY))).toEqual({
      ok: false,
      status: 401,
      error: "unauthorized",
    });
    expect(fetchQuery).not.toHaveBeenCalled();
    expect(fetchMutation).not.toHaveBeenCalled();
  });

  test("402 pro-required without the tutor feature, and nothing is charged", async () => {
    const has = vi.fn().mockReturnValue(false);
    auth.mockResolvedValue({ userId: "user_1", has });

    expect(await guardTutorRequest(post(VALID_BODY))).toEqual({
      ok: false,
      status: 402,
      error: "pro-required",
    });
    // The feature slug is the contract with Clerk Billing; a typo here silently
    // unlocks Pro for everyone, so it is asserted rather than assumed.
    expect(has).toHaveBeenCalledWith({ feature: "tutor" });
    expect(fetchMutation).not.toHaveBeenCalled();
  });

  test("400 invalid-body for a malformed body", async () => {
    for (const body of [
      {},
      { gameId: "game_1", ply: 4 },
      { gameId: "game_1", ply: -1, messages: VALID_BODY.messages },
      { gameId: "game_1", ply: 1.5, messages: VALID_BODY.messages },
      { gameId: "", ply: 0, messages: VALID_BODY.messages },
      { gameId: "game_1", ply: 0, messages: [] },
    ]) {
      expect(await guardTutorRequest(post(body))).toMatchObject({
        status: 400,
        error: "invalid-body",
      });
    }
    expect(fetchMutation).not.toHaveBeenCalled();
  });

  test("404 when the game is gone, and 404 when the id is not an id at all", async () => {
    fetchQuery.mockResolvedValueOnce(null);
    expect(await guardTutorRequest(post(VALID_BODY))).toEqual({
      ok: false,
      status: 404,
      error: "game-not-found",
    });

    fetchQuery.mockRejectedValueOnce(new Error("Invalid ID"));
    expect(await guardTutorRequest(post(VALID_BODY))).toEqual({
      ok: false,
      status: 404,
      error: "game-not-found",
    });
    expect(fetchMutation).not.toHaveBeenCalled();
  });

  test("400 invalid-ply past the end of the game", async () => {
    expect(
      await guardTutorRequest(post({ ...VALID_BODY, ply: SCHOLARS.length + 1 })),
    ).toEqual({ ok: false, status: 400, error: "invalid-ply" });
    expect(fetchMutation).not.toHaveBeenCalled();
  });

  test("503 tutor-unavailable with no gateway credential, before any turn is spent", async () => {
    delete process.env.AI_GATEWAY_API_KEY;
    const oidc = process.env.VERCEL_OIDC_TOKEN;
    delete process.env.VERCEL_OIDC_TOKEN;

    expect(await guardTutorRequest(post(VALID_BODY))).toEqual({
      ok: false,
      status: 503,
      error: "tutor-unavailable",
    });
    expect(fetchMutation).not.toHaveBeenCalled();

    if (oidc !== undefined) process.env.VERCEL_OIDC_TOKEN = oidc;
  });

  test("429 quota once Convex refuses with tutor-limit", async () => {
    fetchMutation.mockRejectedValue(new Error("[Request ID: abc] Server Error: tutor-limit"));

    expect(await guardTutorRequest(post(VALID_BODY))).toEqual({
      ok: false,
      status: 429,
      error: "quota",
    });
  });

  test("503 tutor-unavailable when the quota mutation fails for any other reason", async () => {
    fetchMutation.mockRejectedValue(new Error("connection reset"));

    expect(await guardTutorRequest(post(VALID_BODY))).toMatchObject({
      status: 503,
      error: "tutor-unavailable",
    });
  });

  test("ok: the FEN is derived from the stored moves, not from the body", async () => {
    const result = await guardTutorRequest(post(VALID_BODY));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // After 1. e4 e5 2. Bc4 Nc6 — white to move, move 3.
    expect(result.fen).toBe(
      "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq - 2 3",
    );
    expect(result.ply).toBe(4);
    expect(result.messages).toHaveLength(1);
    expect(result.tutorTurnsUsed).toBe(1);
    expect(result.remaining).toBe(39);
  });

  test("ok: both Convex calls carry the caller's own token", async () => {
    await guardTutorRequest(post(VALID_BODY));

    expect(fetchQuery).toHaveBeenCalledWith(
      expect.anything(),
      { gameId: "game_1" },
      { token: "convex-token" },
    );
    expect(fetchMutation).toHaveBeenCalledWith(
      expect.anything(),
      { gameId: "game_1" },
      { token: "convex-token" },
    );
    expect(fetchMutation).toHaveBeenCalledTimes(1);
  });

  test("ok: ply 0 is the starting position, and a spectator is allowed", async () => {
    fetchQuery.mockResolvedValue({ ...gameView(), viewerRole: "spectator" });

    const result = await guardTutorRequest(post({ ...VALID_BODY, ply: 0 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fen).toBe(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    );
    expect(result.view.viewerRole).toBe("spectator");
  });
});
