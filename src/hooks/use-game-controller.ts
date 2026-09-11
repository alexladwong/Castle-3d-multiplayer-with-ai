"use client";
// src/hooks/use-game-controller.ts  [P3]
// THE controller contract (§D.11). It is the only place that calls `api.games.*`
// mutations for a game; both boards receive `BoardViewProps` and nothing else.
// There is deliberately NO optimistic update for moves — Convex is authoritative
// (§E.3, NFR-4, §I-12).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Move } from "chess.js";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import {
  buildPgn,
  capturedFromMoves,
  checkSquareOf,
  fenAtPly,
  lastMoveAtPly,
  legalTargetsFor,
  needsPromotion,
  toHistoryRows,
} from "@/lib/chess";
import { CAMERA_FLIP_MS, DEFAULT_FEN } from "@/lib/constants";
// One map for every Convex error code, shared with the toast layer (§S1).
import { describeGameError, errorCopyFor } from "@/lib/errors";
import { seatPresetFor } from "@/lib/camera";
import { pgnFilename, pgnResult } from "@/lib/format";
import {
  EMPTY_PIECE_TRACKER_STATE,
  derivePieces,
  type PieceTrackerState,
} from "@/lib/piece-tracker";
import { useUiStore } from "@/lib/stores/ui-store";
import { useTutorStore } from "@/lib/stores/tutor-store";
import type {
  BoardPiece,
  BoardView,
  BoardViewProps,
  CapturedPieces,
  Colour,
  GameActions,
  GameController,
  GameId,
  GameView,
  LastMove,
  LegalTarget,
  MoveHistoryRow,
  PieceSymbol,
  PromotionPiece,
  PromotionPrompt,
  SquareId,
  ViewerRole,
} from "@/lib/types";
import { useReview } from "./use-review";
import { api } from "../../convex/_generated/api";

/* ------------------------------------------------------------------ helpers */

/**
 * How long the local hand-over card stays up when the player has asked for
 * reduced motion (FR-21g). Longer than the 800ms camera sweep on purpose: with no
 * movement to draw the eye, the card is the only signal that the device has
 * changed hands, so it needs long enough to be read rather than glimpsed.
 */
const HAND_OVER_STATIC_MS = 1500;

const NO_MOVES: string[] = [];
const NO_TARGETS: LegalTarget[] = [];
const EMPTY_CAPTURES: CapturedPieces = { w: [], b: [] };

/** `games.lastMove` is stored with widened string fields; narrow it for the boards. */
function toLastMove(stored: GameView["game"]["lastMove"]): LastMove | null {
  if (!stored) return null;
  return {
    from: stored.from as SquareId,
    to: stored.to as SquareId,
    san: stored.san,
    colour: stored.colour,
    captured: stored.captured as PieceSymbol | undefined,
    capturedSquare: stored.capturedSquare as SquareId | undefined,
    promotion: stored.promotion as PromotionPiece | undefined,
  };
}

/**
 * chess.js SAN parsing is case-sensitive even in permissive mode (chessjs.md §4), but
 * the move box sets `autoCapitalize="off"`, so a phone or screen-reader user types
 * "nf3", "o-o" or "e8=q" (NFR-7). Try the text verbatim first, then the one obvious
 * normalisation — never a broad search, so a typo can never become a different move.
 */
function sanCandidates(text: string): string[] {
  const castle = text.replace(/0/g, "O").replace(/[\s-]/g, "").toUpperCase();
  if (castle === "OO") return [text, "O-O"];
  if (castle === "OOO") return [text, "O-O-O"];
  // "e8=q" -> "e8=Q": chess.js rejects a lower-case promotion piece.
  const promoted = text.replace(/=([qrbn])/, (match) => match.toUpperCase());
  // "nf3" -> "Nf3". A leading file letter followed by a RANK is a pawn move ("b4",
  // "b8=Q") and must be left alone; "bb5" and "bxc6" are tried as a pawn move first.
  const capitalised = /^[nbrqk][^1-8]/.test(promoted)
    ? promoted[0].toUpperCase() + promoted.slice(1)
    : promoted;
  return [...new Set([text, promoted, capitalised])];
}

/**
 * True when the typed text NAMED the promotion piece ("b8=Q", "b8Q", "b7b8q").
 * Bare LAN ("b7b8") does not: chess.js answers it with the first generated
 * promotion — a knight — so that move has to go through the picker (FR-11).
 */
function namesPromotionPiece(text: string): boolean {
  return /[1-8][qrbnQRBN]$/.test(text.replace(/[=+#!?\s]/g, ""));
}

function seatFor(role: ViewerRole): Colour | "both" | null {
  if (role === "white") return "w";
  if (role === "black") return "b";
  if (role === "local") return "both";
  return null;
}

/* -------------------------------------------------------------- the hook */

/**
 * @param gameId  the game to subscribe to.
 * @param initialView  the server-preloaded `api.games.get` result, used for the
 *   first render only so SSR markup and the first client render agree.
 */
export function useGameController(
  gameId: GameId,
  initialView?: GameView | null,
): GameController {
  // `games.get` requires an identity, so hold the subscription until Convex has
  // validated the Clerk token; the server-preloaded value covers the gap.
  const { isAuthenticated } = useConvexAuth();
  const live = useQuery(api.games.get, isAuthenticated ? { gameId } : "skip");
  const view = live === undefined ? (initialView ?? null) : live;
  const loaded = live !== undefined || initialView !== undefined;

  const makeMove = useMutation(api.games.makeMove);
  const undoMove = useMutation(api.games.undo);
  const resignGame = useMutation(api.games.resign);
  const offerDrawMutation = useMutation(api.games.offerDraw);
  const respondDrawMutation = useMutation(api.games.respondDraw);

  const [selectedSquare, setSelectedSquare] = useState<SquareId | null>(null);
  const [promotion, setPromotion] = useState<PromotionPrompt | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orientationOverride, setOrientationOverride] = useState<Colour | null>(null);
  const [flipping, setFlipping] = useState(false);

  const reducedMotion = useUiStore((s) => s.reducedMotion);
  const boardFlipEnabled = useUiStore((s) => s.boardFlipEnabled);
  // docs/PRO_TUTOR.md §4/§6: the tutor panel WRITES this store, both boards render it
  // as props. Reading it here (and nowhere inside a board) is what keeps Board2D and
  // Board3D pure functions of `BoardViewProps`.
  const annotations = useTutorStore((s) => s.annotations);

  const game = view?.game ?? null;
  const moves = game?.moves ?? NO_MOVES;
  const totalPlies = moves.length;
  const mode = game?.mode ?? "online";
  const status = game?.status ?? "active";
  const role: ViewerRole = view?.viewerRole ?? "spectator";
  const seat = seatFor(role);

  const review = useReview(totalPlies);
  const { reviewPly, isLive, autoplay, stepped, goToPly, stepReview, setAutoplay } = review;

  /* ------------------------------------------------------------ position */

  const liveFen = game?.fen ?? DEFAULT_FEN;
  const fen = useMemo(
    () => (reviewPly === null ? liveFen : fenAtPly(moves, reviewPly)),
    [reviewPly, liveFen, moves],
  );

  const storedLastMove = game?.lastMove;
  // The move that ENDS at `ply`, or null when there is none (ply 0, or a ply that a
  // take-back has already dropped off the end of `moves`).
  const moveEndingAt = useCallback(
    (ply: number): LastMove | null => {
      if (ply <= 0 || ply > totalPlies) return null;
      if (ply === totalPlies) {
        const stored = toLastMove(storedLastMove);
        if (stored) return stored;
      }
      return lastMoveAtPly(moves, ply);
    },
    [totalPlies, storedLastMove, moves],
  );

  const renderedPly = reviewPly ?? totalPlies;
  const lastMove = useMemo(() => moveEndingAt(renderedPly), [moveEndingAt, renderedPly]);

  // One tracker state per mounted game, threaded through `useState` rather than a
  // mutable tracker instance: `derivePieces` is a PURE transition, so calling it in the
  // render body is legal under the React Compiler (`react-hooks/purity`), and a discarded
  // or replayed render can never advance the ids behind React's back (review GF-5).
  // The state is adjusted during render — the documented "derive state from props"
  // escape hatch — because the ids must be correct in the SAME commit that shows the new
  // FEN, and `derivePieces` reaches a fixed point after one step (re-deriving a state's
  // own fen/ply returns it by reference), so this settles in exactly one extra render.
  // It is given the rendered PLY, not just `lastMove`: stepping backwards through the
  // history is the transition P_k -> P_{k-1}, which `lastMove` does not describe, and
  // feeding it that move popped the piece instead of sliding it (FR-17, FR-54).
  const [trackerState, setTrackerState] = useState<PieceTrackerState>(EMPTY_PIECE_TRACKER_STATE);
  const derived = useMemo(
    () => derivePieces(trackerState, fen, renderedPly, moveEndingAt),
    [trackerState, fen, renderedPly, moveEndingAt],
  );
  if (derived !== trackerState) setTrackerState(derived);
  const position: BoardPiece[] = derived.pieces;

  const turn: Colour = useMemo(() => {
    if (reviewPly === null) return game?.turn ?? "w";
    return reviewPly % 2 === 0 ? "w" : "b";
  }, [reviewPly, game?.turn]);

  const captured = useMemo(() => {
    if (totalPlies === 0) return EMPTY_CAPTURES;
    return capturedFromMoves(reviewPly === null ? moves : moves.slice(0, reviewPly));
  }, [moves, reviewPly, totalPlies]);

  const checkSquare = useMemo(() => checkSquareOf(fen), [fen]);
  const history: MoveHistoryRow[] = useMemo(() => toHistoryRows(moves), [moves]);

  /* --------------------------------------------------------- permissions */

  const active = status === "active";
  const isMyTurn = seat === "both" || (seat !== null && seat === (game?.turn ?? "w"));
  const canMove = Boolean(game) && active && seat !== null && isMyTurn && isLive;
  // `active` is part of the test: `games.undo` refuses a finished game, because the
  // Elo, W/L/D and ratingHistory it already awarded cannot be taken back (FR-49).
  const canUndo =
    Boolean(game) &&
    active &&
    seat !== null &&
    mode !== "online" &&
    totalPlies > 0 &&
    !pending;
  const canResign = Boolean(game) && active && seat !== null;
  const drawOfferFrom: Colour | null = game?.drawOffer ?? null;
  const canOfferDraw =
    Boolean(game) && active && seat !== null && mode !== "ai" && drawOfferFrom === null;

  const interactive = canMove && !pending && !flipping;

  /* -------------------------------------------------------- orientation */

  const orientation: Colour = useMemo(() => {
    if (orientationOverride !== null) return orientationOverride;
    if (role === "white") return "w";
    if (role === "black") return "b";
    if (role === "local") return boardFlipEnabled ? (game?.turn ?? "w") : "w";
    return "w";
  }, [orientationOverride, role, boardFlipEnabled, game?.turn]);

  // Mirror the seat into the ui-store so P4's rig and P2's UI can read it.
  useEffect(() => {
    useUiStore.getState().setOrientation(orientation);
  }, [orientation]);

  // §E.6: local two-player flip. Only fires on an actual ply change, never on mount
  // and never when an unrelated dependency changes.
  const flippedPlyRef = useRef<number | null>(null);
  useEffect(() => {
    if (mode !== "local") return;
    const previous = flippedPlyRef.current;
    flippedPlyRef.current = totalPlies;
    if (previous === null || previous === totalPlies) return;
    if (!boardFlipEnabled) return;

    const nextSeat = totalPlies % 2 === 0 ? "w" : "b";
    useUiStore.getState().setCameraPreset(seatPresetFor(nextSeat));

    // A manual flip is a one-off; the automatic hand-over takes the seat back.
    const raf = requestAnimationFrame(() => {
      setOrientationOverride(null);
      setFlipping(true);
    });
    // FR-21g takes the MOTION away, not the message: reduced motion still gets the
    // hand-over card, held statically for HAND_OVER_STATIC_MS instead of riding
    // the camera's 800ms sweep. Without this the one player who cannot watch the
    // board turn around was also the one never told the device had changed hands.
    const timer = setTimeout(
      () => setFlipping(false),
      reducedMotion ? HAND_OVER_STATIC_MS : CAMERA_FLIP_MS,
    );
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      setFlipping(false);
    };
  }, [mode, totalPlies, boardFlipEnabled, reducedMotion]);

  /* ------------------------------------------------------------- targets */

  const legalTargets = useMemo(() => {
    if (selectedSquare === null || !interactive) return NO_TARGETS;
    return legalTargetsFor(fen, selectedSquare);
  }, [selectedSquare, interactive, fen]);

  /* ------------------------------------------------------------- actions */

  const run = useCallback(async (fn: () => Promise<unknown>): Promise<boolean> => {
    setPending(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (caught) {
      const message = describeGameError(caught);
      setError(message);
      setSelectedSquare(null);
      toast.error(message);
      return false;
    } finally {
      setPending(false);
    }
  }, []);

  const deselect = useCallback(() => {
    setSelectedSquare(null);
    setPromotion(null);
  }, []);

  const move = useCallback(
    async (from: SquareId, to: SquareId, promotionPiece?: PromotionPiece) => {
      if (!canMove || pending) return;
      if (promotionPiece === undefined && needsPromotion(fen, from, to)) {
        setPromotion({ from, to, colour: turn }); // FR-11: nothing is sent yet.
        return;
      }
      setPromotion(null);
      setSelectedSquare(null);
      await run(() =>
        makeMove({ gameId, from, to, promotion: promotionPiece }),
      );
    },
    [canMove, pending, fen, turn, run, makeMove, gameId],
  );

  const selectSquare = useCallback(
    (square: SquareId) => {
      if (!interactive) return;
      if (selectedSquare === square) {
        setSelectedSquare(null);
        return;
      }
      if (selectedSquare !== null) {
        const target = legalTargets.find((t) => t.to === square);
        if (target) {
          void move(selectedSquare, square);
          return;
        }
      }
      const piece = position.find((p) => p.square === square);
      setSelectedSquare(piece && piece.colour === turn ? square : null);
    },
    [interactive, selectedSquare, legalTargets, position, turn, move],
  );

  const choosePromotion = useCallback(
    (piece: PromotionPiece | null) => {
      const prompt = promotion;
      setPromotion(null);
      if (piece === null || prompt === null) return;
      void move(prompt.from, prompt.to, piece);
    },
    [promotion, move],
  );

  const submitSan = useCallback(
    async (san: string) => {
      const text = san.trim();
      if (text.length === 0) return;
      if (!canMove) {
        const message = isLive ? "It is not your turn." : "Return to live play first.";
        setError(message);
        toast.error(message);
        return;
      }
      let parsed: Move | undefined;
      for (const candidate of sanCandidates(text)) {
        try {
          // Permissive parser: accepts SAN and LAN ("e2e4"), rejects everything else.
          parsed = new Chess(fen).move(candidate);
          break;
        } catch {
          // Not this spelling — fall through to the next candidate.
        }
      }
      if (parsed === undefined) {
        const message = `"${text}" is not a legal move here.`;
        setError(message);
        toast.error(message);
        return;
      }
      // FR-11: only forward a promotion the player actually asked for. Bare LAN
      // ("b7b8") parses as a KNIGHT promotion, so drop it and let `move()` open the
      // picker instead of silently under-promoting.
      await move(
        parsed.from as SquareId,
        parsed.to as SquareId,
        namesPromotionPiece(text)
          ? (parsed.promotion as PromotionPiece | undefined)
          : undefined,
      );
    },
    [canMove, isLive, fen, move],
  );

  const undo = useCallback(
    async (toPly?: number) => {
      if (!canUndo) return;
      // FR-43: AI games rewind a full turn, local games a single half-move (FR-21f).
      const fallback = mode === "local" ? totalPlies - 1 : Math.max(0, totalPlies - 2);
      const target = Math.max(0, Math.min(toPly ?? fallback, totalPlies - 1));
      const ok = await run(() => undoMove({ gameId, toPly: target }));
      if (ok) {
        goToPly(null);
        setSelectedSquare(null);
        // §E.5.7: the position jumps, ids are re-derived from scratch.
        setTrackerState(EMPTY_PIECE_TRACKER_STATE);
      }
    },
    [canUndo, mode, totalPlies, run, undoMove, gameId, goToPly],
  );

  const resign = useCallback(async () => {
    if (!canResign) return;
    await run(() => resignGame({ gameId }));
  }, [canResign, run, resignGame, gameId]);

  const offerDraw = useCallback(async () => {
    if (!canOfferDraw) return;
    await run(() => offerDrawMutation({ gameId }));
  }, [canOfferDraw, run, offerDrawMutation, gameId]);

  const respondDraw = useCallback(
    async (accept: boolean) => {
      if (drawOfferFrom === null) return;
      await run(() => respondDrawMutation({ gameId, accept }));
    },
    [drawOfferFrom, run, respondDrawMutation, gameId],
  );

  const setBoardView = useCallback((next: BoardView) => {
    useUiStore.getState().setBoardView(next);
  }, []);

  const setOrientation = useCallback((colour: Colour) => {
    setOrientationOverride(colour);
    useUiStore.getState().setCameraPreset(seatPresetFor(colour));
  }, []);

  /* ----------------------------------------------------------------- PGN */

  const whiteName = view?.whiteName ?? "White";
  const blackName = view?.blackName ?? "Black";
  const createdAt = game?.createdAt ?? 0;
  const winner = game?.winner;
  // Built on demand: a PGN is a full SAN replay and nothing renders it.
  const toPgn = useCallback(
    () =>
      buildPgn(moves, {
        white: whiteName,
        black: blackName,
        result: pgnResult(status, winner),
        date: new Date(createdAt),
      }),
    [moves, whiteName, blackName, status, winner, createdAt],
  );

  const copyPgn = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(toPgn());
      toast.success("PGN copied to clipboard");
    } catch {
      toast.error("Could not copy the PGN — your browser blocked clipboard access.");
    }
  }, [toPgn]);

  const downloadPgn = useCallback(() => {
    const blob = new Blob([toPgn()], { type: "application/x-chess-pgn" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = pgnFilename(whiteName, blackName, createdAt);
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }, [toPgn, whiteName, blackName, createdAt]);

  /* -------------------------------------------------------------- output */

  const turnLabel = useMemo(() => {
    if (!game) return "";
    if (!active) return "Game over";
    const sideName = game.turn === "w" ? whiteName : blackName;
    if (seat !== null && seat !== "both" && seat === game.turn) return "You";
    return sideName;
  }, [game, active, whiteName, blackName, seat]);

  const board: BoardViewProps = {
    fen,
    position,
    orientation,
    turn,
    interactive,
    // §E.8.6: a review jump of more than one ply is not animated. Live play always
    // is — `stepped` describes the last review navigation, not the last move.
    animate: !reducedMotion && !flipping && (reviewPly === null || stepped),
    selectedSquare,
    legalTargets,
    lastMove,
    checkSquare,
    captured,
    promotion,
    reviewPly,
    annotations,
    onSquareSelect: selectSquare,
    onMove: (from, to) => {
      void move(from, to);
    },
    onPromotionChoice: choosePromotion,
    onDeselect: deselect,
  };

  const actions: GameActions = {
    selectSquare,
    deselect,
    move,
    choosePromotion,
    submitSan,
    undo,
    resign,
    offerDraw,
    respondDraw,
    goToPly,
    stepReview,
    setAutoplay,
    setBoardView,
    setOrientation,
    copyPgn,
    downloadPgn,
  };

  return {
    ready: loaded && view !== null,
    error: loaded && view === null ? errorCopyFor("game-not-found", "game") : error,
    view,
    role,
    board,
    history,
    reviewPly,
    isLive,
    autoplay,
    pending,
    canMove,
    canUndo,
    canResign,
    canOfferDraw,
    drawOfferFrom,
    flipping,
    turnLabel,
    actions,
  };
}
