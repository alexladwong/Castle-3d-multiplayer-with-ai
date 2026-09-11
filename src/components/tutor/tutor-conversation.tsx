"use client";
// src/components/tutor/tutor-conversation.tsx
// What the tutor and the member have said so far (docs/PRO_TUTOR.md §3.3), as a
// `role="log"`: newest at the bottom, following the newest line unless the reader
// has scrolled up to re-read something.
//
// The bubbles are the game chat's own components, so the tutor sounds like it
// belongs to the same room: walnut for the tutor with a lettered disc and a mono
// ply label, seam with brass text on the right for the member.
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatMessage } from "@/components/ui-kit";
import { drawingsFromMessage, type TutorDrawing } from "@/lib/tutor/overlay";
import type { TutorUIMessage } from "@/lib/tutor/tools";
import { cn, useReducedMotion } from "@/lib/ui";
import { AnnotationChip } from "./annotation-chip";

/** How close to the bottom still counts as "reading the newest line", in px. */
const BOTTOM_SLACK = 24;

export interface TutorConversationProps {
  messages: TutorUIMessage[];
  /** SAN, oldest first — turns a ply into "after 12…Nf6". */
  moves: string[];
  /** The ply the board is showing, for a message that carries no ply of its own. */
  ply: number;
  /** The drawing the board is showing, as `useTutorStore.sourceId`. */
  sourceId: string | null;
  onToggleDrawing(drawing: TutorDrawing): void;
  /** Rendered under the last message: the thinking row, an error, a notice. */
  children?: React.ReactNode;
  className?: string;
}

/** "after 12…Nf6" — the half-move the answer is about, in the scoresheet's own hand. */
export function plyLabel(moves: string[], ply: number): string | undefined {
  if (ply <= 0) return "from the start";
  const san = moves[ply - 1];
  if (san === undefined) return undefined;
  const number = Math.ceil(ply / 2);
  return `after ${number}${ply % 2 === 1 ? "." : "…"}${san}`;
}

/**
 * A message's ply, when the route stamped one on it (`messageMetadata` in
 * src/app/api/tutor/route.ts). Typed through `TutorMessageMetadata`, but still
 * checked: the value crosses the wire, and a harness message carries none.
 */
function plyOf(message: TutorUIMessage): number | null {
  const ply = message.metadata?.ply;
  return typeof ply === "number" ? ply : null;
}

/**
 * The plain text of a message — the tutor's words without its drawings.
 *
 * Joined with a blank line, not with nothing: a turn that draws mid-answer streams
 * one text part per STEP, and concatenating them ran the last sentence of one step
 * into the first of the next ("…quick castling.Another common plan is…", seen live
 * on 2026-09-11). A step boundary is a paragraph boundary, and the bubble renders
 * whitespace as written.
 */
export function messageText(message: TutorUIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text.trim())
    .filter((text) => text.length > 0)
    .join("\n\n")
    .trim();
}

export function TutorConversation({
  messages,
  moves,
  ply,
  sourceId,
  onToggleDrawing,
  children,
  className,
}: TutorConversationProps) {
  const reduced = useReducedMotion();
  const scroller = useRef<HTMLDivElement | null>(null);
  const seen = useRef(messages.length);
  const [pinned, setPinned] = useState(true);
  const [behind, setBehind] = useState(false);

  const toBottom = useCallback(
    (smooth: boolean) => {
      const el = scroller.current;
      if (el === null) return;
      el.scrollTo({ top: el.scrollHeight, behavior: smooth && !reduced ? "smooth" : "auto" });
    },
    [reduced],
  );

  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (el === null) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_SLACK;
    setPinned(atBottom);
    if (atBottom) setBehind(false);
  }, []);

  // The tutor streams, so the list grows on nearly every frame of an answer:
  // following it means re-pinning as it grows, not once when it arrives. Only a
  // NEW message glides; the first paint and every stream frame jump, because a
  // smooth scroll racing a growing bubble never catches up.
  useEffect(() => {
    const grew = messages.length > seen.current;
    seen.current = messages.length;
    if (pinned) toBottom(grew);
    else if (grew) setBehind(true);
  }, [messages, pinned, toBottom]);

  return (
    <div className={cn("relative flex min-h-0 flex-1 flex-col", className)}>
      <div
        ref={scroller}
        onScroll={onScroll}
        role="log"
        aria-label="Tutor conversation"
        // The scrollport is a cellar well that sinks back from the walnut panel,
        // so the tutor's walnut bubbles read as sitting IN it (DESIGN.md depth).
        className="min-h-0 flex-1 overflow-y-auto bg-bg-sunken p-3"
      >
        <ol className="flex flex-col gap-3">
          {messages.map((message) => {
            if (message.role === "user") {
              return (
                <ChatMessage key={message.id} variant="you">
                  {messageText(message)}
                </ChatMessage>
              );
            }
            const text = messageText(message);
            const drawings = drawingsFromMessage(message);
            if (text.length === 0 && drawings.length === 0) return null;
            const at = plyOf(message) ?? ply;
            return (
              <ChatMessage
                key={message.id}
                variant="ai"
                personaInitial="T"
                moveLabel={plyLabel(moves, at)}
                data-testid="tutor-message"
              >
                {text.length > 0 ? <p className="whitespace-pre-wrap">{text}</p> : null}
                {drawings.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {drawings.map((drawing) => (
                      <AnnotationChip
                        key={drawing.id}
                        drawing={drawing}
                        active={sourceId === drawing.id || sourceId === drawing.messageId}
                        onToggle={onToggleDrawing}
                      />
                    ))}
                  </div>
                ) : null}
              </ChatMessage>
            );
          })}
          {children}
        </ol>
      </div>

      {behind ? (
        <Button
          size="sm"
          variant="secondary"
          className="absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full shadow-soft"
          onClick={() => {
            toBottom(true);
            setBehind(false);
            setPinned(true);
          }}
        >
          Newest answer
          <ArrowDownIcon aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}
