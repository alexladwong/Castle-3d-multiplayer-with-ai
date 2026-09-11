"use client";
// src/components/game/game-shell-view.tsx  [U2]
// The game screen of UI_REDESIGN §5, as a PURE component.
//
// Split rule (§10.3): this file may not import `convex/react`. Everything that
// needs the backend — the controller, commentary rows, presence, the rating
// delta, the rematch mutation, the settings drawer — is handed in by
// `GameShell`, which is why `/dev/game` can render the real screen against a
// mocked controller with no Clerk and no Convex.
//
// Layout, in one place so nothing remounts when it changes (§5.2): the board box
// is the SAME element in the default and focus layouts, only its classes differ.
// Remounting it would tear down the WebGL context and re-download the room.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDownIcon,
  EyeIcon,
  GraduationCapIcon,
  MessagesSquareIcon,
  MinimizeIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import type { ChatCommentaryRow } from "@/components/ai/chat-model";
import type { ChatHintState, ChatSystemChip } from "@/components/ai/game-chat";
import {
  FocusHud,
  Kbd,
  PlayerChip,
  ShortcutsDialog,
  StatPill,
} from "@/components/ui-kit";
import { TutorTab } from "@/components/tutor/tutor-panel";
import { useFocusTrap } from "@/components/tutor/use-focus-trap";
import { useTutorSurface } from "@/components/tutor/use-tutor-surface";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { DIFFICULTIES } from "@/lib/difficulty";
import { formatGameResult, pgnResult } from "@/lib/format";
import { useTutorStore } from "@/lib/stores/tutor-store";
import { useUiStore } from "@/lib/stores/ui-store";
import { cn } from "@/lib/ui";
import type { Colour, GameController, ViewerRole } from "@/lib/types";
import { MoveAnnouncer } from "./accessibility/move-announcer";
import { BoardSurface } from "./board-surface";
import { RoomAtmosphere } from "@/components/board2d/room-atmosphere";
import { DrawOfferDialog } from "./draw-offer-dialog";
import { GameActionBar } from "./game-action-bar";
import { GameMobileBar } from "./game-mobile-bar";
import { GameNameplate, type NameplateLamp } from "./game-nameplate";
import { GameResultDialog } from "./game-result-dialog";
import { GameSheetPeek, GameSidebar, type SidebarTab } from "./game-sidebar";
import type { PlayerChatState } from "./player-chat";
import { GameStatusPill } from "./game-status-pill";
import { GAME_SHORTCUTS, GAME_SHORTCUTS_NOTE } from "./game-shortcuts";
import { PromotionPicker } from "./promotion-picker";
import { TurnOverlay } from "./turn-overlay";
import { useIsCompact } from "./use-viewport";
// Screen-local CSS (UI_UPGRADE_2 §1): keyframes, the turn lamp's glow and the
// app frame's own scrollbar/caret theming, imported once from the top of the
// screen so nothing lands in globals.css.
import "./game.css";

/** Everything the screen needs that `GameController` does not carry. */
export interface GameShellMeta {
  playerChat?: PlayerChatState;
  /** Persisted `commentary` rows, oldest first. */
  commentary: ChatCommentaryRow[];
  /** FR-32: the online opponent has not been seen inside the abandon window. */
  opponentStale: boolean;
  /** Presence for the opponent; null when there is no signal (AI, local, spectating). */
  opponentOnline: boolean | null;
  spectatorCount: number;
  hint: ChatHintState;
  /** The viewer's rating change, once the game is over and it was rated (FR-49). */
  rating: { delta: number; after: number } | null;
  playAgainPending: boolean;
  onPlayAgain(): void;
  onRetryEngine?(): void;
  /**
   * The tutor panel (docs/PRO_TUTOR.md §3), already wired to its access and its
   * conversation. Absent — a game with no tutor at all — and this screen is
   * exactly what it was before Pro: two columns, five buttons on the phone.
   */
  tutor?: React.ReactNode;
  /** Contents of the Room drawer — `<SettingsForm/>` in the app. */
  roomSettings?: React.ReactNode;
  onRoomOpenChange?(open: boolean): void;
}

export interface GameShellViewProps {
  controller: GameController;
  viewerRole: ViewerRole;
  meta: GameShellMeta;
}

function seatOf(role: ViewerRole): Colour | "both" | null {
  if (role === "white") return "w";
  if (role === "black") return "b";
  if (role === "local") return "both";
  return null;
}

/**
 * Presence transitions as chat chips (§5.1 "opponent reconnected").
 *
 * Derived during render rather than in an effect: `react-hooks/set-state-in-effect`
 * is an error in this repo, and this is the documented "adjust state when a prop
 * changes" escape hatch — it settles in one extra render.
 */
function usePresenceChips(online: boolean | null): ChatSystemChip[] {
  const [state, setState] = useState<{ online: boolean | null; chips: ChatSystemChip[] }>({
    online: null,
    chips: [],
  });

  if (online !== null && state.online !== online) {
    setState((prev) => {
      if (prev.online === online) return prev;
      if (prev.online === null) return { online, chips: prev.chips };
      return {
        online,
        chips: [
          ...prev.chips,
          {
            id: `presence-${prev.chips.length}`,
            text: online ? "Opponent reconnected" : "Opponent may have disconnected",
          },
        ],
      };
    });
  }

  return state.chips;
}

/**
 * "Draw declined" (§5.1's system chips). An offer that disappears while the game
 * is still running was refused; one that disappears as the game ends was taken,
 * and the result chip already says so. Same derive-during-render rule as above.
 */
function useDrawChips(offerFrom: Colour | null, active: boolean): ChatSystemChip[] {
  const [state, setState] = useState<{ offer: Colour | null; chips: ChatSystemChip[] }>({
    offer: offerFrom,
    chips: [],
  });

  if (state.offer !== offerFrom) {
    setState((prev) => {
      if (prev.offer === offerFrom) return prev;
      const declined = prev.offer !== null && offerFrom === null && active;
      return {
        offer: offerFrom,
        chips: declined
          ? [...prev.chips, { id: `draw-${prev.chips.length}`, text: "Draw declined" }]
          : prev.chips,
      };
    });
  }

  return state.chips;
}

export function GameShellView({ controller, viewerRole, meta }: GameShellViewProps) {
  const { view, board, actions } = controller;
  const game = view?.game ?? null;

  // Observe committed moves even while the tutor is hidden or in another layout.
  const tutorMoves = game?.moves;
  useEffect(() => {
    if (tutorMoves) useTutorStore.getState().reconcileMoves(tutorMoves);
  }, [tutorMoves]);

  const boardView = useUiStore((s) => s.boardView);
  const webglAvailable = useUiStore((s) => s.webglAvailable);
  // True when the column is showing the room: the canvas then fills the column and
  // the square constraint belongs to the 2D branch only (§4.2).
  const boardIs3d = boardView === "3d" && webglAvailable !== false;
  // The room's key light — study is a warm lamp, space a cold one, arcade magenta.
  // A custom room has no key light of its own (it borrows Minimal's), so it uses the
  // glow derived from its own squares instead.
  const layoutMode = useUiStore((s) => s.layoutMode);
  const settingsDrawerOpen = useUiStore((s) => s.settingsDrawerOpen);
  const setSettingsDrawerOpen = useUiStore((s) => s.setSettingsDrawerOpen);

  const compact = useIsCompact();
  const fullscreen = useFullscreen();
  const focus = layoutMode === "focus";

  const isAi = game?.mode === "ai";
  // §5.1: Chat leads in an AI game, Moves otherwise — unless the shell opens straight
  // into a reviewed position (a shared link, the dev harness), where the move list is
  // the whole point.
  const [tab, setTab] = useState<SidebarTab>((isAi || meta.playerChat) && controller.isLive ? "chat" : "moves");

  // Stepping back into the game (§5.1 "click to review") is a request to look at the
  // move list, so the sidebar goes there the moment review starts — the reviewing
  // banner is what brings you back, and the reader is free to switch tabs again while
  // still reviewing. Derived from a render-time comparison rather than an effect, so
  // the list is already on screen for the first reviewed position.
  const [wasLive, setWasLive] = useState(controller.isLive);
  if (wasLive !== controller.isLive) {
    setWasLive(controller.isLive);
    if (!controller.isLive && tab !== "moves") setTab("moves");
  }
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // §5.3's sheet is now opened, never defaulted open: at rest the panel is the
  // one-line peek strip above the action bar, so the board keeps the phone.
  const [sheetOpen, setSheetOpen] = useState(false);
  // §4.8 item 1: fullscreen must never silence the opponent. The conversation is
  // one pill away, and the newest thing they said sits on the board as a card
  // the player can put down.
  const [focusChatOpen, setFocusChatOpen] = useState(false);
  // Read by the Escape handler, which is registered once and must not re-bind on
  // every open/close. Written in an effect, never during render.
  const focusChatOpenRef = useRef(focusChatOpen);
  useEffect(() => {
    focusChatOpenRef.current = focusChatOpen;
  }, [focusChatOpen]);
  // §4.8 item 1's panel is a layer, so it behaves like one: focus moves into it when
  // it opens and comes back to the pill that opened it when it closes.
  const chatPillRef = useRef<HTMLButtonElement>(null);
  const panelCloseRef = useRef<HTMLButtonElement>(null);
  const panelWasOpen = useRef(false);
  useEffect(() => {
    if (focusChatOpen) panelCloseRef.current?.focus();
    else if (panelWasOpen.current) chatPillRef.current?.focus();
    panelWasOpen.current = focusChatOpen;
  }, [focusChatOpen]);
  const [dismissedNote, setDismissedNote] = useState<string | null>(null);

  /* ---------------------------------------------------------------- tutor */

  // PRO_TUTOR §3: one panel, three shapes. A third grid track from 1280, an
  // overlay over the board's left half from 1024, a 60dvh sheet below that —
  // and the same overlay in the focus layout, opened from the HUD.
  const tutorNode = meta.tutor ?? null;
  const tutorSurface = useTutorSurface();
  const tutorOpen = useTutorStore((s) => s.panelOpen);
  const setTutorOpen = useTutorStore((s) => s.setPanelOpen);
  const tutorInColumn = tutorNode !== null && tutorSurface === "column" && !focus;
  const tutorAsOverlay = tutorNode !== null && (focus || tutorSurface === "overlay");
  const tutorOverlayOpen = tutorAsOverlay && tutorOpen;
  const tutorTrap = useFocusTrap<HTMLDivElement>(tutorOverlayOpen, !focus);
  /** The mobile bar's "Tutor" button, so closing the sheet can hand focus back. */
  const tutorOpener = useRef<HTMLButtonElement | null>(null);

  // §3: anywhere the panel is a LAYER — below 1280, and in the focus layout —
  // it starts collapsed, because it opens over the board and so has to be asked
  // for. Written when the shape changes, never on every render, so a member who
  // opened it keeps it open for as long as that shape holds.
  useEffect(() => {
    if (tutorSurface !== "column" || focus) useTutorStore.getState().setPanelOpen(false);
  }, [tutorSurface, focus]);

  // Read by the Escape handler, which is registered once (see `focusChatOpenRef`).
  const tutorOverlayRef = useRef(tutorOverlayOpen);
  useEffect(() => {
    tutorOverlayRef.current = tutorOverlayOpen;
  }, [tutorOverlayOpen]);


  const presenceChips = usePresenceChips(meta.opponentOnline);
  const drawChips = useDrawChips(
    controller.drawOfferFrom,
    (game?.status ?? "active") === "active",
  );

  // Neither the focus layout nor a phone at rest shows the panel, so anything Pip
  // says while the board has the screen would otherwise arrive silently. One count
  // and a baseline stamped the moment the panel goes away is all the bookkeeping
  // this needs — no per-row ids, no read receipts, and it resets itself the moment
  // the panel is back (leaving focus, or opening the sheet).
  const messageCount =
    meta.commentary.length +
    ((meta.playerChat?.messages.at(-1)?.sequence ?? -1) + 1) +
    presenceChips.length +
    drawChips.length +
    (controller.drawOfferFrom === null ? 0 : 1);
  // The focus panel counts as the panel: while it is open the player is reading the
  // very conversation the badge is counting, so the count re-baselines the moment it
  // opens, exactly as it already does for the mobile sheet.
  const panelHidden = (focus && !focusChatOpen) || (compact && !sheetOpen);
  const [unreadFrom, setUnreadFrom] = useState({ hidden: panelHidden, at: messageCount });
  if (unreadFrom.hidden !== panelHidden) setUnreadFrom({ hidden: panelHidden, at: messageCount });
  const unread =
    panelHidden && unreadFrom.hidden ? Math.max(0, messageCount - unreadFrom.at) : 0;

  /* --------------------------------------------------------------- focus */

  // §5.2: the header is hidden by an attribute on <html>, which `SiteHeader`
  // already styles against — no cross-package import in either direction.
  useEffect(() => {
    const root = document.documentElement;
    if (focus) root.dataset.layout = "focus";
    else delete root.dataset.layout;
    return () => {
      delete root.dataset.layout;
    };
  }, [focus]);

  // Leaving the browser's own fullscreen (Esc, the OS chrome) must also leave the
  // focus layout, or the header stays hidden with nothing to explain why.
  const wasFullscreen = useRef(false);
  useEffect(() => {
    const was = wasFullscreen.current;
    wasFullscreen.current = fullscreen.active;
    if (was && !fullscreen.active) useUiStore.getState().setLayoutMode("default");
  }, [fullscreen.active]);

  // The layout is session state on a shared store: a player who walks out of a
  // fullscreen game must not find the rest of the app headless.
  useEffect(
    () => () => {
      useUiStore.getState().setLayoutMode("default");
    },
    [],
  );

  const { enter: enterFullscreen, exit: exitFullscreen } = fullscreen;
  const toggleFocus = useCallback(() => {
    const next = useUiStore.getState().layoutMode === "focus" ? "default" : "focus";
    useUiStore.getState().setLayoutMode(next);
    // §5.2: real fullscreen is an enhancement — the layout switches either way.
    if (next === "focus") void enterFullscreen();
    else void exitFullscreen();
  }, [enterFullscreen, exitFullscreen]);

  const toggleView = useCallback(() => {
    const state = useUiStore.getState();
    if (state.boardView === "2d" && state.webglAvailable === false) return;
    actions.setBoardView(state.boardView === "3d" ? "2d" : "3d");
  }, [actions]);

  const orientation = board.orientation;
  const reviewPly = controller.reviewPly;
  useShortcuts({
    onFullscreen: toggleFocus,
    onToggleView: toggleView,
    onFlip: () => actions.setOrientation(orientation === "w" ? "b" : "w"),
    onStep: (delta) => actions.stepReview(delta),
    onFirst: () => actions.goToPly(0),
    onLast: () => actions.goToPly(null),
    onHelp: () => setShortcutsOpen(true),
    onEscape: () => {
      // The panel is a layer over the focus layout, so it is what Escape dismisses
      // first. `useShortcuts` only skips Escape for real popups (`[data-open]`), and
      // this panel is a plain div, so without this branch Escape tore down the whole
      // fullscreen layout out from under an open conversation.
      if (tutorOverlayRef.current) {
        useTutorStore.getState().setPanelOpen(false);
        return;
      }
      if (focusChatOpenRef.current) {
        setFocusChatOpen(false);
        return;
      }
      if (useUiStore.getState().layoutMode === "focus") toggleFocus();
      else if (reviewPly !== null) actions.goToPly(null);
    },
  });

  if (game === null || view === null) return null;

  /* -------------------------------------------------------------- derived */

  const seat = seatOf(viewerRole);
  const active = game.status === "active";
  const finished = game.status !== "active" && game.status !== "waiting";
  const totalPlies = game.moves.length;
  const near: Colour = orientation;
  const far: Colour = orientation === "w" ? "b" : "w";
  const persona = game.difficulty ? DIFFICULTIES[game.difficulty] : null;

  const nameOf = (colour: Colour) => (colour === "w" ? view.whiteName : view.blackName);
  const playerOf = (colour: Colour) => (colour === "w" ? view.white : view.black);
  const resultText = finished
    ? formatGameResult(game.status, game.winner, game.endReason, {
        whiteName: view.whiteName,
        blackName: view.blackName,
      })
    : null;

  const systemChips: ChatSystemChip[] = [
    ...presenceChips,
    ...drawChips,
    ...(controller.drawOfferFrom !== null
      ? [
          {
            id: "draw-offer",
            text:
              controller.drawOfferFrom === seat
                ? "You offered a draw"
                : "Draw offered — accept or decline above the board",
          },
        ]
      : []),
    ...(finished && game.endReason === "agreement"
      ? [{ id: "draw-accepted", text: "Draw accepted" }]
      : []),
    ...(finished
      ? [
          {
            id: "game-over",
            text: `Game over · ${pgnResult(game.status, game.winner)}`,
          },
        ]
      : []),
  ];

  // The peek strip carries whatever sits at the BOTTOM of the panel. `GameChat`
  // sorts system chips with no ply after every bubble, so a chip — "Draw declined",
  // "Game over · 1-0" — outranks the last thing the persona said here too, and the
  // strip and the list never disagree about what was said most recently.
  const lastChip = systemChips.at(-1) ?? null;
  const lastComment = meta.commentary.at(-1) ?? null;
  const lastPlayerMessage = meta.playerChat?.messages.at(-1) ?? null;
  const opponentName = seat === "w" ? view.blackName : view.whiteName;
  const peekText = lastPlayerMessage?.text ?? lastChip?.text ?? lastComment?.text ?? null;
  const peekSpeaker = lastPlayerMessage
    ? (lastPlayerMessage.mine ? "You" : opponentName)
    : lastChip !== null ? null : (persona?.persona.name ?? null);
  // §4.6's persona header line, compressed: the same vocabulary the Chat tab's plate
  // uses, from the truth the shell already holds.
  const peekStatus =
    (game?.status ?? "active") !== "active"
      ? { text: "game over", live: false }
      : viewerRole === "spectator"
        ? { text: "watching", live: false }
        : seat !== null && seat !== "both" && game?.turn === seat
          ? { text: "your move", live: true }
          : { text: "to move", live: true };

  const statusPill = (
    <GameStatusPill
      reviewPly={reviewPly}
      moveNumber={Math.max(1, Math.ceil(totalPlies / 2) + (game.turn === "w" ? 1 : 0))}
      turnLabel={controller.turnLabel}
      active={active}
      inCheck={board.checkSquare !== null}
      canMove={controller.canMove}
      totalPlies={totalPlies}
      // §4.8 item 6: the pill names the HALF-move being reviewed, so an arrow
      // press always changes what it says.
      reviewSan={reviewPly === null || reviewPly === 0 ? null : (game.moves[reviewPly - 1] ?? null)}
      resultText={resultText}
      onBackToLive={() => actions.goToPly(null)}
    />
  );

  // §4.1's mode chip, one string per mode.
  const modeChip =
    game.mode === "ai"
      ? `AI · ${persona?.label ?? "Computer"}`
      : game.mode === "local"
        ? "Local"
        : `Online · ${game.rated ? "Rated" : "Unrated"}`;

  // §4.1 / §4.8 item 6: the lamp lights for the side to move and says
  // "reviewing" instead while the board is rewound.
  const lampFor = (colour: Colour): NameplateLamp => {
    if (!active || game.turn !== colour) return "off";
    return reviewPly === null ? "to-move" : "reviewing";
  };

  const sidebar = (
    <GameSidebar
      onOpenRoom={() => setSettingsDrawerOpen(true)}
      view={view}
      mode={game.mode}
      seat={seat}
      history={controller.history}
      totalPlies={totalPlies}
      reviewPly={reviewPly}
      autoplay={controller.autoplay}
      canUndo={controller.canUndo}
      canMove={controller.canMove}
      pending={controller.pending}
      actions={actions}
      commentary={meta.commentary}
      playerChat={meta.playerChat}
      systemChips={systemChips}
      hint={meta.hint}
      spectatorCount={meta.spectatorCount}
      onRetryEngine={meta.onRetryEngine}
      tab={tab}
      onTabChange={setTab}
    />
  );

  // FR-31: the same banner in both layouts. In focus it is a persistent HUD
  // layer rather than a row above the action bar — an offer that fades out while
  // the clock runs is an offer the player never answered.
  const drawOfferOpen = controller.drawOfferFrom !== null && seat !== null;
  const drawOffer = (
    <DrawOfferDialog
      offerFrom={controller.drawOfferFrom}
      seat={seat}
      pending={controller.pending}
      // §4.8 item 2: the banner names the person, not the colour.
      offerName={controller.drawOfferFrom === null ? null : nameOf(controller.drawOfferFrom)}
      onRespond={actions.respondDraw}
      // §4.5: floating layers rely on the shadow alone, so the focus copy drops
      // the hairline the in-page banner keeps.
      className={focus ? "border-transparent bg-card shadow-soft" : undefined}
    />
  );

  // §4.8 item 1: the newest thing the opponent said, as a card on the board in
  // the focus layout. Dismissible, outside the fading layer, desktop only — on a
  // phone the board is already the whole screen.
  const lastOpponentLine = isAi ? (meta.commentary.at(-1) ?? null) : null;
  const focusNote =
    // Not while the conversation is on screen: the card exists to carry the
    // opponent's voice when the panel is NOT visible, and showing both put the same
    // sentence on the board twice with one copy the player had to dismiss by hand.
    focus &&
    !compact &&
    !focusChatOpen &&
    lastOpponentLine !== null &&
    dismissedNote !== lastOpponentLine.id ? (
      <div className="rounded-xl bg-card p-3 shadow-soft">
        <div className="flex items-start gap-2">
          <span
            aria-hidden
            className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-[12px] font-medium text-primary-foreground"
          >
            {(persona?.persona.name ?? "?")[0]?.toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] text-muted-foreground">
              <span className="font-medium text-foreground">
                {persona?.persona.name ?? "Opponent"}
              </span>
              {lastOpponentLine.ply ? (
                <span className="tabular ml-1.5 font-mono">
                  {Math.ceil(lastOpponentLine.ply / 2)}
                  {lastOpponentLine.ply % 2 === 1 ? ". " : "… "}
                </span>
              ) : null}
            </p>
            <p className="text-[13px] text-foreground">{lastOpponentLine.text}</p>
          </div>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Put this message down"
            className="shrink-0"
            onClick={() => setDismissedNote(lastOpponentLine.id)}
          >
            <XIcon aria-hidden />
          </Button>
        </div>
      </div>
    ) : undefined;

  const barProps = {
    mode: game.mode,
    seat,
    boardView,
    webglAvailable,
    orientation,
    focus,
    pending: controller.pending,
    canUndo: controller.canUndo,
    canResign: controller.canResign,
    canOfferDraw: controller.canOfferDraw,
    drawOffered: controller.drawOfferFrom !== null,
    hint: meta.hint,
    actions,
    onToggleView: toggleView,
    onToggleFocus: toggleFocus,
    onOpenRoom: () => setSettingsDrawerOpen(true),
    onOpenShortcuts: () => setShortcutsOpen(true),
  };

  return (
    <div
      className={cn(
        "relative flex w-full flex-col bg-background",
        // The board never scrolls (§5.1) — at every width the screen is exactly
        // one viewport tall and the board takes whatever height is left over.
        focus ? "fixed inset-0 z-50 h-[100dvh]" : "h-[calc(100dvh-3.5rem)] overflow-hidden",
      )}
      data-layout={focus ? "focus" : "default"}
      // Scope for game.css: the app frame themes its own caret, scrollbars and
      // selection rather than inheriting the browser's.
      data-slot="game-frame"
    >
      {/* The screen is full-bleed by design (§5.1) — the status pill, not a title,
          carries the state — but a document with no heading at all is a dead end for
          a screen-reader user landing here from the lobby. One sr-only h1 names the
          board; everything visible stays exactly as designed. */}
      <h1 className="sr-only">
        {`${view.whiteName} versus ${view.blackName} — ${
          game.mode === "ai" ? "against the computer" : game.mode === "local" ? "pass and play" : "online game"
        }`}
      </h1>

      <div
        className={cn(
          "grid min-h-0 flex-1",
          focus
            ? "grid-cols-1"
            : tutorNode === null
              ? "lg:grid-cols-[minmax(0,1fr)_23.75rem] xl:grid-cols-[minmax(0,1fr)_25rem]"
              : // PRO_TUTOR §3: tutor | board | sidebar from 1280. Collapsed, the
                // first track is the 44px rail; the board box's container query
                // re-fits the square either way, with no JS and no remount.
                tutorInColumn && tutorOpen
                ? "lg:grid-cols-[2.75rem_minmax(0,1fr)_23.75rem] xl:grid-cols-[22rem_minmax(0,1fr)_25rem]"
                : "lg:grid-cols-[2.75rem_minmax(0,1fr)_23.75rem] xl:grid-cols-[2.75rem_minmax(0,1fr)_25rem]",
        )}
      >
        {/* ------------------------------------------------- tutor column
            From 1024 the track is the 44px rail; from 1280 it can hold the panel
            itself. Below 1024 it is display:none and the same panel node moves
            into the sheet, so it is never in two places at once. */}
        {focus || tutorNode === null ? null : (
          <div className="hidden min-h-0 min-w-0 lg:flex">
            <div
              className={cn(
                "min-h-0 min-w-0 flex-1 flex-col border-r border-border",
                // Hidden, not unmounted: collapsing the column must not throw
                // away the conversation the member is having.
                tutorInColumn && tutorOpen ? "flex" : "hidden",
              )}
            >
              {tutorInColumn ? tutorNode : null}
            </div>
            {tutorInColumn && tutorOpen ? null : (
              <TutorTab expanded={tutorOverlayOpen} onOpen={() => setTutorOpen(true)} />
            )}
          </div>
        )}

        {/* ------------------------------------------------- board column */}
        <div className="flex min-h-0 min-w-0 flex-col lg:border-r lg:border-border">
          {/* The plates and the board travel together. Below `lg` the square is
              capped by the column WIDTH, so the leftover height would otherwise
              open as dead space above and below the board with the near plate
              stranded at the bottom of the screen; centring the GROUP puts the
              two nameplates back against the board where they belong. The
              wrapper is unconditional — the board box below has to stay the same
              element in both layouts or the WebGL context is torn down (§5.2). */}
          <div
            className={cn(
              "flex min-h-0 min-w-0 flex-1 flex-col",
              // In 3D the canvas fills the column (§4.2), so the plates sit at the
              // column's edges and the room, not the page ground, fills what is left
              // above and below the board on a phone. The 2D square still centres.
              focus || boardIs3d ? null : "justify-center",
            )}
          >
          {focus ? null : (
            <GameNameplate
              name={nameOf(far)}
              player={playerOf(far)}
              colour={far}
              lamp={lampFor(far)}
              captured={board.captured}
              modeChip={modeChip}
              stale={meta.opponentStale && seat !== null && far !== seat}
              seam="bottom"
            >
              <div className="shrink-0">{statusPill}</div>
            </GameNameplate>
          )}

          {viewerRole === "spectator" && !focus ? (
            <div
              role="status"
              className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5 text-[13px] text-muted-foreground"
            >
              <EyeIcon className="size-3.5 shrink-0" aria-hidden />
              <span className="font-medium text-foreground">Spectating</span>
              <span className="truncate">This board is read-only.</span>
              <StatPill
                className="ml-auto shrink-0"
                value={Math.max(0, meta.spectatorCount)}
                label="watching"
              />
            </div>
          ) : null}

          {/* The board box: one element, two layouts. `container-type: size`
              turns the leftover height into a unit so the square can be the
              smaller of the two axes without measuring anything in JS.
              Full-bleed below `lg`: on a phone the square is capped by the column
              WIDTH, so every pixel of side padding comes straight off the board.
              The desk keeps its 8px margin, the phone gives it to the hero. */}
          <div
            className={cn(
              "relative grid min-h-0 min-w-0 flex-1 grid-cols-1 grid-rows-1 place-items-center p-0 [container-type:size]",
              // The 2D square keeps the desk's 8px margin; the room runs to the
              // column's edges (§4.2), so in 3D there is no gutter to frame it.
              boardIs3d ? "p-0" : "lg:p-2",
              // The cap that turns the leftover height into space the group can
              // centre in, rather than a box that grows past the square.
              focus || boardIs3d ? null : "max-lg:max-h-[100vw]",
            )}
          >
            {!boardIs3d ? <RoomAtmosphere /> : null}
            <div
              className={cn(
                "relative",
                // §4.2 item 1: the square is the 2D board's constraint, not the
                // column's. In 3D the canvas fills the column and the camera frames
                // by height, so the board keeps its size and the room simply runs to
                // the edges, under the plates and up to the sidebar hairline.
                boardIs3d
                  ? "size-full"
                  : "aspect-square h-[min(100cqw,100cqh)] w-[min(100cqw,100cqh)]",
              )}
            >
              <BoardSurface {...board} />
              {game.mode === "local" ? (
                <TurnOverlay
                  visible={controller.flipping}
                  turn={game.turn}
                  name={game.turn === "w" ? view.whiteName : view.blackName}
                />
              ) : null}
            </div>

            {focus ? (
              <FocusHud
                autoHide={boardView === "3d"}
                topLeft={
                  // §4.5: it floats, so it takes the shadow and drops the hairline.
                  <div className="rounded-full bg-card px-3 py-1.5 shadow-soft">
                    <PlayerChip
                      size="sm"
                      name={nameOf(game.turn)}
                      avatarUrl={playerOf(game.turn)?.avatarUrl ?? null}
                      rating={playerOf(game.turn)?.rating ?? null}
                      side={game.turn}
                      toMove={active}
                      toMoveLabel={reviewPly === null ? "to move" : "reviewing"}
                      subtitle={active ? undefined : resultText}
                    />
                  </div>
                }
                aside={focusNote}
                topCenter={
                  // §4.8 item 1: the status — Check included — never hides with
                  // the HUD, so it lives outside the fading layer alongside
                  // anything still waiting on an answer.
                  <div className="flex flex-col items-center gap-2">
                    {/* Floating over the room: a plate and the soft shadow, no
                        hairline. Over a bright backdrop the bare tinted pill was
                        unreadable in the light theme. */}
                    <div className="rounded-full bg-card p-1 shadow-soft">{statusPill}</div>
                    {drawOfferOpen ? drawOffer : null}
                  </div>
                }
                // Outside the fading layer on purpose: the way out, and the way
                // to find out what the keys do, are the two things that must
                // never be a guess on a screen with no header (§5.2).
                persistentLead={
                  tutorNode === null ? null : (
                    <Button
                      variant="ghost"
                      className="bg-card shadow-soft"
                      aria-label="Tutor"
                      aria-expanded={tutorOverlayOpen}
                      onClick={() => {
                        if (!tutorOverlayOpen && compact) setFocusChatOpen(false);
                        setTutorOpen(!tutorOverlayOpen);
                      }}
                    >
                      <GraduationCapIcon aria-hidden />
                      <span aria-hidden>Tutor</span>
                    </Button>
                  )
                }
                persistent={
                  <>
                    {/* §4.5: every one of these floats, so each keeps the soft
                        shadow and drops the 1px hairline. The surface is opaque
                        enough (95%) to hold 4.5:1 over a lit board. */}
                    <Button
                      ref={chatPillRef}
                      variant="ghost"
                      className="relative bg-card shadow-soft"
                      aria-label={
                        unread === 0
                          ? "Chat"
                          : `Chat, ${unread} new ${unread === 1 ? "message" : "messages"}`
                      }
                      aria-expanded={focusChatOpen}
                      onClick={() => {
                        if (!focusChatOpen && compact) setTutorOpen(false);
                        setFocusChatOpen((open) => !open);
                      }}
                    >
                      <MessagesSquareIcon aria-hidden />
                      <span aria-hidden>Chat</span>
                      {unread === 0 ? null : (
                        <span
                          aria-hidden
                          className="tabular absolute -top-1.5 -right-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[12px] leading-none font-semibold text-primary-foreground"
                        >
                          {unread > 9 ? "9+" : unread}
                        </span>
                      )}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Keyboard shortcuts"
                      className="bg-card shadow-soft"
                      onClick={() => setShortcutsOpen(true)}
                    >
                      <Kbd aria-hidden className="border-0 bg-transparent px-0">
                        ?
                      </Kbd>
                    </Button>
                    <Button
                      variant="ghost"
                      className="bg-card shadow-soft"
                      onClick={toggleFocus}
                    >
                      <MinimizeIcon aria-hidden />
                      Exit fullscreen
                    </Button>
                  </>
                }
                bottom={<GameActionBar {...barProps} variant="focus" />}
              />
            ) : null}

            {/* --------------------------------------------- tutor overlay
                §3: from 1024, and in the focus layout, the panel is a layer over
                the board's LEFT HALF — inside the board box, so it never covers a
                nameplate or a single button of the action bar. The soft shadow
                alone, no hairline (DESIGN.md's only-floating-things rule); Escape
                closes it and Tab stays inside while it is open. */}
            {tutorNode !== null && tutorAsOverlay ? (
              <div
                ref={tutorTrap}
                tabIndex={-1}
                role="dialog"
                // In fullscreen this is a floating companion to the right-hand
                // chat: the board and both conversations remain reachable.
                aria-modal={focus ? false : true}
                aria-label="Tutor"
                onKeyDown={(event) => {
                  // §3: "Escape closes". The global shortcut handler cannot do it
                  // here — it returns early for INPUT/TEXTAREA targets, and the
                  // composer is exactly where a member stands. `preventDefault`
                  // keeps that handler from also acting on the same key.
                  if (event.key !== "Escape" || event.defaultPrevented) return;
                  event.preventDefault();
                  useTutorStore.getState().setPanelOpen(false);
                }}
                className={cn(
                  // Half the board box, not 92% of it: at 1024 a 24rem panel stood
                  // on 64% of a 600px board and hid the whole numbered line the
                  // answer beside it was describing. §3 says "the board's left
                  // half", and a reading column is what the panel is.
                  "absolute z-40 min-h-0 flex-col bg-card shadow-soft outline-none",
                  // Hidden rather than unmounted, so closing the layer to look at
                  // the board does not throw away the conversation behind it.
                  tutorOpen ? "flex" : "hidden",
                  // In focus the action bar floats at the bottom of this very box,
                  // so the layer stops short of it rather than covering the way out.
                  focus
                    ? "top-16 bottom-20 left-3 w-[calc(100%-1.5rem)] overflow-hidden rounded-2xl sm:w-[min(22rem,calc(50%-1.5rem))]"
                    : "top-0 bottom-0 left-0 w-[min(24rem,50%)] rounded-r-xl",
                )}
              >
                {tutorNode}
              </div>
            ) : null}
          </div>

          {focus ? null : (
            <GameNameplate
              name={nameOf(near)}
              player={playerOf(near)}
              colour={near}
              lamp={lampFor(near)}
              captured={board.captured}
              watching={meta.spectatorCount}
              stale={meta.opponentStale && seat !== null && near !== seat}
              seam="top"
            />
          )}
          </div>

          {/* §5.3 calls this "sticky": with the column pinned to one viewport it is
              always the last visible row, so plain flow does the job without a
              scrollport. On a phone the panel rides just above it as one line. */}
          {focus ? null : (
            <div className="z-20 flex shrink-0 flex-col gap-2 p-2">
              {drawOffer}
              {compact ? (
                <>
                  {sheetOpen ? null : (
                    <GameSheetPeek
                      speaker={peekSpeaker}
                      speakerMeta={
                        peekSpeaker === null || persona === null
                          ? null
                          : `${persona.label} · ${persona.aiRating}`
                      }
                      text={peekText}
                      status={peekStatus.text}
                      statusLive={peekStatus.live}
                      quiet={isAi ? "Chat, moves and game info" : "Moves and game info"}
                      unread={unread}
                      onExpand={() => setSheetOpen(true)}
                    />
                  )}
                  <GameMobileBar
                    {...barProps}
                    panelTab={tab}
                    onOpenPanel={() => setSheetOpen(true)}
                    // §3: the bar keeps FIVE buttons at 390px, so the tutor takes
                    // Fullscreen's place and Fullscreen moves into "More". The
                    // sidebar still has exactly three tabs — the tutor is never
                    // a fourth one.
                    onOpenTutor={
                      tutorNode === null
                        ? undefined
                        : (event) => {
                            // Held so Escape can put focus back where it came from:
                            // Base UI's non-modal drawer drops it on <body>, which
                            // throws a keyboard member to the top of the document.
                            tutorOpener.current = event.currentTarget;
                            setTutorOpen(true);
                          }
                    }
                  />
                </>
              ) : (
                <GameActionBar {...barProps} />
              )}
            </div>
          )}
        </div>

        {/* ----------------------------------------------------- sidebar */}
        {focus ? null : (
          <aside className="hidden min-h-0 flex-col bg-card lg:flex">{sidebar}</aside>
        )}
      </div>

      {/* ------------------------------------------- focus conversation
          §4.8 item 1: the same three tabs, as an overlay panel, so a fullscreen
          player can read what the opponent said and answer a draw without
          leaving the layout. Only ever ONE GameSidebar is mounted — the aside
          and the mobile sheet are both absent in focus. */}
      {focus && focusChatOpen ? (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="Game panel"
          // Starts below the persistent cluster so the way OUT of fullscreen is
          // never covered by the panel (WCAG 2.2 "focus not obscured", and
          // DESIGN.md's rule that the exit is never a guess).
          className="absolute top-16 right-3 bottom-20 z-40 flex min-h-0 w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-2xl bg-card shadow-soft sm:w-[min(22rem,calc(50%-1.5rem))]"
        >
          <div className="flex shrink-0 items-center justify-end p-1.5">
            <Button
              ref={panelCloseRef}
              size="icon"
              variant="ghost"
              aria-label="Hide the game panel"
              onClick={() => setFocusChatOpen(false)}
            >
              <XIcon aria-hidden />
            </Button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">{sidebar}</div>
        </div>
      ) : null}

      {/* ------------------------------------------- mobile bottom sheet */}
      {compact && !focus ? (
        <Drawer
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          modal={false}
          disablePointerDismissal
          showSwipeHandle
        >
          {/* A FIXED-height sheet, not a snap point: a snap-point drawer is a
              full-height popup slid down, so its content is laid out for the whole
              viewport and the newest chat bubble ends up below the fold.
              `--drawer-height` is the shadcn popup's own hook. It is 60dvh because
              the reader ASKED for it — at rest the panel is the one-line strip, and
              the board never loses the screen to a sheet nobody opened. */}
          <DrawerContent
            aria-label="Game panel"
            // §4.5: this screen animates no box dimension. The sheet is a fixed
            // size and slides on a transform, so trimming the property list to
            // transform/opacity/filter costs nothing and clears the detector.
            className="transition-[transform,opacity,filter]"
            style={{ "--drawer-height": "60dvh" } as React.CSSProperties}
          >
            <DrawerHeader className="sr-only">
              <DrawerTitle>Game panel</DrawerTitle>
              <DrawerDescription>Chat, moves and game information.</DrawerDescription>
            </DrawerHeader>
            {/* The sheet covers the action bar while it is open, so the way back to
                the board cannot be a swipe a first-timer has to guess at. */}
            <DrawerClose
              render={
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Hide the game panel"
                  // 44px square: it is a thumb target on a phone, not a desk affordance.
                  className="absolute top-2 right-1.5 z-10 size-11"
                />
              }
            >
              <ChevronDownIcon aria-hidden />
            </DrawerClose>
            <div className="flex min-h-0 flex-1 flex-col">{sidebar}</div>
          </DrawerContent>
        </Drawer>
      ) : null}

      {/* --------------------------------------------------- tutor sheet */}
      {tutorNode !== null && tutorSurface === "sheet" && !focus ? (
        <Drawer
          open={tutorOpen}
          onOpenChange={(open) => {
            setTutorOpen(open);
            // The panel's own "Hide tutor" already restores focus; Escape and a swipe
            // do not, so the opener is refocused here — the same restore the overlay's
            // `useFocusTrap` performs when it unmounts.
            if (!open) tutorOpener.current?.focus();
          }}
          modal={false}
          showSwipeHandle
        >
          <DrawerContent
            aria-label="Tutor"
            className="transition-[transform,opacity,filter]"
            // §3: 60dvh, the same fixed-height sheet the game panel uses, so the
            // newest answer is never laid out below the fold.
            style={{ "--drawer-height": "60dvh" } as React.CSSProperties}
          >
            <DrawerHeader className="sr-only">
              <DrawerTitle>Tutor</DrawerTitle>
              <DrawerDescription>
                Ask about the position and see it marked on the board.
              </DrawerDescription>
            </DrawerHeader>
            <div className="flex min-h-0 flex-1 flex-col">{tutorNode}</div>
          </DrawerContent>
        </Drawer>
      ) : null}

      {/* ------------------------------------------------- room settings */}
      {meta.roomSettings ? (
        <Drawer
          open={settingsDrawerOpen}
          swipeDirection={compact ? "down" : "right"}
          modal={compact}
          onOpenChange={meta.onRoomOpenChange ?? setSettingsDrawerOpen}
        >
          <DrawerContent
            data-testid="room-settings-panel"
            className="max-h-[85dvh] transition-[transform,opacity,filter] lg:max-h-none lg:rounded-xl"
            style={{
              "--drawer-height": compact ? "85dvh" : "calc(100dvh - 24px)",
              "--drawer-content-width": compact ? "auto" : "28rem",
              "--drawer-inset": compact ? "0px" : "12px",
            } as React.CSSProperties}
          >
            <DrawerHeader className="relative border-b border-border p-5 pr-14 pb-4 text-left">
              <DrawerTitle>Board &amp; room settings</DrawerTitle>
              <DrawerDescription>
                Changes apply immediately and never interrupt the game.
              </DrawerDescription>
              <DrawerClose
                render={<Button variant="ghost" size="icon-sm" />}
                aria-label="Close board and room settings"
                className="absolute top-4 right-4"
              >
                <XIcon className="size-4" />
              </DrawerClose>
            </DrawerHeader>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 [&_section]:p-4">
              {meta.roomSettings}
            </div>
          </DrawerContent>
        </Drawer>
      ) : null}

      <ShortcutsDialog
        shortcuts={GAME_SHORTCUTS}
        note={GAME_SHORTCUTS_NOTE}
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
      />

      <PromotionPicker prompt={board.promotion} onChoose={actions.choosePromotion} />

      <GameResultDialog
        view={view}
        seat={seat}
        rating={meta.rating}
        playAgainPending={meta.playAgainPending}
        onPlayAgain={meta.onPlayAgain}
      />

      <MoveAnnouncer
        lastMove={board.lastMove}
        turn={board.turn}
        checkSquare={board.checkSquare}
        status={game.status}
        winner={game.winner}
        whiteName={view.whiteName}
        blackName={view.blackName}
        reviewPly={reviewPly}
      />
    </div>
  );
}
