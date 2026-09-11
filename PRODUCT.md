# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary: people watching or following the build who open the app to try it.** Mostly
  developers (the app is built live on stream from a written brief), on a laptop or phone,
  usually signed out on first visit. Their job: see within a minute what this thing is, sign in
  with one click, and play a game that feels real.
- **Secondary: anyone who plays it as a chess app** — a quick game against the AI, a rated game
  against another visitor, or pass-and-play with someone in the room.

Confirmed by the owner: this is a **"fake real product" used for a demo**. It must look and
behave like a shipped product in every detail (real accounts, real realtime, real engine, real
ratings); it is not expected to grow a player base on its own.

## Product Purpose

An online 3D chess club. You sit at a real 3D board in a room you chose, play people near your
rating or an AI opponent with a personality that explains its moves, and climb a live
leaderboard. Success is a visitor who signs in, plays one game to the end without confusion,
and comes away believing this is a real product.

## Positioning

Two claims future work must protect (owner's choice):

1. **The room and the talking opponent.** A physically lit 3D board inside one of five rooms
   (or your own colours), and an AI opponent with one of five personalities that tells you what
   it thinks after every move. Neighbouring chess sites have neither.
2. **Realtime multiplayer done right.** Rated matchmaking with a widening rating window,
   spectating, draw offers, disconnect forfeits and a live leaderboard, all enforced server-side
   (the client never writes a position). The 3D and the AI sit on top of a correct game.

Added 2026-09-11 (docs/PRO_TUTOR.md): **the tutor draws on the board.** Castle Pro's tutor
answers a question about the position in any game the member plays or watches, and marks the
squares, arrows and candidate line it is talking about on the same board they are playing on —
in 2D and in 3D. It is the first thing in the product that is paid for, and the only thing
Pro buys. No claim beyond that: no accuracy figure, no comparison to a coach or another site.

## Operating Context

- Runs in the browser at https://chess-3d-ai-clerk-game.vercel.app; the 3D board needs WebGL2
  and falls back to a 2D board when it is missing.
- Sign-in with email, Google or GitHub (Clerk); every player has a username and avatar.
- The AI turn runs a Stockfish engine in the browser (Stockfish 18 by default, Stockfish 11 as an
  automatic fallback on browsers without WASM SIMD) and a Vercel Eve agent on the server that
  chooses among the engine's candidate moves and writes the commentary.
- Castle Pro is Clerk Billing on the same Clerk development instance, with Clerk's shared test
  payment gateway; subscriptions and cancellation happen in Clerk's own components, and no card
  detail is ever typed into a Castle page. The tutor's answers come from a model called
  server-side through the Vercel AI Gateway; the analysis it reasons from is the same Stockfish
  engine, running in the member's own browser.
- Demonstrated live on stream; the build itself (Next.js 16, Clerk, Convex, React Three Fiber,
  Eve) is part of what viewers are looking at, but the interface must never explain the stack
  to a player.

## Capabilities and Constraints

Capabilities (shipped):

- Modes: online rated match, play vs AI at five difficulties, local pass-and-play on one
  device, spectate live games, replay finished games. Each difficulty is a named persona with a
  fixed character: Pip (Beginner, cheerful newcomer), Marco (Casual, chatty café player), Ada
  (Intermediate, patient coach who names the idea), Viktor (Advanced, dry tournament player),
  Kasparova (Grandmaster, imperious one-liners). These names are product facts, not placeholders.
- Full chess rules incl. promotion, en passant, castling, repetition and fifty-move draws;
  moves validated server-side; move history, review of any past position, take-backs in AI and
  local games only, PGN export.
- 2D and 3D board views that share one input model and switch instantly; five rooms (Classic
  Study, Space, Park, Neon Arcade, Minimal White) plus custom colours and an optional uploaded
  backdrop; camera presets, orbit/pan/zoom, seat flip in local games; quality tiers with an
  automatic watchdog.
- Elo ratings (overall, vs humans, vs AI), win/loss/draw records, top-100 leaderboard with three
  pools, profile with rating history.
- Hints (3 per game) at Beginner and Casual.
- **Castle Pro** (shipped 2026-09-11): one user-level subscription, plan slug `pro`, monthly,
  priced in Clerk and never written into the app's copy; Clerk auto-creates the free plan
  `free_user`. It carries exactly one feature, slug `tutor`, and that feature is the only thing
  in the product behind a paywall. Sold on `/pro` with Clerk's pricing table; managed and
  cancelled in the Clerk user profile, reachable from `/settings` and the avatar menu.
- **The tutor** (Pro only): a chat panel to the left of the board in every game a member plays
  or watches — online, AI, local, spectating and replay alike. It answers questions about the
  position currently in view, and marks the board while it explains: square tints, arrows and a
  numbered candidate line, in four tones (good, mistake, threat, idea) whose meaning is always
  named in words as well as colour. Before it judges a move it asks the member's own browser
  engine for lines, and it says so when the engine is busy with the opponent's move. Capped at
  40 questions per game.

Constraints (durable):

- No chat between players, no tournaments, clubs, puzzles or anti-cheat (out of scope by brief).
- Games with take-backs never affect rating; local games are never rated.
- AI commentary arrives whole after the move, not token by token (a property of the agent's
  structured output).
- The engine's first download is ~5.6 MB; it loads only when an AI game starts.
- Piece models are CC BY 3.0 and require visible attribution; HDRIs are CC0; the engines are
  GPL v3 and ship with their licence files.
- Clerk currently runs a development instance in production; a production instance needs a
  custom domain and real OAuth apps. Nothing in the product may pretend otherwise. Billing runs
  on that same development instance and Clerk's shared test gateway, so a subscription taken
  today is a test subscription — no real money moves.
- The tutor's conversation is not persisted: it lives as long as the panel is on screen. Convex
  never sees plan or feature claims (Clerk cannot put them in a custom JWT), so the per-game
  question counter there is a spend guard, not the gate — the gate is the tutor's own route.

Undecided product facts (recorded, not invented): a production domain, a privacy policy and
terms still do not exist. Pricing now does — one monthly plan, defined in Clerk, whose amount is
read from Clerk at runtime rather than written anywhere in this repo.

## Brand Commitments

- **Name: Castle** (owner's decision, 2026-09-10; see docs/BRAND_BRIEF.md). The knight glyph
  stays as the mark. "3D Chess" was the working title and may still appear in old commits and
  screenshots; new work uses Castle everywhere.
- **Voice: the club host** — warm, confident, brief; says what happens; never apologises; dry
  wit at most once per screen; never explains the stack. The full guide, lexicon and sample
  lines are in docs/BRAND_BRIEF.md section 4. The five AI personas keep their own voices.
- Mandatory credits that must stay visible somewhere a player can find them: "Chess pieces by
  Jarlan Perez via Poly Pizza — CC BY 3.0"; HDRIs from Poly Haven (CC0); Stockfish (GPL v3).
- Copy is written in sentence case with plain verbs; buttons say what happens. No filler, no
  apologies, no "Submit".

## Evidence on Hand

- Real, working product with live data: sign-up, matchmaking, AI games, leaderboard and profiles
  all run against production services; the landing page shows real "playing now" and "games
  played" counts.
- A public-domain historic game (Morphy vs Duke Karl & Count Isouard, Paris 1858) used for the
  landing replay; its moves are verified legal in code.
- Assets: `public/models/chess-pieces.glb` (+ `public/models/ATTRIBUTION.md`),
  `public/hdri/{study,space,park,arcade,minimal}.hdr`, `public/stockfish/{sf18,sf11}/`.
- Design and engineering records: `docs/PRD.md` (the brief), `docs/ARCHITECTURE.md`,
  `docs/UI_REDESIGN.md` (the current visual direction, "The Study"), `docs/KNOWN_ISSUES.md`.
- **Absent, and must not be fabricated:** testimonials, customer or player counts beyond the live
  counters, press, awards, benchmarks, pricing, company details.

## Product Principles

1. **Nothing fake behind the glass.** It is a demo, so every visible feature has to be real:
   real accounts, real opponents, real rules, real ratings. Never mock what a viewer might
   click.
2. **The board is the hero; the controls are never hidden.** Every game action stays one click
   away and labelled; nothing lives only in a menu on desktop.
3. **The room and the opponent carry the personality.** Atmosphere comes from light, material
   and the AI's voice, not from decoration on the chrome.
4. **First game without confusion.** A signed-out visitor should reach a finished game in under
   two minutes with no explanation of the stack.
5. **Truthful about limits.** Attribution, licences, the development-mode badge and unsupported
   browsers are stated plainly, never hidden.

## Accessibility & Inclusion

Established by the brief and kept: keyboard move entry (SAN text box) and full keyboard
operation of the 2D board; move announcements in an aria-live region; `prefers-reduced-motion`
disables the camera flip, auto-orbit and staggers; WCAG 2.1 AA contrast (4.5:1) for text in
both themes, measured in `src/lib/ui/__tests__/contrast.test.ts`; the 2D board is the
guaranteed path when WebGL is unavailable.
