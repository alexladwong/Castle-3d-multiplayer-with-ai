"use client";
// src/components/game/game-shell.tsx  [P3 → split by U2]
//
// The container half of the game screen (UI_REDESIGN §10.3 "split rule"). It
// mounts `useGameController` ABOVE the 2D/3D swap (§D.11.8) so switching views
// never unmounts the game state, runs every Convex subscription the screen
// needs, and hands `GameShellView` plain data. All layout lives in the view.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsForm } from "@/components/settings/settings-form";
import { preloadRoomAssets } from "@/components/settings/room-picker";
import { useHint } from "@/components/ai/use-hint";
import { TutorPanel } from "@/components/tutor/tutor-panel";
import type { ChatCommentaryRow } from "@/components/ai/chat-model";
import { useAiTurn } from "@/hooks/use-ai-turn";
import { useGameController } from "@/hooks/use-game-controller";
import { usePlayerChat } from "@/hooks/use-player-chat";
import { useHeartbeat } from "@/hooks/use-heartbeat";
import { useSettingsWriter } from "@/hooks/use-settings-sync";
import { ABANDON_TIMEOUT_MS, MAX_HINTS_PER_GAME } from "@/lib/constants";
import { DIFFICULTIES } from "@/lib/difficulty";
import { errorCopyFor } from "@/lib/errors";
import { useAiStore } from "@/lib/stores/ai-store";
import { useTutorStore } from "@/lib/stores/tutor-store";
import { useUiStore } from "@/lib/stores/ui-store";
import type { BoardView, Colour, GameId, GameView } from "@/lib/types";
import { GameShellView, type GameShellMeta } from "./game-shell-view";

export interface GameShellProps {
  gameId: GameId;
  /** Server-preloaded `api.games.get` result — the first render uses it verbatim. */
  initialView: GameView | null;
}

const PRESENCE_TICK_MS = 20_000;
const NO_COMMENTARY: ChatCommentaryRow[] = [];

export function GameShell({ gameId, initialView }: GameShellProps) {
  const router = useRouter();
  const controller = useGameController(gameId, initialView);
  const view = controller.view;
  const game = view?.game ?? null;
  const active = game?.status === "active";
  const finished = game !== null && game.status !== "active" && game.status !== "waiting";
  const mode = game?.mode ?? "online";
  const viewerRole = view?.viewerRole ?? "spectator";
  const isSpectator = viewerRole === "spectator";
  const isParticipant = viewerRole === "white" || viewerRole === "black";
  const playerChat = usePlayerChat(gameId, mode === "online" && isParticipant);

  const { isAuthenticated } = useConvexAuth();

  // FR-15: the in-game 2D/3D toggle is a PLAYER SETTING, so it has to survive a
  // reload. The controller may only touch `api.games.*`, so the write-back is
  // wired here — one writer for the whole shell, shared with <SettingsForm/>, so
  // a change never queues two debounced `players.updateSettings` calls.
  const saveSettings = useSettingsWriter();
  const setBoardViewPersisted = useCallback(
    (next: BoardView) => {
      useUiStore.getState().setBoardView(next);
      saveSettings({ boardView: next });
    },
    [saveSettings],
  );
  const shellController = useMemo(
    () => ({
      ...controller,
      actions: { ...controller.actions, setBoardView: setBoardViewPersisted },
    }),
    [controller, setBoardViewPersisted],
  );

  // FR-21m: opening the drawer is the earliest reliable signal that a preset
  // switch is coming, so that is where the room asset set gets warmed.
  const setSettingsDrawerOpen = useUiStore((s) => s.setSettingsDrawerOpen);
  const onRoomOpenChange = useCallback(
    (open: boolean) => {
      setSettingsDrawerOpen(open);
      if (open) preloadRoomAssets();
    },
    [setSettingsDrawerOpen],
  );

  useHeartbeat(gameId, active === true);

  // docs/PRO_TUTOR.md §4: the tutor's marks belong to ONE game. Cleared here, in
  // the container, rather than in a cleanup inside the panel: this effect runs
  // after every child's, so it can never race the panel's own "put the newest
  // answer on the board" — and a brand-new screen has no answers to lose.
  useEffect(() => {
    useTutorStore.getState().clearAnnotations();
  }, [gameId]);

  // P5 owns the pipeline; the game page is where it has to be mounted.
  // Spectators must never drive it — `games.makeAiMove` requires a participant.
  const aiTurn = useAiTurn(mode === "ai" && !isSpectator ? gameId : null);

  const commentaryRows = useQuery(
    api.commentary.forGame,
    isAuthenticated && mode === "ai" ? { gameId } : "skip",
  );
  const commentary: ChatCommentaryRow[] = useMemo(
    () =>
      commentaryRows === undefined
        ? NO_COMMENTARY
        : commentaryRows.map((row) => ({
            id: row._id,
            ply: row.ply,
            text: row.text,
            source: row.source,
            persona: row.persona,
          })),
    [commentaryRows],
  );

  // FR-32: the exact source for "your opponent may have disconnected" is the
  // opponent's last heartbeat. `games.presenceFor` carries no wall clock, so the
  // comparison happens here, on its own interval.
  const presence = useQuery(
    api.games.presenceFor,
    isAuthenticated && active && mode === "online" ? { gameId } : "skip",
  );
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!active || mode !== "online") return;
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, PRESENCE_TICK_MS);
    return () => clearInterval(id);
  }, [active, mode]);

  /* ------------------------------------------------------------- hints */

  const difficulty = game?.difficulty;
  const hintsAllowed = difficulty !== undefined && DIFFICULTIES[difficulty].hintsAllowed;
  const hintAvailable = mode === "ai" && isParticipant && hintsAllowed;
  const hintApi = useHint({ gameId, fen: game?.fen ?? "", enabled: hintAvailable });
  const hintRemaining = Math.max(0, MAX_HINTS_PER_GAME - (game?.hintsUsed ?? 0));
  const humanToMove =
    game !== null &&
    game.status === "active" &&
    game.aiColor !== undefined &&
    game.turn !== game.aiColor;
  const hintDisabledReason = hintApi.pending
    ? "Fetching a hint…"
    : hintRemaining === 0
      ? errorCopyFor("hint-limit", "game")
      : !humanToMove
        ? "Wait for your turn to ask for a hint."
        : null;

  // A new game (or a take-back that rewinds past it) must not leave a stale hint
  // bubble in the chat.
  const movesPlayed = game?.moves.length ?? 0;
  useEffect(() => {
    useAiStore.getState().setHint(null);
  }, [gameId, movesPlayed]);

  /* -------------------------------------------------------- end of game */

  const seat: Colour | "both" | null =
    viewerRole === "white"
      ? "w"
      : viewerRole === "black"
        ? "b"
        : viewerRole === "local"
          ? "both"
          : null;
  const viewerUsername =
    seat === "w" || seat === "both"
      ? (view?.white?.username ?? null)
      : seat === "b"
        ? (view?.black?.username ?? null)
        : null;

  // FR-49: the delta was written in the same transaction that finished the game.
  const ratingRows = useQuery(
    api.ratingHistory.forPlayer,
    finished && game !== null && game.rated && viewerUsername !== null
      ? { username: viewerUsername, pool: mode === "ai" ? "ai" : "human", limit: 10 }
      : "skip",
  );
  const ratingRow = ratingRows?.find((row) => row.gameId === gameId) ?? null;

  const createAiGame = useMutation(api.games.createAiGame);
  const createLocalGame = useMutation(api.games.createLocalGame);
  const [playAgainPending, setPlayAgainPending] = useState(false);
  const playAgain = useCallback(() => {
    if (game === null) return;
    setPlayAgainPending(true);
    void (async () => {
      try {
        if (game.mode === "ai" && game.difficulty && game.aiColor) {
          const id = await createAiGame({
            difficulty: game.difficulty,
            // Keep the same seat the player had.
            playerColor: game.aiColor === "w" ? "b" : "w",
          });
          router.push(`/game/${id}`);
          return;
        }
        if (game.mode === "local") {
          const id = await createLocalGame({ playerTwoName: game.localPlayerTwoName });
          router.push(`/game/${id}`);
          return;
        }
        router.push("/play");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not start a rematch.");
      } finally {
        setPlayAgainPending(false);
      }
    })();
  }, [game, createAiGame, createLocalGame, router]);

  /* --------------------------------------------------------------- meta */

  const opponentSeat: Colour | null = seat === "w" ? "b" : seat === "b" ? "w" : null;
  const opponentSeen =
    presence === undefined || opponentSeat === null ? null : presence[opponentSeat];
  const opponentStale =
    now > 0 &&
    mode === "online" &&
    game !== null &&
    (opponentSeen === null
      ? now - game.lastMoveAt > ABANDON_TIMEOUT_MS
      : now - opponentSeen > ABANDON_TIMEOUT_MS);
  const opponentOnline =
    mode === "online" && active && presence !== undefined && now > 0 ? !opponentStale : null;

  const meta: GameShellMeta = {
    commentary,
    playerChat,
    opponentStale,
    opponentOnline,
    spectatorCount: game?.spectatorCount ?? 0,
    hint: {
      available: hintAvailable,
      remaining: hintRemaining,
      max: MAX_HINTS_PER_GAME,
      pending: hintApi.pending,
      disabledReason: hintDisabledReason,
      request: hintApi.request,
    },
    rating: ratingRow === null ? null : { delta: ratingRow.delta, after: ratingRow.after },
    playAgainPending,
    onPlayAgain: playAgain,
    onRetryEngine: aiTurn.retryEngine,
    // docs/PRO_TUTOR.md §1: the tutor is offered in EVERY game a member plays or
    // watches. The panel itself decides locked from unlocked (`useTutorAccess`),
    // and the route refuses anything a client-side flag could have got wrong.
    tutor: (
      <TutorPanel
        gameId={gameId}
        fen={controller.board.fen}
        moves={game?.moves ?? []}
        ply={controller.reviewPly ?? (game?.moves.length ?? 0)}
        reviewing={controller.reviewPly !== null}
      />
    ),
    roomSettings: <SettingsForm save={saveSettings} />,
    onRoomOpenChange,
  };

  if (!controller.ready || game === null || view === null) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-3 p-4">
        {controller.error === null ? (
          <>
            <Skeleton className="h-12 w-full" />
            <Skeleton className="aspect-square w-full max-w-[min(100%,70vh)] rounded-xl" />
            <p className="sr-only" role="status">
              Loading the game
            </p>
          </>
        ) : (
          <p role="alert" className="text-sm text-muted-foreground">
            {controller.error}
          </p>
        )}
      </div>
    );
  }

  return <GameShellView controller={shellController} viewerRole={viewerRole} meta={meta} />;
}
