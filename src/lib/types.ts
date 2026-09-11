// src/lib/types.ts
// The single source of truth for every type shared across packages.
import type { BoardAnnotations } from "./tutor/annotations";
import type { Square } from "chess.js";
import type { Doc, Id } from "../../convex/_generated/dataModel";

/* ------------------------------------------------------------------ primitives */

export type SquareId = Square; // 'a1' … 'h8' (chess.js literal union — free exhaustiveness)
export type Colour = "w" | "b";
export type PieceSymbol = "p" | "n" | "b" | "r" | "q" | "k";
export type PromotionPiece = "q" | "r" | "b" | "n";

export type BoardView = "2d" | "3d";
export type QualityTier = "auto" | "low" | "medium" | "high";
export type ResolvedQualityTier = Exclude<QualityTier, "auto">;
export type Difficulty = "beginner" | "casual" | "intermediate" | "advanced" | "grandmaster";
export type GameMode = "online" | "ai" | "local";
export type GameStatus =
  | "waiting"
  | "active"
  | "checkmate"
  | "stalemate"
  | "draw"
  | "resigned"
  | "abandoned";
export type EndReason =
  | "checkmate"
  | "stalemate"
  | "threefold"
  | "fifty-move"
  | "insufficient"
  | "agreement"
  | "resignation"
  | "abandonment";
export type Winner = "w" | "b" | "draw";
export type RoomPresetId = "study" | "space" | "park" | "arcade" | "minimal" | "custom";
export type RoomColors = { background: string; lightSquare: string; darkSquare: string };
export type CameraPresetId = "white" | "black" | "top" | "cinematic";
export type ViewerRole = "white" | "black" | "local" | "spectator";
export type RatingPool = "human" | "ai";
export type LeaderboardFilter = "all" | "human" | "ai";

/* ------------------------------------------------------- Convex document types */

export type PlayerDoc = Doc<"players">;
export type GameDoc = Doc<"games">;
export type CommentaryDoc = Doc<"commentary">;
export type RatingHistoryDoc = Doc<"ratingHistory">;
export type PlayerId = Id<"players">;
export type GameId = Id<"games">;

/** Public projection of another player — everything `players.getByUsername` and
 *  `games.get` are allowed to expose. Never widen this to `PlayerDoc`. */
export interface PlayerSummary {
  _id: PlayerId;
  username: string;
  avatarUrl: string;
  rating: number;
}

export interface PlayerProfile extends PlayerSummary {
  ratingHuman: number;
  ratingAi: number;
  wins: number;
  losses: number;
  draws: number;
  createdAt: number;
}

/** Exactly what `api.games.get` returns. `useGameController` consumes only this. */
export interface GameView {
  game: GameDoc;
  white: PlayerSummary | null;
  black: PlayerSummary | null;
  /** Display name for a side, resolving the AI persona and the local "Player 2". */
  whiteName: string;
  blackName: string;
  viewerRole: ViewerRole;
}

export interface GameSummary {
  _id: GameId;
  mode: GameMode;
  difficulty?: Difficulty;
  status: GameStatus;
  winner?: Winner;
  opponentName: string;
  opponentAvatarUrl: string | null;
  myColour: Colour | null;
  moveCount: number;
  undoCount: number;
  rated: boolean;
  createdAt: number;
  endedAt?: number;
}

export interface LiveGameSummary {
  _id: GameId;
  whiteName: string;
  blackName: string;
  whiteRating: number;
  blackRating: number;
  moveCount: number;
  spectatorCount: number;
  lastMoveAt: number;
}

export interface LeaderboardRow {
  rank: number;
  playerId: PlayerId;
  username: string;
  avatarUrl: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface PlayerSettings {
  boardView: BoardView;
  roomPreset: RoomPresetId;
  roomColors: RoomColors | null;
  boardFlipEnabled: boolean;
  qualityTier: QualityTier;
  postFxEnabled: boolean;
}

/* ------------------------------------------------------------- board contracts */

/** One piece on the board. `id` is stable across positions (see PieceTracker) so
 *  both Board2D and Board3D can animate the same piece object between squares. */
export interface BoardPiece {
  id: string;
  square: SquareId;
  type: PieceSymbol;
  colour: Colour;
}

export interface LegalTarget {
  to: SquareId;
  isCapture: boolean;
  isPromotion: boolean;
  isCastle: boolean;
  isEnPassant: boolean;
}

export interface LastMove {
  from: SquareId;
  to: SquareId;
  san: string;
  colour: Colour;
  captured?: PieceSymbol;
  /** Where the captured piece actually stood. Only set when it differs from `to`, i.e.
   *  en passant — the pawn taken sits one rank behind the destination (FR-17). */
  capturedSquare?: SquareId;
  promotion?: PromotionPiece;
}

export interface PromotionPrompt {
  from: SquareId;
  to: SquareId;
  colour: Colour;
}

export interface CapturedPieces {
  /** Pieces captured BY white (i.e. black pieces). */
  w: PieceSymbol[];
  /** Pieces captured BY black (i.e. white pieces). */
  b: PieceSymbol[];
}

export type RenderFailureReason = "webgl-unavailable" | "context-lost" | "low-end-gpu";

/**
 * THE shared board contract. `Board2D` (P3) and `Board3D` (P4) are two
 * implementations of `(props: BoardViewProps) => JSX.Element` and nothing else.
 * Neither board may call Convex, read the ui-store for game state, or own chess
 * logic — every field below is computed by `useGameController` (P3).
 */
export interface BoardViewProps {
  /** Position being rendered — live FEN, or the FEN at `reviewPly`. */
  fen: string;
  /** Same position as pieces with stable ids (drives animation). */
  position: BoardPiece[];
  /** Which colour is at the near edge / camera seat. */
  orientation: Colour;
  /** Side to move in `fen` (for turn indicators inside the board). */
  turn: Colour;
  /** False in review mode, when spectating, or while a mutation is in flight. */
  interactive: boolean;
  /** False when the user prefers reduced motion or during a camera flip (NFR-10). */
  animate: boolean;

  selectedSquare: SquareId | null;
  legalTargets: LegalTarget[];
  lastMove: LastMove | null;
  /** Square of the king in check, or null. */
  checkSquare: SquareId | null;
  captured: CapturedPieces;
  /** Non-null while the promotion picker is open (FR-11). */
  promotion: PromotionPrompt | null;
  /** null = live; a number = reviewing that ply (0-based index into moves). */
  reviewPly: number | null;
  /**
   * The tutor's drawings (docs/PRO_TUTOR.md §4): square tints, arrows and a numbered
   * candidate line. Optional and null when the board is clean; both boards render it
   * above their own highlights and below the pieces.
   */
  annotations?: BoardAnnotations | null;

  onSquareSelect(square: SquareId): void;
  onMove(from: SquareId, to: SquareId): void;
  /** `null` cancels the promotion. */
  onPromotionChoice(piece: PromotionPiece | null): void;
  onDeselect(): void;
  /** 3D only; Board2D ignores it. Tells the shell to fall back to 2D (FR-19). */
  onRenderFailure?(reason: RenderFailureReason): void;
}

/* -------------------------------------------------------- controller contract */

export interface MoveHistoryRow {
  /** 1-based full-move number. */
  number: number;
  white?: { ply: number; san: string };
  black?: { ply: number; san: string };
}

export interface GameActions {
  /** Click/tap a square: selects, re-selects, moves, or deselects. */
  selectSquare(square: SquareId): void;
  deselect(): void;
  /** Direct from→to (drag & drop, 3D raycast). Opens the promotion prompt when needed. */
  move(from: SquareId, to: SquareId, promotion?: PromotionPiece): Promise<void>;
  choosePromotion(piece: PromotionPiece | null): void;
  /** Keyboard/accessibility entry (NFR-7). Accepts SAN or LAN. */
  submitSan(san: string): Promise<void>;
  /** Take back to `toPly` (default: rewind one full turn). FR-43/44. */
  undo(toPly?: number): Promise<void>;
  resign(): Promise<void>;
  offerDraw(): Promise<void>;
  respondDraw(accept: boolean): Promise<void>;
  /** `null` returns to live play. FR-42. */
  goToPly(ply: number | null): void;
  stepReview(delta: number): void;
  setAutoplay(on: boolean): void;
  setBoardView(view: BoardView): void;
  /** Manual board flip (FR-18); local mode drives this automatically. */
  setOrientation(colour: Colour): void;
  copyPgn(): Promise<void>;
  downloadPgn(): void;
}

export interface GameController {
  ready: boolean;
  error: string | null;
  view: GameView | null;
  role: ViewerRole;
  /** Everything both boards need. Pass straight through: `<Board2D {...c.board} />`. */
  board: BoardViewProps;
  history: MoveHistoryRow[];
  reviewPly: number | null;
  isLive: boolean;
  autoplay: boolean;
  /** True while a Convex mutation for this game is in flight. */
  pending: boolean;
  canMove: boolean;
  canUndo: boolean;
  canResign: boolean;
  canOfferDraw: boolean;
  /** The colour that offered a draw, if an offer is standing. */
  drawOfferFrom: Colour | null;
  /** Local-2P: true while the camera flip animation is running; input is locked. */
  flipping: boolean;
  /** Whose move it is, as a display string ("You", "Marco", "Player 2", username). */
  turnLabel: string;
  actions: GameActions;
}

/* ------------------------------------------------------------- AI contracts */

/** One Stockfish MultiPV line, normalised for the agent. Scores are from the
 *  side-to-move's point of view (stockfish.md §5). */
export interface Candidate {
  san: string;
  uci: string;
  scoreCp: number | null;
  mateIn: number | null;
  depth: number;
  pv: string[];
}

export interface AiMoveRequest {
  gameId: string;
  fen: string;
  history: string[];
  difficulty: Difficulty;
  candidates: Candidate[];
  eveSessionId?: string;
}

export interface AiMoveResult {
  /** SAN, already validated against `fen` with chess.js by the route handler. */
  move: string;
  commentary: string;
  source: "eve" | "fallback";
  eveSessionId?: string;
  persona?: string;
}

export interface HintResult {
  san: string;
  text: string;
  source: "eve" | "fallback";
}

/** NDJSON frames streamed by POST /api/ai/move (one JSON object per line).
 *  INTEGRATION: the `status` heartbeat is mandated by the patched §E.4 step 8 but was
 *  missing from §D.2's snapshot of this union; §E.4 wins. `delta` is kept for forward
 *  compatibility only — with a per-turn `outputSchema` eve emits no text deltas. */
export type AiStreamEvent =
  | { t: "status"; d: AiPhase }
  | { t: "delta"; d: string }
  | { t: "result"; d: AiMoveResult }
  | { t: "error"; d: string };

export type AiPhase = "idle" | "engine" | "agent" | "applying";
export type EngineStatus = "idle" | "loading" | "ready" | "error";
