"use client";
// src/components/landing/use-showcase-game.ts  [U1]
// The landing hero's position stream (UI_REDESIGN §1.4): Morphy vs Duke Karl and
// Count Isouard, Paris 1858 — "the Opera Game" — replayed one move every 1.8 s,
// looping with a 3 s pause on the mate.
//
// The game is public domain; the SAN below is validated by chess.js the first time
// the hook renders (an illegal move throws out of `buildFrames`, and
// `__tests__/showcase-game.test.ts` catches that in CI instead of in a visitor's
// browser). Every frame is built once, so the 1.8 s tick is a pure array lookup plus
// one `derivePieces` step — no engine work on the timer.
import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import { checkSquareOf } from "@/lib/chess";
import {
  EMPTY_PIECE_TRACKER_STATE,
  derivePieces,
  type PieceTrackerState,
} from "@/lib/piece-tracker";
import { useReducedMotion } from "@/lib/ui";
import type {
  BoardPiece,
  CapturedPieces,
  Colour,
  LastMove,
  PieceSymbol,
  PromotionPiece,
  SquareId,
} from "@/lib/types";

/** UI_REDESIGN §1.4, verbatim. 33 half-moves ending in 30... Rd8#. */
export const OPERA_GAME_SAN: readonly string[] = [
  "e4", "e5", "Nf3", "d6", "d4", "Bg4", "dxe5", "Bxf3", "Qxf3", "dxe5", "Bc4", "Nf6",
  "Qb3", "Qe7", "Nc3", "c6", "Bg5", "b5", "Nxb5", "cxb5", "Bxb5+", "Nbd7", "O-O-O",
  "Rd8", "Rxd7", "Rxd7", "Rd1", "Qe6", "Bxd7+", "Nxd7", "Qb8+", "Nxb8", "Rd8#",
];

/** One move per 1.8 s (§1.4). */
export const MOVE_INTERVAL_MS = 1800;
/** …then hold the mate for 3 s before starting again. */
export const LOOP_PAUSE_MS = 3000;

export const SHOWCASE_CAPTION =
  "Now playing · Morphy vs Duke Karl & Count Isouard · Paris, 1858";

/** Everything the board needs for one position of the replay. */
interface Frame {
  ply: number;
  fen: string;
  /** SAN of the move that produced this frame; null at ply 0. */
  san: string | null;
  lastMove: LastMove | null;
  turn: Colour;
  checkSquare: SquareId | null;
  captured: CapturedPieces;
}

const START_CAPTURED: CapturedPieces = { w: [], b: [] };

/**
 * Replay the game once and snapshot every position. Throws on an illegal SAN,
 * which is a bug in the constant above and nothing else.
 */
function buildFrames(moves: readonly string[]): Frame[] {
  const chess = new Chess();
  const frames: Frame[] = [
    {
      ply: 0,
      fen: chess.fen(),
      san: null,
      lastMove: null,
      turn: "w",
      checkSquare: null,
      captured: START_CAPTURED,
    },
  ];

  // Keyed by the CAPTURING colour, like `capturedFromMoves` (FR-16).
  const taken: { w: PieceSymbol[]; b: PieceSymbol[] } = { w: [], b: [] };

  moves.forEach((san, index) => {
    const move = chess.move(san);
    if (move.captured) taken[move.color].push(move.captured as PieceSymbol);
    const fen = chess.fen();
    frames.push({
      ply: index + 1,
      fen,
      san: move.san,
      lastMove: {
        from: move.from as SquareId,
        to: move.to as SquareId,
        san: move.san,
        colour: move.color,
        captured: move.captured as PieceSymbol | undefined,
        // The one capture whose victim is not on the destination square.
        capturedSquare: move.isEnPassant()
          ? (`${move.to[0]}${move.from[1]}` as SquareId)
          : undefined,
        promotion: move.promotion as PromotionPiece | undefined,
      },
      turn: chess.turn(),
      checkSquare: checkSquareOf(fen),
      captured: { w: [...taken.w], b: [...taken.b] },
    });
  });

  return frames;
}

interface ReplayState {
  ply: number;
  tracker: PieceTrackerState;
}

/**
 * Advance (or restart) the tracker. `restart` throws the ids away so the loop back
 * to the start position is a cut, not 32 pieces sliding home at once.
 */
function stateAt(previous: PieceTrackerState, frames: Frame[], ply: number, restart: boolean): ReplayState {
  const frame = frames[ply]!;
  const base = restart ? EMPTY_PIECE_TRACKER_STATE : previous;
  return {
    ply,
    tracker: derivePieces(base, frame.fen, ply, (at) => frames[at]?.lastMove ?? null),
  };
}

export interface ShowcaseGame {
  fen: string;
  /** Stable piece ids, so both boards slide rather than pop (FR-17). */
  position: BoardPiece[];
  lastMove: LastMove | null;
  turn: Colour;
  checkSquare: SquareId | null;
  captured: CapturedPieces;
  /** Half-moves played so far, 0 … 33. */
  ply: number;
  /** The whole game, for the notation strip; `ply` says how much has landed. */
  moves: readonly string[];
  /** True on the mate (and always, under reduced motion). */
  atEnd: boolean;
  /** True when the replay is not running: reduced motion, or paused offscreen. */
  paused: boolean;
}

export interface UseShowcaseGameOptions {
  /**
   * Stop the clock — the hero is offscreen or the tab is hidden. The position
   * stays where it was; the next tick resumes from there.
   */
  paused?: boolean;
}

/**
 * The Opera Game, playing itself. Under `prefers-reduced-motion` it does not run
 * at all: the hook returns the final position (mate) and nothing ever moves (§1.3).
 */
export function useShowcaseGame({ paused = false }: UseShowcaseGameOptions = {}): ShowcaseGame {
  const reducedMotion = useReducedMotion();
  const frames = useMemo(() => buildFrames(OPERA_GAME_SAN), []);
  const lastPly = frames.length - 1;

  const [replay, setReplay] = useState<ReplayState>(() =>
    stateAt(EMPTY_PIECE_TRACKER_STATE, frames, 0, true),
  );

  // Reduced motion renders the finished game instead of the live replay. Derived in
  // render (not an effect) so the switch cannot flash the opening position first.
  const finished = useMemo(
    () => stateAt(EMPTY_PIECE_TRACKER_STATE, frames, lastPly, true),
    [frames, lastPly],
  );

  const stopped = reducedMotion || paused;
  const active = reducedMotion ? finished : replay;

  useEffect(() => {
    if (stopped) return;
    const atEnd = replay.ply >= lastPly;
    const id = window.setTimeout(
      () =>
        setReplay((current) => {
          const next = current.ply >= lastPly ? 0 : current.ply + 1;
          return stateAt(current.tracker, frames, next, next === 0);
        }),
      atEnd ? LOOP_PAUSE_MS : MOVE_INTERVAL_MS,
    );
    return () => window.clearTimeout(id);
  }, [stopped, replay, lastPly, frames]);

  const frame = frames[active.ply]!;
  return {
    fen: frame.fen,
    position: active.tracker.pieces,
    lastMove: frame.lastMove,
    turn: frame.turn,
    checkSquare: frame.checkSquare,
    captured: frame.captured,
    ply: active.ply,
    moves: OPERA_GAME_SAN,
    atEnd: active.ply >= lastPly,
    paused: stopped,
  };
}
