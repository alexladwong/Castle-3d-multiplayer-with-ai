"use client";
// src/components/ui-kit/chat-list.tsx  [U0]
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, useReducedMotion } from "@/lib/ui";

/** How close to the bottom still counts as "pinned", in px. */
const BOTTOM_SLACK = 24;

export interface ChatListProps extends Omit<React.ComponentProps<"div">, "children"> {
  /** `ChatMessage` elements — the list renders an <ol>, they render <li>. */
  children: React.ReactNode;
  /** Bump whenever a message is appended; drives the auto-scroll and the pill. */
  messageCount: number;
  /** Accessible name for the log region. */
  label?: string;
  /** Composer area, pinned below the scroll region. */
  footer?: React.ReactNode;
  /** Shown when there are no messages. */
  empty?: React.ReactNode;
}

/**
 * The chat scroll region (§5.1): follows the newest message unless the reader
 * scrolled up, in which case a "New message" pill offers the jump back.
 */
export function ChatList({
  children,
  messageCount,
  label = "Conversation",
  footer,
  empty,
  className,
  ...props
}: ChatListProps) {
  const reduced = useReducedMotion();
  const scrollerRef = useRef<HTMLOListElement | null>(null);
  const seenCount = useRef(messageCount);
  const [pinned, setPinned] = useState(true);
  const [hasNew, setHasNew] = useState(false);

  const scrollToBottom = useCallback(
    (smooth: boolean) => {
      const el = scrollerRef.current;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior: smooth && !reduced ? "smooth" : "auto" });
    },
    [reduced],
  );

  const handleScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_SLACK;
    setPinned(atBottom);
    if (atBottom) setHasNew(false);
  }, []);

  useEffect(() => {
    if (messageCount === seenCount.current) return;
    const grew = messageCount > seenCount.current;
    seenCount.current = messageCount;
    if (pinned) scrollToBottom(true);
    else if (grew) setHasNew(true);
  }, [messageCount, pinned, scrollToBottom]);

  return (
    <div className={cn("relative flex min-h-0 flex-1 flex-col", className)} {...props}>
      {/* NOT a live region. Every row that lands here for a MOVE is already spoken
          by the game's sr-only move announcer, so announcing the list too read the
          same move twice — once as notation, once as a chat line. The owner of the
          chat decides what is worth interrupting for (see `GameChat`, which
          announces the opponent's messages and nothing else). */}
      <ol
        ref={scrollerRef}
        onScroll={handleScroll}
        aria-label={label}
        // DESIGN.md Elevation: the chat scroll region is a cellar well that sinks
        // back from the walnut sidebar, so the opponent's walnut bubbles read as
        // sitting IN it rather than on it.
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-bg-sunken p-3"
      >
        {messageCount === 0 && empty ? (
          <li className="m-auto max-w-[80%] text-center text-[13px] text-muted-foreground">
            {empty}
          </li>
        ) : (
          children
        )}
      </ol>

      {hasNew ? (
        <Button
          size="sm"
          variant="secondary"
          className="absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full shadow-soft"
          onClick={() => {
            scrollToBottom(true);
            setHasNew(false);
            setPinned(true);
          }}
        >
          New message
          <ArrowDownIcon aria-hidden />
        </Button>
      ) : null}

      {footer ? <div className="border-t border-border p-3">{footer}</div> : null}
    </div>
  );
}
