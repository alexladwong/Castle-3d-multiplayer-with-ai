"use client";
// src/lib/mock/game-controller.ts  [U2]
// UI_REDESIGN §8: "add src/app/dev/game/page.tsx (dev only) that renders the real
// game shell VIEW with a mocked controller."
//
// Nobody can sign in during visual QA, so this file is the whole backend: it
// builds a `GameController`-shaped object per §8 scenario, with STATEFUL stubs —
// selecting and moving really do advance a chess.js position, so the harness
// board is playable and every layout state (review, draw offer, hand-over,
// result dialog, focus) can be reached by hand.
//
// It must stay free of `convex/react` and `@clerk/*` for the same reason.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import {
  buildPgn,
  capturedFromMoves,
  checkSquareOf,
  fenAtPly,
  legalTargetsFor,
  needsPromotion,
  replay,
  toHistoryRows,
} from "@/lib/chess";
import { CAMERA_FLIP_MS, DEFAULT_FEN, REPLAY_AUTOPLAY_MS } from "@/lib/constants";
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
  BoardView,
  BoardViewProps,
  Colour,
  EndReason,
  GameActions,
  GameController,
  GameDoc,
  GameId,
  GameStatus,
  GameView,
  LastMove,
  PieceSymbol,
  PromotionPiece,
  PromotionPrompt,
  SquareId,
  ViewerRole,
  Winner,
} from "@/lib/types";
import type { MockScenario } from "./scenarios";

export {
  MOCK_SCENARIOS,
  MOCK_SCENARIO_IDS,
  isMockScenarioId,
  mockPosition,
} from "./scenarios";
export type { MockCommentaryRow, MockPosition, MockScenario, MockScenarioId } from "./scenarios";

/* ------------------------------------------------------- the mock hook */

const MOCK_GAME_ID = "mock000000000000000000000" as GameId;

function lastMoveFrom(moves: string[], ply: number): LastMove | null {
  if (ply <= 0 || ply > moves.length) return null;
  const chess = replay(moves.slice(0, ply));
  const history = chess.history({ verbose: true });
  const move = history.at(-1);
  if (move === undefined) return null;
  return {
    from: move.from as SquareId,
    to: move.to as SquareId,
    san: move.san,
    colour: move.color,
    captured: move.captured as PieceSymbol | undefined,
    promotion: move.promotion as PromotionPiece | undefined,
  };
}

function seatOf(role: ViewerRole): Colour | "both" | null {
  if (role === "white") return "w";
  if (role === "black") return "b";
  if (role === "local") return "both";
  return null;
}

/** 2026-09-10, 19:04 UTC — a stable "started at" for every harness scenario. */
const MOCK_STARTED_AT = 1_788_030_240_000;

export function useMockGameController(scenario: MockScenario): GameController {
  const [moves, setMoves] = useState<string[]>(scenario.moves);
  const [status, setStatus] = useState<GameStatus>(scenario.status);
  const [winner, setWinner] = useState<Winner | undefined>(scenario.winner);
  const [endReason, setEndReason] = useState<EndReason | undefined>(scenario.endReason);
  const [drawOfferFrom, setDrawOfferFrom] = useState<Colour | null>(scenario.drawOffer ?? null);
  const [selectedSquare, setSelectedSquare] = useState<SquareId | null>(null);
  const [promotion, setPromotion] = useState<PromotionPrompt | null>(null);
  const [orientationOverride, setOrientationOverride] = useState<Colour | null>(null);
  const [flipping, setFlipping] = useState(scenario.flipping);
  const [review, setReview] = useState<{ ply: number | null; stepped: boolean }>({
    ply: scenario.reviewPly,
    stepped: true,
  });
  const [autoplay, setAutoplayState] = useState(false);
  const [trackerState, setTrackerState] = useState<PieceTrackerState>(EMPTY_PIECE_TRACKER_STATE);

  const reducedMotion = useUiStore((s) => s.reducedMotion);
  // The tutor's drawings come from the same store the real controller reads, so the
  // harness paints them through exactly the shipped path (docs/PRO_TUTOR.md §4).
  const annotations = useTutorStore((s) => s.annotations);
  const totalPlies = moves.length;
  const seat = seatOf(scenario.viewerRole);
  const active = status === "active";

  // The hand-over card is a moment, not a mode: let go of it so the harness board
  // stays playable after the screenshot.
  useEffect(() => {
    if (!flipping) return;
    const id = setTimeout(() => setFlipping(false), CAMERA_FLIP_MS * 3);
    return () => clearTimeout(id);
  }, [flipping]);

  // FR-54 autoplay, same cadence as the real review controller.
  useEffect(() => {
    if (!autoplay) return;
    const id = setInterval(() => {
      setReview((prev) => {
        const from = prev.ply ?? totalPlies;
        const next = from + 1;
        return next >= totalPlies ? { ply: null, stepped: true } : { ply: next, stepped: true };
      });
    }, REPLAY_AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [autoplay, totalPlies]);

  const reviewPly =
    review.ply === null || review.ply >= totalPlies
      ? null
      : Math.max(0, Math.min(review.ply, totalPlies));
  const renderedPly = reviewPly ?? totalPlies;

  const fen = useMemo(
    () => (reviewPly === null ? (totalPlies === 0 ? DEFAULT_FEN : fenAtPly(moves, totalPlies)) : fenAtPly(moves, reviewPly)),
    [reviewPly, moves, totalPlies],
  );

  const moveEndingAt = useCallback((ply: number) => lastMoveFrom(moves, ply), [moves]);
  const derived = useMemo(
    () => derivePieces(trackerState, fen, renderedPly, moveEndingAt),
    [trackerState, fen, renderedPly, moveEndingAt],
  );
  if (derived !== trackerState) setTrackerState(derived);

  const turn: Colour = useMemo(() => {
    if (reviewPly === null) return totalPlies % 2 === 0 ? "w" : "b";
    return reviewPly % 2 === 0 ? "w" : "b";
  }, [reviewPly, totalPlies]);

  const orientation: Colour = useMemo(() => {
    if (orientationOverride !== null) return orientationOverride;
    if (scenario.viewerRole === "black") return "b";
    if (scenario.viewerRole === "local") return turn;
    return "w";
  }, [orientationOverride, scenario.viewerRole, turn]);

  const captured = useMemo(
    () => capturedFromMoves(reviewPly === null ? moves : moves.slice(0, reviewPly)),
    [moves, reviewPly],
  );
  const history = useMemo(() => toHistoryRows(moves), [moves]);
  const checkSquare = useMemo(() => checkSquareOf(fen), [fen]);
  const lastMove = useMemo(() => lastMoveFrom(moves, renderedPly), [moves, renderedPly]);

  const isLive = reviewPly === null;
  const isMyTurn = seat === "both" || (seat !== null && seat === turn);
  const canMove = active && seat !== null && isMyTurn && isLive && !flipping;
  const canUndo = active && seat !== null && scenario.mode !== "online" && totalPlies > 0;
  const canResign = active && seat !== null;
  const canOfferDraw =
    active && seat !== null && scenario.mode !== "ai" && drawOfferFrom === null;

  const legalTargets = useMemo(() => {
    if (selectedSquare === null || !canMove) return [];
    return legalTargetsFor(fen, selectedSquare);
  }, [selectedSquare, canMove, fen]);

  /* ------------------------------------------------------------- actions */

  // Everything is computed BEFORE any setState: a `setMoves` updater has to stay
  // pure, so the terminal-state checks cannot live inside one.
  const applyMove = useCallback(
    (from: SquareId, to: SquareId, promotionPiece?: PromotionPiece) => {
      const chess = replay(moves);
      let played;
      try {
        played = chess.move({ from, to, promotion: promotionPiece ?? "q" });
      } catch {
        return;
      }
      if (played === null) return;

      setMoves([...moves, played.san]);
      setSelectedSquare(null);
      setPromotion(null);
      setReview({ ply: null, stepped: true });
      setDrawOfferFrom(null);
      if (chess.isCheckmate()) {
        setStatus("checkmate");
        setWinner(chess.turn() === "w" ? "b" : "w");
        setEndReason("checkmate");
      } else if (chess.isStalemate()) {
        setStatus("stalemate");
        setWinner("draw");
        setEndReason("stalemate");
      } else if (chess.isDraw()) {
        setStatus("draw");
        setWinner("draw");
        setEndReason("insufficient");
      }
      if (scenario.mode === "local" && !reducedMotion) setFlipping(true);
    },
    [moves, scenario.mode, reducedMotion],
  );

  const move = useCallback(
    async (from: SquareId, to: SquareId, promotionPiece?: PromotionPiece) => {
      if (!canMove) return;
      if (promotionPiece === undefined && needsPromotion(fen, from, to)) {
        setPromotion({ from, to, colour: turn });
        return;
      }
      applyMove(from, to, promotionPiece);
    },
    [canMove, fen, turn, applyMove],
  );

  const selectSquare = useCallback(
    (square: SquareId) => {
      if (!canMove) return;
      if (selectedSquare === square) {
        setSelectedSquare(null);
        return;
      }
      if (selectedSquare !== null && legalTargets.some((t) => t.to === square)) {
        void move(selectedSquare, square);
        return;
      }
      const piece = derived.pieces.find((p) => p.square === square);
      setSelectedSquare(piece && piece.colour === turn ? square : null);
    },
    [canMove, selectedSquare, legalTargets, derived.pieces, turn, move],
  );

  const goToPly = useCallback(
    (ply: number | null) => {
      setAutoplayState(false);
      if (ply === null) {
        setReview({ ply: null, stepped: true });
        return;
      }
      setReview((prev) => {
        const from = prev.ply ?? totalPlies;
        const next = Math.max(0, Math.min(Math.round(ply), totalPlies));
        const stepped = Math.abs(next - from) <= 1;
        return next >= totalPlies ? { ply: null, stepped } : { ply: next, stepped };
      });
    },
    [totalPlies],
  );

  const toPgn = useCallback(
    () =>
      buildPgn(moves, {
        white: scenario.whiteName,
        black: scenario.blackName,
        result: pgnResult(status, winner),
        date: new Date(0),
      }),
    [moves, scenario.whiteName, scenario.blackName, status, winner],
  );

  const actions: GameActions = {
    selectSquare,
    deselect: () => {
      setSelectedSquare(null);
      setPromotion(null);
    },
    move,
    choosePromotion: (piece) => {
      const prompt = promotion;
      setPromotion(null);
      if (piece === null || prompt === null) return;
      applyMove(prompt.from, prompt.to, piece);
    },
    submitSan: async (san) => {
      const text = san.trim();
      if (text.length === 0 || !canMove) return;
      let parsed;
      try {
        parsed = new Chess(fen).move(text);
      } catch {
        return;
      }
      if (parsed === null) return;
      applyMove(parsed.from as SquareId, parsed.to as SquareId, parsed.promotion as PromotionPiece | undefined);
    },
    undo: async (toPly?: number) => {
      if (!canUndo) return;
      const fallback = scenario.mode === "local" ? totalPlies - 1 : Math.max(0, totalPlies - 2);
      const target = Math.max(0, Math.min(toPly ?? fallback, totalPlies - 1));
      setMoves((prev) => prev.slice(0, target));
      setTrackerState(EMPTY_PIECE_TRACKER_STATE);
      setReview({ ply: null, stepped: false });
      setStatus("active");
      setWinner(undefined);
      setEndReason(undefined);
    },
    resign: async () => {
      setStatus("resigned");
      setWinner(seat === "w" ? "b" : "w");
      setEndReason("resignation");
    },
    offerDraw: async () => {
      setDrawOfferFrom(seat === "both" || seat === null ? "w" : seat);
    },
    respondDraw: async (accept: boolean) => {
      setDrawOfferFrom(null);
      if (!accept) return;
      setStatus("draw");
      setWinner("draw");
      setEndReason("agreement");
    },
    goToPly,
    stepReview: (delta: number) => {
      goToPly(Math.max(0, (reviewPly ?? totalPlies) + delta));
    },
    setAutoplay: setAutoplayState,
    setBoardView: (next: BoardView) => useUiStore.getState().setBoardView(next),
    setOrientation: (colour: Colour) => {
      setOrientationOverride(colour);
      useUiStore.getState().setCameraPreset(seatPresetFor(colour));
    },
    copyPgn: async () => {
      try {
        await navigator.clipboard.writeText(toPgn());
      } catch {
        // The harness has no toast surface of its own; a blocked clipboard is fine.
      }
    },
    downloadPgn: () => {
      const blob = new Blob([toPgn()], { type: "application/x-chess-pgn" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = pgnFilename(scenario.whiteName, scenario.blackName, 0);
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    },
  };

  const game: GameDoc = {
    _id: MOCK_GAME_ID,
    _creationTime: 0,
    whiteId: scenario.white?._id ?? null,
    blackId: scenario.black?._id ?? null,
    mode: scenario.mode,
    localPlayerTwoName: scenario.mode === "local" ? scenario.blackName : undefined,
    difficulty: scenario.difficulty,
    aiColor: scenario.aiColor,
    fen,
    moves,
    pgn: "",
    turn: totalPlies % 2 === 0 ? "w" : "b",
    lastMove: lastMoveFrom(moves, totalPlies) ?? undefined,
    status,
    winner,
    endReason,
    drawOffer: drawOfferFrom ?? undefined,
    rated: scenario.rated,
    undoCount: scenario.undoCount,
    hintsUsed: scenario.hintsUsed,
    spectatorCount: scenario.spectatorCount,
    // A fixed, plausible stamp rather than 0: the Info tab formats this, and
    // "1 Jan 1970" in a design harness reads as a bug in the screen under review.
    // Fixed (not `Date.now()`) so the harness renders identically on every load
    // and a screenshot diff stays meaningful.
    createdAt: MOCK_STARTED_AT,
    lastMoveAt: MOCK_STARTED_AT,
    endedAt: active ? undefined : MOCK_STARTED_AT,
  };

  const view: GameView = {
    game,
    white: scenario.white,
    black: scenario.black,
    whiteName: scenario.whiteName,
    blackName: scenario.blackName,
    viewerRole: scenario.viewerRole,
  };

  const turnLabel = !active
    ? "Game over"
    : seat !== null && seat !== "both" && seat === game.turn
      ? "You"
      : game.turn === "w"
        ? scenario.whiteName
        : scenario.blackName;

  const board: BoardViewProps = {
    fen,
    position: derived.pieces,
    orientation,
    turn,
    interactive: canMove,
    animate: !reducedMotion && !flipping && (reviewPly === null || review.stepped),
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
    onPromotionChoice: actions.choosePromotion,
    onDeselect: actions.deselect,
  };

  return {
    ready: true,
    error: null,
    view,
    role: scenario.viewerRole,
    board,
    history,
    reviewPly,
    isLive,
    autoplay,
    pending: false,
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
