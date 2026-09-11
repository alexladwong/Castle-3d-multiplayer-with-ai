"use client";
// src/app/dev/game/harness.tsx  [U2]
// The client half of the §8 harness: it seeds the two client stores from the
// chosen scenario and renders the real `GameShellView` with a mock controller.
// No Clerk, no Convex, no network.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { GameShellView, type GameShellMeta } from "@/components/game/game-shell-view";
import { TutorAccessProvider } from "@/components/tutor/access";
import { TutorPanelView } from "@/components/tutor/tutor-panel";
import type { PlayerChatMessage } from "@/components/game/player-chat";
import type { ChatCommentaryRow } from "@/components/ai/chat-model";
import { MAX_HINTS_PER_GAME } from "@/lib/constants";
import { errorCopyFor } from "@/lib/errors";
import {
  MOCK_SCENARIOS,
  MOCK_SCENARIO_IDS,
  isMockScenarioId,
  useMockGameController,
} from "@/lib/mock/game-controller";
import type { TutorUIMessage } from "@/lib/tutor/tools";
import { useAiStore } from "@/lib/stores/ai-store";
import { useUiStore } from "@/lib/stores/ui-store";
import { ROOM_ORDER } from "@/lib/rooms";
import { cn, focusRing } from "@/lib/ui";

const DEFAULT_SCENARIO = "ai-midgame";

/** A collapsed pill in the corner so it never covers the layout being reviewed.
 *  Rendered open/closed from state rather than with <details>: a closed
 *  <details> keeps its contents laid out, and a dev control must not be part of
 *  what an audit of this screen measures. */
function ScenarioSwitcher({ current }: { current: string }) {
  const [open, setOpen] = useState(false);
  return (
    // Top-centre from 640 up, not top-left: the §5.2 focus HUD puts its player chip
    // in the top-left corner and a dev control must never sit on top of the thing
    // under review.
    //
    // BELOW 640 it moves out of the header band entirely, to the bottom-left above
    // the mobile bar. It used to stay in the header's row, where at 390 it landed on
    // "Sign in" and clipped whatever was under it — which made every phone-width
    // harness screenshot unreadable in its top 56px, and the harness exists to be
    // looked at. The bottom-left corner is the one place at 390 that carries neither
    // game chrome nor the bar's five buttons.
    <div
      className={cn(
        "fixed z-60 text-[12px]",
        "bottom-24 left-3",
        "sm:top-1.5 sm:bottom-auto sm:left-1/2 sm:-translate-x-1/2",
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex min-h-7 cursor-pointer items-center rounded-full bg-card px-2.5 py-1",
          "font-mono text-foreground shadow-soft pointer-coarse:min-h-9",
          focusRing,
        )}
      >
        ◆ {current}
      </button>
      {open ? (
        <ul className="absolute bottom-full left-0 mb-1 flex w-56 flex-col gap-0.5 rounded-xl bg-card p-1.5 shadow-soft sm:static sm:mt-1 sm:mb-0">
          {MOCK_SCENARIO_IDS.map((id) => (
            <li key={id}>
              <Link
                prefetch={false}
                href={`/dev/game?scenario=${id}`}
                aria-current={id === current ? "page" : undefined}
                className={cn(
                  "block rounded-lg px-2 py-1.5",
                  focusRing,
                  id === current
                    ? "font-semibold text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="block font-medium">{MOCK_SCENARIOS[id].label}</span>
                <span className="block text-[12px] opacity-80">{MOCK_SCENARIOS[id].summary}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function GameHarness({ scenario: requested }: { scenario: string | null }) {
  const id = isMockScenarioId(requested) ? requested : DEFAULT_SCENARIO;
  const scenario = MOCK_SCENARIOS[id];
  const controller = useMockGameController(scenario);

  // §8: the harness fakes Clerk's answer from the scenario and feeds the scripted
  // conversation straight into the PURE view. Nothing here talks to /api/tutor —
  // sending appends the member's own bubble so the composer, the "you" bubble and
  // the auto-scroll are the real ones.
  const tutor = scenario.tutor ?? null;
  const [playerDraft, setPlayerDraft] = useState("");
  const [playerMessages, setPlayerMessages] = useState<PlayerChatMessage[]>([]);
  // Adjusted during render rather than in an effect (the same rule the shell's own
  // `usePresenceChips` follows): switching scenario is a new conversation.
  const [conversation, setConversation] = useState<{ id: string; messages: TutorUIMessage[] }>({
    id: scenario.id,
    messages: tutor?.messages ?? [],
  });
  if (conversation.id !== scenario.id) {
    setConversation({ id: scenario.id, messages: tutor?.messages ?? [] });
  }
  const askTutor = useCallback((text: string) => {
    setConversation((current) => ({
      ...current,
      messages: [
        ...current.messages,
        { id: `harness-${current.messages.length}`, role: "user", parts: [{ type: "text", text }] },
      ],
    }));
  }, []);

  // Seed the client stores. These are plain zustand writes, not React state, so
  // they are legal inside an effect (§D.12 rule 6).
  useEffect(() => {
    const ai = useAiStore.getState();
    ai.resetTurn();
    ai.setPhase(scenario.ai.phase);
    ai.setEngineStatus(scenario.ai.engineStatus);
    ai.setDownloadPercent(scenario.ai.downloadPercent);
    ai.setHint(scenario.ai.hint);
    ai.setHintPending(false);
    useUiStore.getState().setLayoutMode(scenario.layoutMode);
  }, [scenario]);

  // Development-only room/view links for visual checks of the real game shell.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = ROOM_ORDER.find((id) => id === params.get("room"));
    if (room) useUiStore.getState().setRoomPreset(room);
    const view = params.get("view");
    if (view === "2d" || view === "3d") useUiStore.getState().setBoardView(view);
  }, []);

  const requestHint = useCallback(() => {
    useAiStore.getState().setHintPending(true);
    window.setTimeout(() => {
      const ai = useAiStore.getState();
      ai.setHintPending(false);
      ai.setHint({
        san: "O-O",
        text: "Castle. Your king is still in the middle and the d-file is about to open.",
        source: "fallback",
      });
    }, 1200);
  }, []);

  const commentary: ChatCommentaryRow[] = scenario.commentary.map((row, index) => ({
    id: `mock-commentary-${index}`,
    ply: row.ply,
    text: row.text,
    source: row.source,
    persona: row.persona,
  }));

  const remaining = Math.max(0, MAX_HINTS_PER_GAME - scenario.hintsUsed);
  const humanToMove =
    scenario.aiColor !== undefined &&
    controller.view !== null &&
    controller.view.game.turn !== scenario.aiColor;

  const meta: GameShellMeta = {
    commentary,
    playerChat: scenario.mode === "online" && scenario.viewerRole !== "spectator" ? {
      messages: playerMessages,
      draft: playerDraft,
      loading: false,
      sending: false,
      error: null,
      onDraftChange: setPlayerDraft,
      send: () => {
        const text = playerDraft.trim();
        if (!text || text.length > 1000) return;
        setPlayerMessages((messages) => [...messages, {
          id: `player-${messages.length}`, text, mine: true, createdAt: Date.now(), sequence: messages.length,
        }]);
        setPlayerDraft("");
      },
    } : undefined,
    opponentStale: false,
    opponentOnline: scenario.mode === "online" ? true : null,
    spectatorCount: scenario.spectatorCount,
    hint: {
      available: scenario.mode === "ai" && scenario.viewerRole !== "spectator",
      remaining,
      max: MAX_HINTS_PER_GAME,
      pending: false,
      disabledReason:
        remaining === 0
          ? errorCopyFor("hint-limit", "game")
          : humanToMove
            ? null
            : "Wait for your turn to ask for a hint.",
      request: requestHint,
    },
    rating: scenario.rating,
    playAgainPending: false,
    tutor:
      tutor === null ? undefined : (
        <TutorPanelView
          messages={conversation.messages}
          // §8: the scenario decides which of §3's states the panel is standing in.
          status={tutor.status ?? "ready"}
          error={tutor.error ?? null}
          moves={controller.view?.game.moves ?? scenario.moves}
          ply={controller.reviewPly ?? controller.view?.game.moves.length ?? scenario.moves.length}
          reviewing={controller.reviewPly !== null}
          gameId={`mock-${scenario.id}`}
          onSend={askTutor}
          onRetry={() => undefined}
        />
      ),
    onPlayAgain: () => {
      window.location.reload();
    },
    onRetryEngine: () => {
      useAiStore.getState().setEngineStatus("ready");
    },
    roomSettings: (
      <p className="text-[13px] text-muted-foreground">
        The room picker needs a signed-in player, so it is stubbed out in this harness.
        Its drawer, header and scroll behaviour are the real ones.
      </p>
    ),
  };

  return (
    <>
      <ScenarioSwitcher current={id} />
      <TutorAccessProvider value={{ hasTutor: tutor === null ? undefined : tutor.access === "pro" }}>
        {/* A scenario switch is a different game entirely — the mock controller
            seeds its state once, and the tutor panel its conversation once, so the
            harness remounts the screen rather than trying to reconcile the two. */}
        <GameShellView
          key={scenario.id}
          controller={controller}
          viewerRole={scenario.viewerRole}
          meta={meta}
        />
      </TutorAccessProvider>
    </>
  );
}
