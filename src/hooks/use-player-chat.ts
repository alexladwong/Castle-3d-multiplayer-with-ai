"use client";

import { useCallback, useRef, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { PlayerChatState } from "@/components/game/player-chat";
import type { GameId } from "@/lib/types";

/** Lives above the sidebar/fullscreen swap so drafts and in-flight sends survive. */
export function usePlayerChat(gameId: GameId, enabled: boolean): PlayerChatState | undefined {
  const { isAuthenticated } = useConvexAuth();
  const messages = useQuery(api.playerChat.forGame, enabled && isAuthenticated ? { gameId } : "skip");
  const sendMessage = useMutation(api.playerChat.send);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const send = useCallback(() => {
    const text = draft.trim();
    if (!enabled || !isAuthenticated || messages === undefined || !text || text.length > 1000 || inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    setError(null);
    void sendMessage({ gameId, text }).then(() => {
      setDraft("");
    }).catch(() => {
      setError("Your message was not sent. Try again.");
    }).finally(() => {
      inFlight.current = false;
      setSending(false);
    });
  }, [draft, enabled, isAuthenticated, messages, sendMessage, gameId]);

  return enabled ? {
    messages: messages ?? [], draft, sending, error, loading: messages === undefined,
    onDraftChange: setDraft, send,
  } : undefined;
}
