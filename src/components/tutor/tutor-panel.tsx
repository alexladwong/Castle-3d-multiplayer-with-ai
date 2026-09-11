"use client";
// src/components/tutor/tutor-panel.tsx
// The tutor panel of docs/PRO_TUTOR.md §3: a pure `TutorPanelView` that the dev
// harness can drive from a scripted conversation, and a `TutorPanel` container
// that wires it to `/api/tutor` and to the player's own engine.
//
// The panel is the only writer of `useTutorStore`: it decides which drawing is on
// the board, and both boards read that store through `BoardViewProps.annotations`.
import { useCallback, useEffect, useMemo, useState } from "react";
import { PanelLeftCloseIcon, RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChatMessage } from "@/components/ui-kit";
import type { TutorErrorKind } from "@/hooks/use-tutor-chat";
import { useTutorChat } from "@/hooks/use-tutor-chat";
import { MAX_TUTOR_TURNS_PER_GAME } from "@/lib/constants";
import { useAiStore } from "@/lib/stores/ai-store";
import { useTutorStore } from "@/lib/stores/tutor-store";
import {
  analysisStateOf,
  annotationsForSource,
  latestDrawings,
  type TutorDrawing,
} from "@/lib/tutor/overlay";
import type { TutorUIMessage } from "@/lib/tutor/tools";
import { tutorSuggestions } from "@/lib/tutor/position-context";
import { cn } from "@/lib/ui";
import type { ChatStatus } from "ai";
import { useTutorAccess } from "./access";
import { TutorComposer } from "./tutor-composer";
import { TutorConversation, messageText } from "./tutor-conversation";
import { TutorLocked } from "./tutor-locked";
import "./tutor.css";

/** §3.5, verbatim. */
const COPY = {
  proRequired: "Pro is needed for the tutor.",
  quota: `The tutor has answered ${MAX_TUTOR_TURNS_PER_GAME} questions in this game. Start a new game to keep going.`,
  network: "The tutor did not answer. Try again.",
  // 503 `tutor-unavailable`: the deployment has no usable gateway credential, so
  // there is nothing to retry — the panel says what is true and stops there.
  unavailable: "The tutor is not available right now.",
  engineBusy:
    "The engine is busy with the opponent's move; the tutor will answer without analysis.",
  empty: "Ask me about any position. I will explain and mark the board.",
  thinking: "Tutor is looking at the position…",
  answering: "The tutor is answering.",
} as const;

/* ------------------------------------------------------------------ header */

function Monogram() {
  return (
    <span
      aria-hidden
      className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-[12px] font-semibold text-primary-foreground"
    >
      T
    </span>
  );
}

function ProChip() {
  return (
    <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[12px] font-medium tracking-wide text-primary uppercase">
      Pro
    </span>
  );
}

/* --------------------------------------------------------------- the rail */

export interface TutorTabProps {
  onOpen(): void;
  /** True when the rail's own overlay is already on screen (1024–1279). */
  expanded?: boolean;
  className?: string;
}

/**
 * §3: what the column becomes when it is hidden — a 44 px rail on the left edge
 * that says what it opens and, for a member who has it, that it is a Pro thing.
 */
export function TutorTab({ onOpen, expanded = false, className }: TutorTabProps) {
  const { hasTutor } = useTutorAccess();
  return (
    <button
      type="button"
      data-slot="tutor-tab"
      aria-expanded={expanded}
      onClick={onOpen}
      className={cn(
        "group flex w-11 shrink-0 cursor-pointer flex-col items-center gap-3 py-3",
        "border-r border-border bg-card text-muted-foreground transition-colors",
        "hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        className,
      )}
    >
      <Monogram />
      <span className="tutor-tab-label text-[12px] font-medium">Tutor</span>
      {hasTutor === true ? (
        <span
          aria-hidden
          className="tutor-tab-label rounded-full bg-primary/15 px-1 py-1.5 text-[12px] font-medium text-primary uppercase"
        >
          Pro
        </span>
      ) : null}
    </button>
  );
}

/* ---------------------------------------------------------------- the view */

export interface TutorPanelViewProps {
  messages: TutorUIMessage[];
  status: ChatStatus;
  error: TutorErrorKind | null;
  /** SAN, oldest first — the ply label on a tutor bubble reads from this. */
  moves: string[];
  /** The ply in view: `reviewPly`, or the number of moves played. */
  ply: number;
  /** True while the board is rewound, which changes the context line. */
  reviewing: boolean;
  /** Stored before the locked CTA leaves for `/pro`. */
  gameId: string | null;
  onSend(text: string): void;
  onRetry(): void;
  /** Defaults to closing the panel through the store. */
  onCollapse?(): void;
  /** What the collapse control is called here: "Hide tutor" in the column. */
  collapseLabel?: string;
  className?: string;
}

export function TutorPanelView({
  messages,
  status,
  error,
  moves,
  ply,
  reviewing,
  gameId,
  onSend,
  onRetry,
  onCollapse,
  collapseLabel = "Hide tutor",
  className,
}: TutorPanelViewProps) {
  const { hasTutor } = useTutorAccess();
  const annotations = useTutorStore((state) => state.annotations);
  const sourceId = useTutorStore((state) => state.sourceId);
  const engineStatus = useAiStore((state) => state.engineStatus);
  const downloadPercent = useAiStore((state) => state.downloadPercent);
  const [draft, setDraft] = useState("");

  const close = useCallback(() => {
    if (onCollapse) onCollapse();
    else useTutorStore.getState().setPanelOpen(false);
  }, [onCollapse]);

  /* ------------------------------------------------ what the board shows */

  const latest = useMemo(() => latestDrawings(messages), [messages]);
  // The newest answer owns the board while it is still arriving, which is why the
  // key counts the drawings rather than naming the message: a second chip landing
  // mid-answer has to reach the board too.
  const latestKey =
    latest === null
      ? null
      : `${latest.messageId}:${latest.drawings.filter((d) => d.state === "drawn").length}`;
  useEffect(() => {
    if (latest === null || latestKey === null) return;
    // ONE resolver decides what a source id puts on the board — the pure, unit-tested
    // `annotationsForSource` — rather than this effect merging inline and the reducer
    // being tested beside it. A message id means "everything that answer drew"; a
    // drawing id means that one chip.
    const annotations = annotationsForSource(messages, latest.messageId);
    if (annotations === null) return;
    const answer = messages.find((message) => message.id === latest.messageId);
    const origin = moves.slice(0, answer?.metadata?.ply ?? ply);
    useTutorStore.getState().showAutomatic(annotations, latest.messageId, `${gameId}:${latestKey}`, origin, moves);
  }, [latest, latestKey, messages, gameId, moves, ply]);

  const suggestions = useMemo(() => tutorSuggestions(moves, ply, messages), [moves, ply, messages]);

  const toggleDrawing = useCallback(
    (drawing: TutorDrawing) => {
      const store = useTutorStore.getState();
      // Pressing the one pressed chip takes the board back to clean; pressing a chip
      // while the whole answer is showing narrows the board to that drawing.
      if (store.sourceId === drawing.id) {
        store.clearAnnotations();
        return;
      }
      const annotations = annotationsForSource(messages, drawing.id);
      if (annotations !== null) store.setAnnotations(annotations, drawing.id, moves.slice(0, ply));
    },
    [messages, moves, ply],
  );

  /* --------------------------------------------------------------- states */

  const last = messages.at(-1);
  const analysis = last?.role === "assistant" ? analysisStateOf(last) : "idle";
  const streaming = status === "submitted" || status === "streaming";
  const answered = last?.role === "assistant" && messageText(last).length > 0;
  const thinking = streaming && (analysis === "running" || !answered);
  const engineNote = analysis === "engine-busy" || analysis === "unavailable";

  const moveNumber = Math.max(1, Math.ceil(ply / 2));
  const context = reviewing
    ? `Reviewing move ${moveNumber}`
    : `Live position · move ${moveNumber}`;

  const disabledReason =
    error === "quota"
      ? COPY.quota
      : error === "unavailable"
        ? COPY.unavailable
        : streaming
          ? COPY.answering
          : null;

  const send = useCallback((text = draft) => {
    const question = text.trim();
    if (question.length === 0 || disabledReason !== null || hasTutor !== true) return;
    setDraft("");
    onSend(question);
  }, [draft, onSend, disabledReason, hasTutor]);

  /* ---------------------------------------------------------------- shell */

  const header = (
    <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
      <Monogram />
      <h2 className="text-[15px] leading-tight font-semibold text-foreground">Tutor</h2>
      {hasTutor === true ? <ProChip /> : null}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {annotations !== null ? (
          <Button
            size="sm"
            variant="ghost"
            className="pointer-coarse:min-h-11"
            onClick={() => useTutorStore.getState().clearAnnotations()}
          >
            Clear board notes
          </Button>
        ) : null}
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={collapseLabel}
          className="pointer-coarse:size-11"
          onClick={close}
        >
          <PanelLeftCloseIcon aria-hidden />
        </Button>
      </div>
    </header>
  );

  let body: React.ReactNode;
  if (hasTutor === undefined) {
    // Clerk has not answered yet. A skeleton, never the locked state: showing the
    // wall to a member who paid for the room would be the worse wrong guess.
    body = (
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4" aria-busy>
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-10 w-3/4 rounded-xl" />
        <p className="sr-only" role="status">
          Checking your membership
        </p>
      </div>
    );
  } else if (hasTutor === false || error === "pro-required") {
    body = <TutorLocked gameId={gameId} notice={error === "pro-required" ? COPY.proRequired : null} />;
  } else {
    body = (
      <>
        <TutorConversation
          messages={messages}
          moves={moves}
          ply={ply}
          sourceId={sourceId}
          onToggleDrawing={toggleDrawing}
        >
          {messages.length === 0 ? (
            <ChatMessage variant="ai" personaInitial="T">
              {COPY.empty}
            </ChatMessage>
          ) : null}

          {engineNote ? (
            <ChatMessage variant="system" data-testid="tutor-engine-note">
              {COPY.engineBusy}
            </ChatMessage>
          ) : null}

          {thinking ? (
            <ChatMessage variant="ai" personaInitial="T" data-testid="tutor-thinking">
              <span className="flex flex-wrap items-center gap-2">
                <span>{COPY.thinking}</span>
                {analysis === "running" ? (
                  <span className="tabular font-mono text-[12px] text-muted-foreground">
                    {engineStatus === "loading" && downloadPercent > 0
                      ? `engine ${Math.round(downloadPercent)}%`
                      : "engine"}
                  </span>
                ) : null}
              </span>
            </ChatMessage>
          ) : null}

          {error === "network" ? (
            <li className="flex flex-col items-start gap-2 rounded-xl bg-bg-elevated p-3">
              <p role="alert" className="text-[13px] text-foreground">
                {COPY.network}
              </p>
              <Button size="sm" variant="outline" onClick={onRetry}>
                <RotateCcwIcon aria-hidden />
                Try again
              </Button>
            </li>
          ) : null}

          {error === "quota" ? (
            <ChatMessage variant="system" role="alert">
              {COPY.quota}
            </ChatMessage>
          ) : null}

          {error === "unavailable" ? (
            <ChatMessage variant="system" role="alert">
              {COPY.unavailable}
            </ChatMessage>
          ) : null}
        </TutorConversation>

        <TutorComposer
          value={draft}
          onChange={setDraft}
          onSend={send}
          suggestions={suggestions}
          context={context}
          disabledReason={disabledReason}
        />
      </>
    );
  }

  return (
    <section
      data-slot="tutor-panel"
      aria-label="Tutor"
      className={cn("flex min-h-0 min-w-0 flex-1 flex-col bg-card", className)}
    >
      {header}
      {body}
    </section>
  );
}

/* ----------------------------------------------------------- the container */

export interface TutorPanelProps
  extends Pick<TutorPanelViewProps, "moves" | "ply" | "reviewing" | "collapseLabel"> {
  gameId: string;
  /** FEN of the position in view — what the engine is asked about. */
  fen: string;
  onCollapse?(): void;
}

export function TutorPanel({ gameId, fen, ply, moves, reviewing, ...rest }: TutorPanelProps) {
  const { hasTutor } = useTutorAccess();
  // `enabled` false keeps the hook inert: no request, and no engine download.
  const chat = useTutorChat({ gameId, ply, fen, enabled: hasTutor === true });

  return (
    <TutorPanelView
      {...rest}
      gameId={gameId}
      moves={moves}
      ply={ply}
      reviewing={reviewing}
      messages={chat.messages}
      status={chat.status}
      error={chat.error}
      onSend={chat.send}
      onRetry={chat.retry}
    />
  );
}
