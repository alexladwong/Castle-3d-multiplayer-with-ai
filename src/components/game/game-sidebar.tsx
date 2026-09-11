"use client";
// src/components/game/game-sidebar.tsx  [U2]
// UI_REDESIGN §5.1's right column: Chat (default in AI games) / Moves / Info.
// Pure — the chat rows, the hint state and the presence chips all arrive as props.
import { useState } from "react";
import Link from "next/link";
import {
  ChevronFirstIcon,
  ChevronLastIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CopyIcon,
  DownloadIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  SettingsIcon,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GameChat, type ChatHintState, type ChatSystemChip } from "@/components/ai/game-chat";
import { PlayerChat, type PlayerChatState } from "./player-chat";
import type { ChatCommentaryRow } from "@/components/ai/chat-model";
import { MoveList } from "@/components/ui-kit";
import { PIECE_MODEL_CREDIT } from "@/lib/constants";
import { DIFFICULTIES } from "@/lib/difficulty";
import { formatDateTime, formatMode, pluralize } from "@/lib/format";
import { resolveRoom } from "@/lib/rooms";
import { useUiStore } from "@/lib/stores/ui-store";
import { cn, focusRing } from "@/lib/ui";
import type {
  Colour,
  GameActions,
  GameMode,
  GameView,
  MoveHistoryRow,
  PlayerSummary,
} from "@/lib/types";
import { SanInput } from "./accessibility/san-input";
import { LivePositionNote } from "./game-status-pill";

export type SidebarTab = "chat" | "moves" | "info";

export interface GameSidebarProps {
  playerChat?: PlayerChatState;
  view: GameView;
  mode: GameMode;
  seat: Colour | "both" | null;
  history: MoveHistoryRow[];
  totalPlies: number;
  reviewPly: number | null;
  autoplay: boolean;
  canUndo: boolean;
  canMove: boolean;
  pending: boolean;
  actions: GameActions;
  /** Persisted commentary rows, oldest first. */
  commentary: ChatCommentaryRow[];
  systemChips: ChatSystemChip[];
  hint: ChatHintState;
  spectatorCount: number;
  onRetryEngine?(): void;
  /** Opens the Board & room drawer from the Info tab's ghost actions (§4.4). */
  onOpenRoom?(): void;
  tab: SidebarTab;
  onTabChange(tab: SidebarTab): void;
  className?: string;
}

/* ------------------------------------------------------------------- moves */

function ReplayControls({
  reviewPly,
  totalPlies,
  autoplay,
  actions,
}: {
  reviewPly: number | null;
  totalPlies: number;
  autoplay: boolean;
  actions: GameActions;
}) {
  const atStart = reviewPly === 0;
  const live = reviewPly === null;

  return (
    // §4.4: the autoplay controls sit in a 36px row. `icon-lg` is the 36px token;
    // `disabled` is honest here — a first move that does not exist yet has no
    // reason worth a tooltip, and the arrows say so by going quiet.
    <div className="flex h-9 items-center gap-1" role="group" aria-label="Replay controls">
      <Button
        size="icon-lg"
        variant="ghost"
        aria-label="First move"
        disabled={totalPlies === 0 || atStart}
        onClick={() => actions.goToPly(0)}
      >
        <ChevronFirstIcon />
      </Button>
      <Button
        size="icon-lg"
        variant="ghost"
        aria-label="Previous move"
        disabled={totalPlies === 0 || atStart}
        onClick={() => actions.stepReview(-1)}
      >
        <ChevronLeftIcon />
      </Button>
      <Button
        size="lg"
        variant={autoplay ? "secondary" : "ghost"}
        aria-pressed={autoplay}
        disabled={totalPlies === 0}
        onClick={() => actions.setAutoplay(!autoplay)}
      >
        {autoplay ? <PauseIcon aria-hidden /> : <PlayIcon aria-hidden />}
        {autoplay ? "Pause" : "Autoplay"}
      </Button>
      <Button
        size="icon-lg"
        variant="ghost"
        aria-label="Next move"
        disabled={live}
        onClick={() => actions.stepReview(1)}
      >
        <ChevronRightIcon />
      </Button>
      <Button
        size="icon-lg"
        variant="ghost"
        aria-label="Latest position"
        disabled={live}
        onClick={() => actions.goToPly(null)}
      >
        <ChevronLastIcon />
      </Button>
    </div>
  );
}

/**
 * FR-46's rewind, with the confirmation it always needed. Taking the game back to
 * move 8 DELETES every move after it — the one destructive thing on this screen,
 * and it used to fire from a hover icon on the first click.
 */
function RewindAction({
  ply,
  pending,
  onRewind,
}: {
  ply: number;
  pending: boolean;
  onRewind(): void;
}) {
  // `AlertDialogAction` is a plain Button in this shadcn port — it does not close
  // the dialog — so the open state is held here and the action closes it itself.
  const [open, setOpen] = useState(false);
  // `ply` is a half-move; players count in whole moves, and so does the status pill.
  // The SIDE is part of the button's name because both halves of a row round to the
  // same move number, and two controls that do different things cannot share a name.
  const move = Math.max(1, Math.ceil(ply / 2));
  const name = `Rewind to ${ply % 2 === 1 ? "White" : "Black"}'s move ${move}`;
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            size="icon-sm"
            variant="secondary"
            aria-label={name}
            title={name}
            disabled={pending}
          />
        }
      >
        <RotateCcwIcon />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Rewind to move {move}?</AlertDialogTitle>
          <AlertDialogDescription>Every move after it is removed.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep the game</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setOpen(false);
              onRewind();
            }}
          >
            Rewind
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function MovesTab({
  history,
  totalPlies,
  reviewPly,
  autoplay,
  canUndo,
  canMove,
  pending,
  mode,
  seat,
  actions,
}: Pick<
  GameSidebarProps,
  | "history"
  | "totalPlies"
  | "reviewPly"
  | "autoplay"
  | "canUndo"
  | "canMove"
  | "pending"
  | "mode"
  | "seat"
  | "actions"
>) {
  // FR-46: rewinding to a chosen ply only exists outside online matches.
  const rewindable = mode !== "online" && seat !== null && canUndo;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto bg-bg-sunken">
        <MoveList
          rows={history}
          currentPly={reviewPly ?? totalPlies}
          onSelect={(ply) => actions.goToPly(ply === totalPlies ? null : ply)}
          renderAction={
            rewindable
              ? (ply) => (
                  <RewindAction
                    ply={ply}
                    pending={pending}
                    onRewind={() => {
                      void actions.undo(ply);
                    }}
                  />
                )
              : undefined
          }
        />
      </div>

      <div className="flex flex-col gap-2 border-t border-border bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ReplayControls
            reviewPly={reviewPly}
            totalPlies={totalPlies}
            autoplay={autoplay}
            actions={actions}
          />
          {reviewPly === null ? <LivePositionNote /> : null}
        </div>
        {seat !== null ? (
          <SanInput
            disabled={!canMove || pending}
            disabledReason={
              pending
                ? "That move is still on its way."
                : reviewPly !== null
                  ? "You are reviewing an earlier position. Go back to live to play."
                  : "It is not your move yet."
            }
            onSubmitSan={actions.submitSan}
          />
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- info */

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="shrink-0 text-[12px] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right text-[13px] text-foreground">{children}</dd>
    </div>
  );
}

function ProfileLink({ player }: { player: PlayerSummary | null }) {
  if (player === null) return null;
  return (
    <Link
      prefetch={false}
      href={`/profile/${player.username}`}
      className={cn("rounded-sm text-primary underline-offset-2 hover:underline", focusRing)}
    >
      {player.username}
    </Link>
  );
}

function CreditLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={cn(
        "rounded-sm underline underline-offset-2 hover:text-foreground",
        focusRing,
      )}
    >
      {children}
    </a>
  );
}

function InfoTab({
  view,
  mode,
  seat,
  totalPlies,
  spectatorCount,
  actions,
  onOpenRoom,
}: Pick<
  GameSidebarProps,
  "view" | "mode" | "seat" | "totalPlies" | "spectatorCount" | "actions" | "onOpenRoom"
>) {
  const { game } = view;
  const difficulty = game.difficulty ? DIFFICULTIES[game.difficulty] : null;
  // Client state, not Convex: the sidebar stays pure enough for /dev/game.
  const roomPreset = useUiStore((s) => s.roomPreset);
  const roomColors = useUiStore((s) => s.roomColors);
  const resolvedTier = useUiStore((s) => s.resolvedTier);
  const qualityTier = useUiStore((s) => s.qualityTier);
  const room = resolveRoom(roomPreset, roomColors);

  // "Rated: Yes/No" is a database column, not an answer. The player is asking one
  // question — does this game move my rating? — so the card answers it in a
  // sentence, and says WHY when the answer is no (FR-43 unrates on a take-back).
  const ratingNote =
    mode === "local"
      ? "Local games are never rated."
      : game.undoCount > 0
        ? "Take-backs made this game unrated."
        : game.rated
          ? "This game counts toward your rating."
          : "This game does not count toward your rating.";

  // Who the VIEWER is playing, which is only knowable from their own seat: a player
  // sat as Black was previously shown their own name and their own rating here. In a
  // local game (`seat === "both"`) and for a spectator (`seat === null`) there is no
  // "opponent" to name, and the White and Black rows below already say who is playing,
  // so the row is dropped rather than guessed.
  const opponentSide: Colour | null =
    mode === "ai" ? "b" : seat === "w" ? "b" : seat === "b" ? "w" : null;
  const opponentName =
    mode === "ai"
      ? (difficulty?.persona.name ?? "The AI")
      : opponentSide === "w"
        ? view.whiteName
        : view.blackName;
  const opponentPlayer = opponentSide === "w" ? view.white : view.black;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-card p-3">
      {/* §4.4: the Info tab is a MATCH CARD — one definition list, no boxes
          inside boxes, each row a fact a player might actually ask for. */}
      <dl className="divide-y divide-border/60">
        <InfoRow label="Mode">{formatMode(game.mode)}</InfoRow>
        {opponentSide !== null || mode === "ai" ? (
          <InfoRow label="Opponent">
            <span className="font-medium">{opponentName}</span>
            {difficulty ? (
              <span className="tabular ml-1.5 font-mono text-muted-foreground">
                {difficulty.label} · {difficulty.aiRating}
              </span>
            ) : opponentPlayer ? (
              <span className="tabular ml-1.5 font-mono text-muted-foreground">
                {opponentPlayer.rating}
              </span>
            ) : null}
          </InfoRow>
        ) : null}
        <InfoRow label="White">
          <span className="font-medium">{view.whiteName}</span>
          {view.white ? (
            <span className="tabular ml-1.5 font-mono text-muted-foreground">
              {view.white.rating}
            </span>
          ) : null}
        </InfoRow>
        <InfoRow label="Black">
          <span className="font-medium">{view.blackName}</span>
          {view.black ? (
            <span className="tabular ml-1.5 font-mono text-muted-foreground">
              {view.black.rating}
            </span>
          ) : null}
        </InfoRow>
        <InfoRow label="Rating">{ratingNote}</InfoRow>
        {game.undoCount > 0 ? (
          <InfoRow label="Take-backs">
            <span className="tabular font-mono">{game.undoCount}</span>
          </InfoRow>
        ) : null}
        <InfoRow label="Room">{room.label}</InfoRow>
        <InfoRow label="Quality">
          <span className="capitalize">{resolvedTier}</span>
          {qualityTier === "auto" ? (
            <span className="ml-1.5 text-muted-foreground">chosen for you</span>
          ) : null}
        </InfoRow>
        <InfoRow label="Watching">
          {/* Host voice names the state, it does not count to zero. The nameplate's
              spectator chip already follows this rule. */}
          {spectatorCount > 0
            ? pluralize(spectatorCount, "person", "people")
            : "Nobody yet"}
        </InfoRow>
        <InfoRow label="Started">{formatDateTime(game.createdAt)}</InfoRow>
        <InfoRow label="Moves">
          <span className="tabular font-mono">{totalPlies}</span>
        </InfoRow>
        <InfoRow label="Game id">
          <span className="tabular truncate font-mono text-muted-foreground">{game._id}</span>
        </InfoRow>
        {view.white || view.black ? (
          <InfoRow label="Profiles">
            <span className="flex flex-wrap justify-end gap-2">
              <ProfileLink player={view.white} />
              <ProfileLink player={view.black} />
            </span>
          </InfoRow>
        ) : null}
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            void actions.copyPgn();
          }}
        >
          <CopyIcon aria-hidden />
          Copy game moves
        </Button>
        <Button size="sm" variant="ghost" onClick={actions.downloadPgn}>
          <DownloadIcon aria-hidden />
          Download game (.pgn)
        </Button>
        {onOpenRoom ? (
          <Button size="sm" variant="ghost" onClick={onOpenRoom}>
            <SettingsIcon aria-hidden />
            Board &amp; room settings
          </Button>
        ) : null}
      </div>

      {/* MANDATORY (§I-7): the piece models are CC BY 3.0, so this credit is a
          licence obligation — and the game screen is where people actually look at
          them. Settings keeps the long version; this is the one-line one. */}
      <p className="mt-4 border-t border-border/60 pt-3 text-[12px] leading-relaxed text-muted-foreground">
        Pieces by{" "}
        <CreditLink href={PIECE_MODEL_CREDIT.authorUrl}>Jarlan Perez via Poly Pizza</CreditLink> (
        <CreditLink href={PIECE_MODEL_CREDIT.licenseUrl}>CC BY 3.0</CreditLink>) · HDRIs from{" "}
        <CreditLink href="https://polyhaven.com">Poly Haven</CreditLink> (CC0) ·{" "}
        <CreditLink href="https://stockfishchess.org">Stockfish</CreditLink> (
        <CreditLink href="/stockfish/sf18/LICENSE-GPL-3.0.txt">GPL v3</CreditLink>)
      </p>
    </div>
  );
}

/* -------------------------------------------------------------- sheet peek */

export interface GameSheetPeekProps {
  /** Who spoke the newest line, or null when it is one of the centred system chips. */
  speaker: string | null;
  /** The persona plate's mono line ("Beginner · 800"), shown when there is room
   *  — §4.6: "the sheet peek shows the persona header line and the last bubble". */
  speakerMeta?: string | null;
  /** The newest line in the panel; null until something has been said. */
  text: string | null;
  /** What the strip offers while the panel is quiet, e.g. "Moves and game info". */
  quiet: string;
  /** The game's live truth beside the name — "your move", "to move", "watching". */
  status?: string | null;
  /** True when `status` means "happening now" (Live Green): it gets the baize dot. */
  statusLive?: boolean;
  /** How many lines have arrived since the reader last had the panel open. */
  unread?: number;
  onExpand(): void;
  className?: string;
}

/**
 * §5.3's bottom sheet, at rest.
 *
 * The sheet used to camp on 42dvh of a phone so the newest bubble stayed visible —
 * which cost the board more than the bubble was worth. This is the same promise in
 * one 44px line: who spoke and what they said, tappable to open the full panel.
 * The board keeps the screen; the conversation keeps its voice.
 */
export function GameSheetPeek({
  speaker,
  speakerMeta,
  text,
  quiet,
  status = null,
  statusLive = false,
  unread = 0,
  onExpand,
  className,
}: GameSheetPeekProps) {
  const label =
    text === null
      ? `Open the game panel — ${quiet}`
      : speaker === null
        ? `Open the game panel — ${text}`
        : `Open the game panel — ${speaker} said: ${text}`;

  return (
    <button
      type="button"
      onClick={onExpand}
      aria-label={unread === 0 ? label : `${label} (${pluralize(unread, "new line", "new lines")})`}
      className={cn(
        "flex min-h-11 w-full shrink-0 items-center gap-2 rounded-xl border border-border bg-card px-3 py-1.5 text-left",
        "transition-colors hover:bg-accent/40",
        focusRing,
        className,
      )}
    >
      {/* §4.6: "the persona header line and the last bubble" — two lines, the same
          plate the Chat tab opens with, so the peek is a compressed header rather
          than a bare name in front of a sentence. */}
      <span className="min-w-0 flex-1">
        <span aria-hidden className="flex min-w-0 items-baseline gap-1.5">
          <span className="shrink-0 text-[13px] font-medium text-foreground">
            {speaker ?? "Game panel"}
          </span>
          {speakerMeta ? (
            <span className="tabular shrink-0 truncate font-mono text-[12px] text-muted-foreground">
              {speakerMeta}
            </span>
          ) : null}
          {status ? (
            <span
              className={cn(
                "ml-auto flex shrink-0 items-center gap-1 text-[12px]",
                statusLive ? "text-live" : "text-muted-foreground",
              )}
            >
              {statusLive ? (
                <span className="size-1.5 shrink-0 rounded-full bg-current" />
              ) : null}
              {status}
            </span>
          ) : null}
        </span>
        <span
          aria-hidden
          className="mt-0.5 block truncate text-[13px] text-muted-foreground"
        >
          {text ?? quiet}
        </span>
      </span>
      {unread > 0 ? (
        <span
          aria-hidden
          className="tabular grid h-4 min-w-4 shrink-0 place-items-center rounded-full bg-primary px-1 text-[12px] leading-none font-semibold text-primary-foreground"
        >
          {unread > 9 ? "9+" : unread}
        </span>
      ) : null}
      <ChevronUpIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

/* ----------------------------------------------------------------- sidebar */

export function GameSidebar({
  playerChat,
  view,
  mode,
  seat,
  history,
  totalPlies,
  reviewPly,
  autoplay,
  canUndo,
  canMove,
  pending,
  actions,
  commentary,
  systemChips,
  hint,
  spectatorCount,
  onRetryEngine,
  onOpenRoom,
  tab,
  onTabChange,
  className,
}: GameSidebarProps) {
  const { game } = view;
  const difficulty = game.difficulty ? DIFFICULTIES[game.difficulty] : null;
  const persona = difficulty?.persona.name ?? "The AI";
  const humanColour: Colour | undefined =
    game.aiColor === undefined ? undefined : game.aiColor === "w" ? "b" : "w";
  const moverLabel =
    seat === null ? (humanColour === "w" ? view.whiteName : view.blackName) : "You";

  // §4.4's persona plate. In an online game the "persona" is the other player and
  // the mono line is their pool and rating; in a local game both seats are here.
  const opponentColour: Colour | undefined =
    mode === "ai" ? game.aiColor : seat === "w" ? "b" : seat === "b" ? "w" : undefined;
  const chatName =
    mode === "ai"
      ? persona
      : mode === "local"
        ? "This table"
        : opponentColour === "w"
          ? view.whiteName
          : view.blackName;
  const chatMeta =
    mode === "ai"
      ? difficulty
        ? `${difficulty.label} · ${difficulty.aiRating}`
        : undefined
      : mode === "local"
        ? "Same device"
        : (() => {
            const player = opponentColour === "w" ? view.white : view.black;
            return player ? `Online · ${player.rating}` : "Online";
          })();
  const finished = game.status !== "active" && game.status !== "waiting";
  const chatTurn: "you" | "opponent" | "none" =
    seat === null || finished
      ? "none"
      : seat === "both"
        ? "you"
        : game.turn === seat
          ? "you"
          : "opponent";

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => onTabChange(value as SidebarTab)}
      className={cn("flex min-h-0 flex-1 flex-col gap-0", className)}
    >
      <TabsList variant="line" className="h-10 w-full shrink-0 gap-1 border-b border-border px-2">
        <TabsTrigger value="chat">Chat</TabsTrigger>
        <TabsTrigger value="moves">Moves</TabsTrigger>
        <TabsTrigger value="info">Info</TabsTrigger>
      </TabsList>

      {/* All three panels stay mounted and visibility is driven by `tab`, not by
          Base UI's exit transition: an outgoing panel is kept in the DOM until its
          animations report finished, and with `flex` on the element that leaves the
          old tab occupying half the sidebar. Keeping them mounted also preserves the
          chat's scroll position across a tab switch. */}
      <TabsContent
        value="chat"
        keepMounted
        className={cn("min-h-0 flex-1 flex-col", tab === "chat" ? "flex" : "hidden")}
      >
        {mode === "online" && playerChat ? (
          <PlayerChat chat={playerChat} name={chatName ?? "Opponent"} meta={chatMeta} status={finished ? "over" : chatTurn === "you" ? "your-move" : "their-move"} />
        ) : <GameChat
          mode={mode}
          moves={game.moves}
          commentary={commentary}
          aiColor={game.aiColor}
          personaName={persona}
          moverLabel={moverLabel}
          systemChips={systemChips}
          hint={hint}
          onRetryEngine={onRetryEngine}
          personaHeaderName={chatName}
          personaMeta={chatMeta}
          turn={chatTurn}
          spectating={seat === null}
          finished={finished}
        />}
      </TabsContent>

      <TabsContent
        value="moves"
        keepMounted
        className={cn("min-h-0 flex-1 flex-col", tab === "moves" ? "flex" : "hidden")}
      >
        <MovesTab
          history={history}
          totalPlies={totalPlies}
          reviewPly={reviewPly}
          autoplay={autoplay}
          canUndo={canUndo}
          canMove={canMove}
          pending={pending}
          mode={mode}
          seat={seat}
          actions={actions}
        />
      </TabsContent>

      <TabsContent
        value="info"
        keepMounted
        className={cn("min-h-0 flex-1 flex-col", tab === "info" ? "flex" : "hidden")}
      >
        <InfoTab
          view={view}
          mode={mode}
          seat={seat}
          totalPlies={totalPlies}
          spectatorCount={spectatorCount}
          actions={actions}
          onOpenRoom={onOpenRoom}
        />
      </TabsContent>
    </Tabs>
  );
}
