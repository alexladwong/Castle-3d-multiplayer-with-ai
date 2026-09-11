// src/app/api/tutor/route.ts — docs/PRO_TUTOR.md §5
//
// The tutor's turn. Everything that can refuse the request lives in
// `src/lib/tutor/guard.ts` (and is unit-tested there); what is left here is the one
// thing that cannot be unit-tested — the model call and the stream back.
//
// Runtime: Node, which is the App Router's default in this version of Next (the Edge
// runtime is deprecated; `node_modules/next/dist/docs/01-app/03-api-reference/
// 03-file-conventions/02-route-segment-config/runtime.md`), so there is no `runtime`
// export to drift out of date. `maxDuration` is 60 s: a tutor turn can take six steps,
// and two of them wait on the player's browser running Stockfish.
//
// `/api/tutor` is deliberately NOT in `src/proxy.ts`'s protected prefixes: `auth.protect()`
// answers 404 for API requests, which would hide "not signed in" behind "no such route".
// The handler gates itself and answers 401, exactly like `/api/ai`.
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  safeValidateUIMessages,
  stepCountIs,
  streamText,
  toUIMessageStream,
} from "ai";
import { guardTutorRequest, tutorErrorResponse } from "@/lib/tutor/guard";
import { buildTutorContext, TUTOR_SYSTEM_PROMPT } from "@/lib/tutor/system";
import { createTutorTools, type TutorUIMessage } from "@/lib/tutor/tools";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** What the panel shows when the model or the gateway fails mid-answer (§3.5). */
const STREAM_ERROR_MESSAGE = "The tutor did not answer. Try again.";

export async function POST(request: Request): Promise<Response> {
  const guard = await guardTutorRequest(request);
  if (!guard.ok) return tutorErrorResponse(guard);

  // Per request, so `showLine` validates against the position actually in view.
  const tools = createTutorTools({ fen: guard.fen });

  // The shape check in the guard only proved `messages` is an array. This is the
  // check that knows what a tool part may contain, so it needs the tools.
  const validated = await safeValidateUIMessages<TutorUIMessage>({
    messages: guard.messages,
    tools,
  });
  if (!validated.success) {
    return Response.json(
      { error: "invalid-body" },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }
  const messages = validated.data;

  // `convertToModelMessages` throws on a conversation the SDK cannot express as model
  // messages — a tool call left without an output, say. That is a bug in the panel
  // rather than something a member can type, but it must not surface as a 500.
  let modelMessages: Awaited<ReturnType<typeof convertToModelMessages>>;
  try {
    modelMessages = await convertToModelMessages(messages);
  } catch (error) {
    console.error("[tutor] could not convert the conversation", error);
    return Response.json(
      { error: "invalid-body" },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }

  const result = streamText({
    // Resolved by the guard with its credential attached (model.ts): the project's
    // AI_GATEWAY_API_KEY, or the OIDC token this request arrived with.
    model: guard.model,
    // The context block is built from the game document, never from the body.
    system: `${TUTOR_SYSTEM_PROMPT}\n\n${buildTutorContext({
      view: guard.view,
      ply: guard.ply,
      fen: guard.fen,
    })}`,
    messages: modelMessages,
    tools,
    // requestAnalysis (client) → answer → at most two drawings → the written answer.
    // Six steps is room for that with one correction, and a hard stop on a loop.
    stopWhen: stepCountIs(6),
    abortSignal: request.signal,
  });

  // Un-awaited on purpose (§5.4): it keeps the model stream draining independently of
  // whoever is reading the response, so a slow or stalled reader cannot leave the tool
  // loop half-run. `result.stream` tees, so this consumer and the UI stream below get
  // their own copies. A member who closes the panel aborts `request.signal` and the
  // turn stops there — the conversation is not persisted, so finishing it buys nothing.
  void result.consumeStream();

  return createUIMessageStreamResponse({
    // `result.toUIMessageStreamResponse()` is deprecated in ai 7 (migration guide
    // 7.0, §"toUIMessageStreamResponse"); this is the replacement pair.
    stream: toUIMessageStream<typeof tools, TutorUIMessage>({
      stream: result.stream,
      tools,
      originalMessages: messages,
      // The ply the answer is ABOUT, so the panel's mono label stays true after the
      // member rewinds the board (`plyOf` in tutor-conversation.tsx reads it).
      messageMetadata: () => ({ ply: guard.ply }),
      onError: (error) => {
        // The default masks the error entirely; the panel needs one line it can show,
        // and the detail belongs in the server log, not in the member's browser.
        console.error("[tutor] stream error", error);
        return STREAM_ERROR_MESSAGE;
      },
    }),
  });
}
