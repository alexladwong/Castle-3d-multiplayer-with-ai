# Tutor agent: Eve vs AI SDK — verified 2026-09-10

Verified against node_modules `eve@0.52.4` (docs + d.ts), `ai@7.0.95` (docs + d.ts), the repo's
own Eve integration, and `docs/research/eve-agent.md`. Decision: **the tutor is an AI SDK route
handler + `useChat`; Eve keeps owning the opponent.**

## Existing Eve integration (do not disturb)

- `next.config.ts` → `withEve(nextConfig)`; agent root `./agent` (mounted at `/eve/v1/*`);
  `agent/agent.ts:7-26` `defineAgent({ model: "anthropic/claude-haiku-4.5", defaultTools: false, … })`;
  `agent/tools/analyse_position.ts` runs no engine (candidates come from the browser);
  `agent/channels/eve.ts:28-46` `eveChannel({ auth: [httpBasic(EVE_SERVER_SECRET), vercelOidc(), localDev()] })`
  — the browser never talks to Eve directly.
- `src/app/api/ai/_lib/eve-agent.ts:139-258` `runAgentTurn` (sessions create/attach, hard-coded
  `/eve/v1/session/:id/stream` at :343), `:264-283` `runDirectTurn` AI SDK fallback
  (`generateText` + `Output.object`). Routes: `src/app/api/ai/move/route.ts` (Clerk `auth()` :66,
  game facts from Convex not the body :86,:124,:126, NDJSON status frames), `hint/route.ts`
  (quota via Convex first :92). Guard: `src/app/api/ai/_lib/game-guard.ts:38 guardAiGame`.
- Why commentary is not streamed: per-turn `outputSchema` suppresses text deltas
  (`docs/research/eve-agent.md:1038-1085`).

## Why not Eve for the tutor

1. Eve has **no client-executed tools** (`execute` is required; `dist/src/tools/definition.d.ts:145-147`);
   the only human-in-the-loop paths are tool `approval`, the built-in `ask_question` (needs default
   tools) and `ctx.ask` inside `defineWorkflowTool`. A browser-side Stockfish call would be a park/resume.
2. A second agent requires `withEve(cfg, { agents: {...} })`, which renames the existing mount to
   `/eve/agents/<name>/eve/v1/*` and breaks `eve-agent.ts:343` (`docs/guides/frontend/nextjs.mdx:33-55`:
   "use either eveRoot or agents, not both").
3. Eve has no per-user quotas and "route auth does not enforce session ownership"
   (`docs/guides/auth-and-route-protection.md:263`): Pro gating, ownership and limits must live in
   our route anyway.
4. Eve surfaces tool calls as untyped `dynamic-tool` parts (`EveDynamicToolPart`, input `unknown`);
   the AI SDK gives typed `tool-<name>` parts.
   (If Eve is ever preferred: `useEveAgent({ host: "/api/tutor" })` behind an app proxy that checks
   Clerk + Pro + ownership; `clientContext` per send for analysis.)

## AI SDK 7 facts

- `@ai-sdk/react` is **not installed**; `ai` has no `ai/react` export → `pnpm add @ai-sdk/react`.
  zod 4.5 is within `ai`'s peer range.
- Tools: `tool({ description, inputSchema, execute })` (`inputSchema`, not `parameters`). A tool
  **without `execute`** is forwarded to the client (`docs/04-ai-sdk-ui/03-chatbot-tool-usage.mdx:81-96`).
- Server stream: `streamText({ model, system, messages: await convertToModelMessages(messages),
  tools, stopWhen: stepCountIs(n) })` then
  `createUIMessageStreamResponse({ stream: toUIMessageStream({ stream: result.stream, originalMessages, onFinish }) })`.
  `result.toUIMessageStreamResponse()` is **deprecated in v7** (`08-migration-guides/23-migration-guide-7-0.mdx:1647`).
  Call `result.consumeStream()` un-awaited so `onFinish` survives a client disconnect.
- Client: `useChat<TutorUIMessage>({ transport: new DefaultChatTransport({ api, body }),
  sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls, onToolCall({ toolCall }) })`;
  in `onToolCall` return early if `toolCall.dynamic`; answer with **`addToolOutput({ tool,
  toolCallId, output })`** (`addToolResult` is deprecated, `dist/index.d.ts:5684-5686`); never
  `await addToolOutput` inside `onToolCall` (`03-chatbot-tool-usage.mdx:113-122`).
- Typed parts: `part.type === "tool-<toolName>"`; states `input-streaming | input-available |
  approval-requested | approval-responded | output-available | output-error | output-denied`;
  helpers `isToolUIPart`, `getToolName`; types `InferUITools`, `UIMessage<META, DATA, TOOLS>`.
- Provider: gateway model strings (`"anthropic/…"`) with `AI_GATEWAY_API_KEY` or Vercel OIDC, the
  same path `agent/agent.ts:8-12` and `eve-agent.ts:23` use. Pick the tutor's model id from the live
  catalogue, never from memory.

## Client-side pieces already in the repo

- Engine: `src/lib/engine/stockfish-client.ts` `StockfishEngine.search({ fen, depth, multiPv,
  skillLevel, timeoutMs, signal })` → `{ lines: PvLine[] }`; requests are **queued, not
  cancelled** (:311-318); refcounted singleton `acquireEngine/releaseEngine` (:403-468); hook
  `useStockfish(enabled)` (`src/lib/engine/use-stockfish.ts:83`); `linesToCandidates(fen, lines)`
  (`src/lib/engine/candidates.ts:52`) gives `{ san, uci, scoreCp, mateIn, depth, pv }`.
  Any FEN is accepted; hints use depth 12 / multiPv 3 / 1500 ms.
- Chat surface: `src/components/ai/game-chat.tsx`; the shell assembles it in
  `src/components/game/game-shell.tsx`. Quota precedent: `convex/games.ts:718-736 useHint`.
- Auth: `src/proxy.ts` excludes `/api/ai` from `auth.protect()` so handlers answer 401; do the same
  for `/api/tutor`. Convex identity: `convex/lib/auth.ts` `requireIdentity/requirePlayer/optionalPlayer`.
