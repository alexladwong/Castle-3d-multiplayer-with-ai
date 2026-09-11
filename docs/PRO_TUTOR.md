# Castle Pro and the tutor

Owner's brief (2026-09-10): add a billing element with Clerk (monthly subscription), and a chess
tutor that "pops up on the left-hand side" for Pro members only: AI tools that explain positions
and break them down, ideally visually on the board, as the player talks to the tutor. Set it up,
make it active, test it, make it look good.

This document is the build contract. It sits under `DESIGN.md`, `PRODUCT.md` and
`docs/BRAND_BRIEF.md` §4 (voice), and beside `docs/UI_UPGRADE_2.md` (the game screen it extends).
Everything below was verified on 2026-09-10 against the installed packages, the Clerk CLI and the
Clerk and AI SDK docs; the research notes with file:line evidence are in `docs/research/`
(`clerk-billing.md`, `tutor-agent.md`, `board-annotation-seams.md`).

## 1. Product

- **Castle Pro**: one user-level plan, slug `pro`, "Pro", 900 cents a month (USD), recurring,
  publicly visible, with one feature, slug `tutor` ("Chess tutor"), included in the session JWT.
  Clerk auto-creates the free plan `free_user`. **Provisioned on 2026-09-10** with the Clerk CLI on
  the development instance (`clerk enable billing --for users`, then `clerk config patch --json`;
  Clerk's shared test gateway; test card 4242 4242 4242 4242, any future date, any CVC). Plan ids:
  `pro` = `cplan_3J91JCm7kGNI2K1eTg64Iugeoad`, `free_user` = `cplan_3J91JAvthSMAWxf7GMVIenCwVaL`
  (read them at runtime from `GET https://api.clerk.com/v1/billing/plans` when a component needs
  an id; never hard-code a price).
- **What Pro buys**: the tutor, in every game the member plays or watches (online, AI, local,
  spectating, replay). Nothing else in the product is gated.
- **Where it is sold**: `/pro`, a public page in the landing's visual world (Fraunces headline,
  host voice), with Clerk's `<PricingTable />` and a short truthful list of what the tutor does. The
  header shows a quiet "Pro" link for signed-in members without the feature; members manage or
  cancel through the Clerk user profile (Billing section), reachable from the avatar menu.
- **Copy** (host voice, no exclamation marks): page title "Castle Pro"; headline "A coach in the
  room."; sub "Ask about any position, in any game. The tutor explains the idea and draws it on the
  board."; three points: "Why a move was a mistake, in one paragraph"; "The plan from here, with
  the squares that matter marked"; "The threats, before they land". Locked-panel CTA: "Go Pro".
  Price line comes from Clerk, never hard-coded in copy.

## 2. Access control (Clerk Core 3, @clerk/nextjs 7)

- Client: `const { has } = useAuth()` → `has?.({ feature: "tutor" })` (optional chain: undefined
  before hydration). Render gates with `<Show when={{ feature: "tutor" }} fallback={…}>` from
  `@clerk/nextjs` (`Protect`, `SignedIn`, `SignedOut` are removed in Core 3 and throw).
- Server: `const { userId, has } = await auth()` in the tutor route; 401 without a user, 402
  `pro-required` without the feature. Never trust a client-supplied Pro flag.
- Convex never sees plan or feature claims: this app authenticates Convex with a custom JWT
  template, and Clerk documents that `pla`/`fea` cannot be included in custom JWTs. Therefore
  **the tutor's model call is gated in the Next.js route only**, and the per-game tutor counter in
  Convex is a quota, not a gate (see §5). No webhooks in v1.
- After checkout the session token needs a refresh before `has` flips: `<PricingTable
  newSubscriptionRedirectUrl="/pro?welcome=1" />` and, on that page, `clerk.session?.reload()`
  once, then a "Back to the game" link that returns to the last game id stored in
  `sessionStorage` when the pricing page was opened from a locked panel.

## 3. The tutor panel (left of the board)

Layout in `game-shell-view.tsx`:

- **≥ 1280 px**: three columns `grid-cols-[22rem_minmax(0,1fr)_25rem]` (tutor | board | sidebar);
  the board box's container query shrinks the board automatically. The tutor column is a walnut
  panel with a seam hairline on its right, its own scrollport, and a collapse control ("Hide
  tutor" / "Tutor") that stores its state in the UI store; collapsed, it becomes a 44 px vertical
  tab on the left edge labelled "Tutor" with the Pro chip.
- **1024–1279 px**: collapsed by default; the tab opens it as an overlay panel over the board's
  left half (soft shadow, no hairline, Escape closes, focus trapped while open).
- **< 1024 px**: a "Tutor" button in the mobile bar opens a bottom sheet (60 dvh) with the same
  panel. The sidebar keeps exactly three tabs (Chat, Moves, Info): the tutor is never a fourth
  tab.
- **Focus (fullscreen) layout**: a "Tutor" pill in the HUD opens the panel as an overlay on the
  left; annotations still draw on the board.

Panel anatomy (all states must render in the dev harness):

1. **Header plate**: a monogram disc "T" in brass ink on brass, "Tutor", and a brass "Pro" chip;
   right side: "Clear board notes" (ghost, visible only when annotations are on the board) and the
   collapse control.
2. **Locked state** (no feature): the header without the chip; a one-paragraph description in the
   host voice; three example questions rendered as quiet chips; a primary "Go Pro" button
   (brass) linking to `/pro` (stores the game id first); a micro line "Monthly. Cancel any time."
   No fake conversation, no blurred screenshots.
3. **Unlocked state**: a conversation list (`role="log"`, newest at the bottom, auto-scroll while
   the user is at the bottom), the tutor's bubbles in walnut with the "T" disc and the ply they
   refer to as a mono label ("after 12…Nf6"), the player's bubbles in seam with brass text on the
   right (same components as the game chat); **annotation chips** inside a tutor bubble for each
   drawing it made ("Squares d5, f7 · threat", "Arrow e4→d5 · idea", "Line Nxe5 Qh5 · idea"), each
   chip a toggle that re-applies that drawing to the board; a **thinking row** ("Tutor is
   looking at the position…", with the engine progress when analysis runs); a composer (input
   with visible label "Ask the tutor", Enter to send, Shift+Enter newline) and four suggestion
   chips above it that fill the composer: "Why was that a mistake?", "What's the plan here?",
   "Show me the threats", "Best move and why".
4. **Context line** above the composer: which position the tutor is looking at: "Live position ·
   move 14" or "Reviewing move 8" (it follows the board's review ply automatically).
5. **Error states**: `pro-required` (should not happen once gated, but render "Pro is needed for
   the tutor." with the Go Pro button), `quota` ("The tutor has answered 40 questions in this
   game. Start a new game to keep going."), network/model errors ("The tutor did not answer. Try
   again." with a retry), engine unavailable ("The engine is busy with the opponent's move; the
   tutor will answer without analysis." — still answer). Added at integration (2026-09-11):
   `tutor-unavailable` (HTTP 503 — the deployment has no usable AI Gateway credential, so no
   turn was charged) renders "The tutor is not available right now." with **no** retry, because
   a retry would fail identically; the composer is disabled with the same line.
6. **Empty state** (unlocked, no messages): one tutor bubble: "Ask me about any position. I will
   explain and mark the board."

Motion: bubbles enter over `--dur-bubble`; annotations fade in over 160 ms and pulse only under
motion-safe; nothing else moves.

## 4. Board annotations (both boards)

Add to `BoardViewProps` (src/lib/types.ts): `annotations?: BoardAnnotations` where

```ts
type AnnotationTone = "good" | "bad" | "threat" | "idea";
interface BoardAnnotations {
  squares: { square: SquareId; tone: AnnotationTone }[];
  arrows: { from: SquareId; to: SquareId; tone: AnnotationTone }[];
  /** A candidate line as numbered arrows, first move strongest. */
  line: { from: SquareId; to: SquareId; san: string }[];
}
```

Tones map to tokens: good → `--live` (baize), bad → `--danger` (ember), threat →
`--board-capture`, idea → `--accent` (brass). Never colour alone: the chip text names the tone.

- **2D** (`src/components/board2d`): an `<svg viewBox="0 0 8 8">` layer, `absolute inset-0
  pointer-events-none`, between the squares grid and the pieces layer; square tints as `<rect>`
  at 45 % opacity; arrows as a `<line>` with a `<marker>` arrowhead, stroke 0.22 units, 85 %
  opacity, shortened so the head lands at the square centre; the line's arrows numbered with a
  small mono badge at the start square. Orientation-aware via `gridPosition`. `data-annotation`
  attributes for tests.
- **3D** (`src/components/board3d`): a `<TutorAnnotations>` group after `<Highlights>` at
  `HIGHLIGHT_Y + 0.002`, `raycast={() => null}`: square planes reuse the highlight material
  pattern; arrows are flat `ShapeGeometry` polygons (shaft + head) in the board plane; the line
  uses the same arrows with decreasing opacity and small numbered sprites. `toneMapped={false}`,
  `depthWrite={false}`, disposed on unmount; static under reduced motion.
- The mock controller and `/dev/game` scenarios get `annotations` too.

## 5. Server: the tutor route

`src/app/api/tutor/route.ts` (Node runtime, `export const maxDuration = 60`):

1. `auth()` → 401; `has({ feature: "tutor" })` → 402 `{ error: "pro-required" }`.
2. Body (zod): `{ gameId, messages: UIMessage[], ply: number }`. Load the game with the caller's
   token (`fetchQuery(api.games.get)`), check the caller is a player **or spectator with access**
   (spectating a live game is allowed), derive the position at `ply` with chess.js from the stored
   move list (the client never sends a FEN). Reject a `ply` beyond the game's length.
3. Quota: `fetchMutation(api.games.useTutorTurn, { gameId })` charged before the model call;
   `MAX_TUTOR_TURNS_PER_GAME = 40` (new constant); the mutation throws `tutor-limit` at the cap.
   (Convex cannot verify Pro; this counter is only a spend guard.)
4. `streamText({ model, system, messages: await convertToModelMessages(messages), tools,
   stopWhen: stepCountIs(6) })` → `createUIMessageStreamResponse({ stream: toUIMessageStream({
   stream: result.stream, originalMessages: messages }) })`; call `result.consumeStream()`
   without awaiting. `toUIMessageStreamResponse()` is deprecated in ai 7: do not use it.
5. Tools (`src/lib/tutor/tools.ts`, zod 4): `highlightSquares({ squares[1..16], tone })`,
   `drawArrows({ arrows[1..6] })`, `showLine({ san[1..12] })` (validated with chess.js from the
   position; illegal lines return `{ ok: false, reason }` so the model corrects itself), each with
   a trivial server `execute` so the loop continues; and `requestAnalysis({ depth 8..22 = 16,
   multiPv 1..5 = 3 })` **without** `execute`: it is executed in the browser (Stockfish) and
   answered with `addToolOutput` (`addToolResult` is deprecated).
6. Model: read the live Vercel AI Gateway catalogue at build time and pick the newest Claude
   Sonnet-class id available to this project; fall back to the id the opponent already uses
   (`anthropic/claude-haiku-4.5`). Record the chosen id in `src/lib/tutor/model.ts` with the
   catalogue evidence in a comment. Same credentials path as `agent/agent.ts`.
7. System prompt (`src/lib/tutor/system.ts`): the club coach: warm, precise, brief; always
   speaks about concrete squares and pieces; before judging any move it calls `requestAnalysis`
   once and reasons from the engine's lines; it uses at most two drawings per answer and says in
   words what each drawing shows; answers under 120 words unless asked for depth; never invents
   evaluations it did not get from analysis; never explains the stack; addresses the player as
   "you" and the opponent by name. Context block per request: mode, players and ratings, the
   asker's colour and role (player or spectator), PGN so far, the ply in view and its FEN, the
   last move, whether the game is over and how.

## 6. Client

- `pnpm add @ai-sdk/react` (not installed; `ai` has no `ai/react` export).
- `src/hooks/use-tutor-chat.ts`: `useChat<TutorUIMessage>({ transport: new
  DefaultChatTransport({ api: "/api/tutor", body: () => ({ gameId, ply }) }),
  sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls, onToolCall })`; in
  `onToolCall`, return early when `toolCall.dynamic`; for `requestAnalysis` run
  `engine.search({ fen, depth, multiPv, skillLevel: 20, timeoutMs: 3000 })` via
  `useStockfish(true)` (refcounted singleton; the request queues behind an opponent's search, so
  show the "engine is busy" row and cap the wait at 6 s, then answer with `{ lines: [] }` and
  `note: "engine-busy"`), convert with `linesToCandidates`, and call `addToolOutput` without
  awaiting inside the callback.
- `src/lib/tutor/overlay.ts`: a pure reducer from message parts to `BoardAnnotations` (typed parts
  `tool-highlightSquares` etc.; use `input-available` or `output-available` states; handle all
  seven states); the "active" drawing set is the latest tutor message's, or the chip the user
  toggled; "Clear board notes" empties it. Unit-tested.
- `useGameController` and the mock controller merge `annotations` into `board`.
- The panel components live in `src/components/tutor/` (`tutor-panel.tsx`, `tutor-locked.tsx`,
  `tutor-conversation.tsx`, `annotation-chip.tsx`, `tutor.css`), with `TutorPanelView` pure and
  a `TutorPanel` container.

## 7. Pages and navigation

- `/pro` (`src/app/pro/page.tsx`, public, static shell + client `PricingTable`): metadata title
  "Castle Pro"; the landing's Section/Display components; the PricingTable inside a walnut well
  with Clerk `appearance` mapped to tokens (brass primary, warm neutrals); below it a short FAQ in
  the host voice (what the tutor can and cannot do; cancellation; "the tutor's engine runs in your
  browser").
- Header: for signed-in users without the feature, a "Pro" link (parchment, brass on hover) before
  the avatar; members see nothing extra. `prefetch={false}` like every Link.
- `/settings`: a "Plan" row: "Pro · manage in your account" opening the Clerk user profile
  (`UserButton`'s manage-account or a `<UserProfile />` route at `/settings/account`), or "Free ·
  Go Pro".

## 8. Dev harness, tests, verification

- `/dev/game?scenario=tutor-pro` (unlocked, a scripted conversation with two tutor answers whose
  annotations show squares, arrows and a line on the current position) and
  `?scenario=tutor-locked`. The harness fakes `has` through a `TutorAccessProvider` context
  (`{ hasTutor: boolean | undefined }`) that the real app fills from `useAuth`.
- Vitest: overlay reducer; 2D arrow geometry helper; route guard (mocked `auth`, `has`, game
  fetch: 401 / 402 / 404 / quota / ok); `useTutorTurn` in convex-test; tools' `showLine`
  validation.
- Playwright (public): the two harness scenarios render; `[data-annotation="arrow"]` count on the
  2D board; locked CTA links to `/pro`; `/pro` renders the heading "A coach in the room." and
  Clerk's pricing table root.
- Playwright (auth): sign in as the throwaway user; open a game; the panel is locked; go to
  `/pro`, subscribe with `@clerk/testing`'s pricing-table and checkout page objects
  (`startCheckout({ planSlug: "pro", period: "month" })`, `fillTestCard()`,
  `clickPayOrSubscribe()`, `waitToBeActive`); return to the game; the panel is unlocked; ask
  "What's the plan here?"; expect a tutor bubble and at least one annotation on the board. The
  test tolerates an already-subscribed user (skips checkout when `has` is already true).
- Impeccable detector clean on `src/components/tutor`, `src/app/pro`; contrast for the four tones
  on both boards' light and dark squares measured; touch targets 44 px; reduced motion honoured.
- Production: the same Clerk development instance and gateway serve production today (owner:
  "dw about production this is dev"); `EVE_SERVER_SECRET`/gateway env already exist; add nothing
  secret to the client.

## 9. Out of scope (v1)

Persisting tutor conversations across reloads; tutor for positions outside a game; voice; a
free trial; organisation billing; webhooks. Each is a follow-up, not a gap.
