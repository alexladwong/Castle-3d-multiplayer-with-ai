"use client";
// src/hooks/use-tutor-chat.ts
// The tutor's side of the conversation (docs/PRO_TUTOR.md §6), verified against
// @ai-sdk/react 4.0.99 and ai 7.0.95:
//
//   - `useChat<TutorUIMessage>` with a `DefaultChatTransport` pointed at /api/tutor;
//   - `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls`, so the
//     model's turn continues by itself once the browser has answered a tool call;
//   - `onToolCall` runs `requestAnalysis` HERE, in the player's browser, on the
//     Stockfish worker the game already owns, and answers with `addToolOutput`
//     WITHOUT awaiting it inside the callback (ai's own rule — awaiting there
//     stops the automatic re-send from ever firing).
//
// Nothing is fetched while `enabled` is false: a member without the tutor feature
// never reaches the route, and never pays for the engine's download either.
import { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
  type ChatStatus,
} from "ai";
import { linesToCandidates } from "@/lib/engine/candidates";
import { useStockfish } from "@/lib/engine/use-stockfish";
import {
  requestAnalysisInput,
  type RequestAnalysisOutput,
  type TutorUIMessage,
} from "@/lib/tutor/tools";

/** The route the panel talks to. Gated server-side; 402 without the feature. */
const TUTOR_API = "/api/tutor";

/**
 * How long the tutor waits for the engine before answering without it.
 *
 * `StockfishEngine.search` QUEUES rather than pre-empting, so a request made while
 * the opponent is thinking sits behind that search. Six seconds is the point at
 * which a silent panel starts to feel broken; past it the tutor answers from the
 * position alone and the panel says the engine was busy.
 */
const ANALYSIS_WAIT_MS = 6_000;
/** The engine's own budget once it has the worker. */
const ANALYSIS_SEARCH_MS = 3_000;
/** Candidate generation is always full strength (see engine/candidates.ts). */
const ANALYSIS_SKILL = 20;
/** The tool's documented defaults, applied when the model omits them. */
const ANALYSIS_FALLBACK = { depth: 16, multiPv: 3 } as const;

/**
 * What went wrong. §3.5's three states plus `unavailable`, which the route answers
 * (503 `tutor-unavailable`) when the deployment has no usable AI Gateway credential:
 * a retry would fail identically, so the panel says so instead of offering one.
 */
export type TutorErrorKind = "pro-required" | "quota" | "network" | "unavailable";

export interface TutorChatPosition {
  gameId: string;
  /** The ply the board is showing: `reviewPly`, or the live move count. */
  ply: number;
  /** FEN of that position — for the engine only; the route derives its own. */
  fen: string;
}

export interface UseTutorChatOptions extends TutorChatPosition {
  /** True only for a Pro member. False keeps the hook completely inert. */
  enabled: boolean;
  /** Seeds the conversation (the dev harness, tests). Read once, at mount. */
  initialMessages?: TutorUIMessage[];
}

export interface UseTutorChat {
  messages: TutorUIMessage[];
  status: ChatStatus;
  error: TutorErrorKind | null;
  /** Ask a question. Ignores blanks and a locked panel. */
  send(text: string): void;
  /** After an error: forget it and ask again. */
  retry(): void;
  /** Stop a streaming answer. */
  stop(): void;
}

/**
 * The transport throws `new Error(await response.text())` for any non-OK response
 * (ai 7 `HttpChatTransport`), so the route's JSON body IS the message. The codes
 * are the ones `src/lib/tutor/guard.ts` answers with: 402 `pro-required`, 429
 * `quota` (Convex's own `tutor-limit` is matched too, in case it ever surfaces raw).
 */
function classify(error: Error | undefined): TutorErrorKind | null {
  if (error === undefined) return null;
  const body = error.message;
  if (body.includes("pro-required")) return "pro-required";
  if (body.includes("quota") || body.includes("tutor-limit")) return "quota";
  if (body.includes("tutor-unavailable")) return "unavailable";
  return "network";
}

/** The live values the long-lived callbacks below read through. */
interface TutorChatBox extends TutorChatPosition {
  enabled: boolean;
}

export function useTutorChat({
  gameId,
  ply,
  fen,
  enabled,
  initialMessages,
}: UseTutorChatOptions): UseTutorChat {
  // The `Chat` instance is built once, so every callback it keeps would otherwise
  // close over the first render's position. This box carries the live one; it is
  // written in an effect and read only from callbacks, never during render.
  const box = useRef<TutorChatBox>({ gameId, ply, fen, enabled });
  useEffect(() => {
    box.current = { gameId, ply, fen, enabled };
  }, [gameId, ply, fen, enabled]);

  // The engine is a 7 MB download, so it is not fetched because a member HAS the
  // tutor — only once they have actually asked it something. `runSearch` awaits
  // `init()` internally, so a first question that arrives before the wasm is warm
  // simply waits, and the six-second cap below answers without lines if it must.
  const [asked, setAsked] = useState((initialMessages?.length ?? 0) > 0);
  // Refcounted singleton: in an AI game this is the very worker the opponent
  // uses, which is why a queued search has to be capped rather than assumed fast.
  const { search } = useStockfish(enabled && asked);

  // Set from an effect once `useChat` has returned; `onToolCall` cannot reach
  // `chat.addToolOutput` directly because it is passed INTO the same call.
  const answer = useRef<(output: RequestAnalysisOutput, toolCallId: string) => void>(() => {});

  const runAnalysis = useCallback(
    async (depth: number, multiPv: number): Promise<RequestAnalysisOutput> => {
      const position = box.current.fen;
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), ANALYSIS_WAIT_MS);
      try {
        const result = await search({
          fen: position,
          depth,
          multiPv,
          skillLevel: ANALYSIS_SKILL,
          timeoutMs: ANALYSIS_SEARCH_MS,
          signal: controller.signal,
        });
        return { fen: position, lines: linesToCandidates(position, result.lines), note: "ok" };
      } catch {
        // Aborted = the worker was still busy with the opponent's move; anything
        // else = there is no usable engine here. Either way the tutor answers.
        return {
          fen: position,
          lines: [],
          note: controller.signal.aborted ? "engine-busy" : "engine-unavailable",
        };
      } finally {
        window.clearTimeout(timer);
      }
    },
    [search],
  );

  // The game and the ply travel with every request as `ChatRequestOptions.body`
  // at the call sites below, rather than as the transport's `body` resolvable:
  // the resolvable would have to read the box during render, which this repo's
  // lint rules (rightly) forbid.
  const [transport] = useState(
    () => new DefaultChatTransport<TutorUIMessage>({ api: TUTOR_API }),
  );

  const chat = useChat<TutorUIMessage>({
    messages: initialMessages,
    transport,
    // Once the browser has answered every open tool call, the turn continues.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onToolCall: ({ toolCall }) => {
      // A dynamic tool is one this client knows nothing about; the loop handles it.
      if (toolCall.dynamic) return;
      if (toolCall.toolName !== "requestAnalysis") return;
      const { toolCallId } = toolCall;
      // The zod schema is the contract AND the parser: it applies the documented
      // defaults rather than trusting the model to send them. `toolCall.input` is
      // `unknown` here because the dynamic arm of `InferUIMessageToolCall` carries
      // a plain `string` tool name that no narrowing can remove.
      const parsed = requestAnalysisInput.safeParse(toolCall.input);
      const { depth, multiPv } = parsed.success ? parsed.data : ANALYSIS_FALLBACK;
      // NOT awaited: an awaited `addToolOutput` inside `onToolCall` never lands.
      void runAnalysis(depth, multiPv).then((output) => {
        answer.current(output, toolCallId);
      });
    },
  });

  const { sendMessage, regenerate, clearError, stop, addToolOutput } = chat;
  useEffect(() => {
    answer.current = (output, toolCallId) => {
      void addToolOutput({
        tool: "requestAnalysis",
        toolCallId,
        output,
        // Carried through the automatic re-send that follows this output.
        options: { body: { gameId: box.current.gameId, ply: box.current.ply } },
      });
    };
  }, [addToolOutput]);

  const send = useCallback(
    (text: string) => {
      const question = text.trim();
      const { enabled: open, gameId: game, ply: at } = box.current;
      if (question.length === 0 || !open) return;
      setAsked(true);
      void sendMessage({ text: question }, { body: { gameId: game, ply: at } });
    },
    [sendMessage],
  );

  const retry = useCallback(() => {
    if (!box.current.enabled) return;
    clearError();
    void regenerate({ body: { gameId: box.current.gameId, ply: box.current.ply } });
  }, [clearError, regenerate]);

  const halt = useCallback(() => {
    void stop();
  }, [stop]);

  return {
    messages: chat.messages,
    status: chat.status,
    error: classify(chat.error),
    send,
    retry,
    stop: halt,
  };
}
