# 3D Chess — Product Requirements

Online 3D chess with Clerk accounts, real-time matchmaking, local two-player on one device, a Stockfish-powered AI opponent orchestrated by Vercel Eve, difficulty levels, move history with undo, customisable 3D rooms, and a global leaderboard.

## 1. Tech stack

| Layer | Choice | Reason |
|---|---|---|
| Framework | Next.js (App Router), TypeScript | Vercel default, server actions, streaming |
| Auth | Clerk | Accounts, usernames, avatars, session tokens for Convex |
| Database and realtime | Convex | Subscriptions for live games, queue, leaderboard |
| Chess rules | chess.js | Legal moves, check, checkmate, stalemate, FEN, PGN |
| Engine | Stockfish (WASM) in a Web Worker | Strong, adjustable via UCI `Skill Level` and depth |
| AI orchestration | Vercel Eve | Agent with a Stockfish tool, difficulty personas, move commentary |
| 3D | React Three Fiber, drei | Board, pieces, raycast selection, animations |
| Assets | Free GLB chess set (Poly Pizza / Sketchfab, CC0) | No modelling live |
| Styling | Tailwind, shadcn/ui | Menus, panels, leaderboard table |
| Hosting | Vercel | Fluid Compute for Eve routes |

## 2. User roles

- **Guest**: can view the landing page and leaderboard. Cannot play.
- **Player** (signed in via Clerk): everything below.
- No admin role required for v1.

## 3. Functional requirements

### 3.1 Authentication (Clerk)
- FR-1 Sign up / sign in with email, Google, and GitHub.
- FR-2 Every player has a username and avatar sourced from Clerk, shown on the board, in match lobbies, and on the leaderboard.
- FR-3 On first sign-in, create a `players` record in Convex keyed by Clerk user id with rating 1200.
- FR-4 All game routes (`/play`, `/game/[id]`, `/profile`) are protected by Clerk middleware.
- FR-5 Convex functions authenticate via the Clerk JWT template; every mutation reads the caller identity server-side. Never trust a client-supplied user id.

### 3.2 Game modes
- FR-6 **Online match**: matchmaking against another human.
- FR-7 **Play vs AI**: single-player against Stockfish + Eve with a chosen difficulty.
- FR-8 **Spectate**: any signed-in player can watch a live online game from the lobby list (read-only).
- FR-8a **Local two-player**: two people share one device, taking turns. See 3.4a.

### 3.3 Chess rules and board
- FR-9 All rules enforced by chess.js: legal moves, check, checkmate, stalemate, castling, en passant, promotion, threefold repetition, fifty-move rule, insufficient material.
- FR-10 Moves are validated server-side in the Convex mutation before being written. Illegal moves are rejected.
- FR-11 Promotion prompts the player to choose queen, rook, bishop, or knight.
- FR-12 Game state stored as: current FEN, full move list in SAN, PGN string, turn, status, result.
- FR-13 Game statuses: `waiting`, `active`, `checkmate`, `stalemate`, `draw`, `resigned`, `abandoned`.

### 3.4 Board views: 2D and 3D
- FR-14 Two board views share one game state and one input model: **2D** (flat SVG/CSS board) and **3D** (React Three Fiber). A toggle in the board header switches between them instantly, mid-game, without losing selection or history position.
- FR-15 The chosen view is saved per player (`players.boardView`) and restored on next visit. Default is 3D when WebGL is available, otherwise 2D.
- FR-16 Both views support: click/tap to select a piece, legal-square highlights, last-move highlight, check indicator, promotion picker, captured-pieces tray, and coordinates.
- FR-17 Move animations in both views (~250 ms). In 3D, captured pieces slide off the board into the tray.

#### 3.4.1 2D view
- FR-18 Responsive square board, keyboard-accessible, works on the smallest supported phone. Board can be flipped to either colour.
- FR-19 Used automatically if WebGL context creation fails or the device reports a low-end GPU, with a toast explaining why.

#### 3.4.2 3D view: camera
- FR-20 **Orbit**: drag to rotate around the board centre. Polar angle clamped so the camera never goes below the table or fully overhead-locked (roughly 10° to 85° from vertical).
- FR-21 **Pan**: right-drag or two-finger drag on touch moves the camera target, limited to a bounding box around the board so the board can't be lost.
- FR-22 **Zoom**: scroll or pinch, clamped between "whole board plus room" and "a few squares".
- FR-23 Damped, inertial controls (drei `OrbitControls` or `CameraControls`) with a **Reset camera** button that animates back to the player's default seat.
- FR-24 Camera presets in a small menu: White side, Black side, Top-down, Cinematic (slow auto-orbit while idle, stops on interaction). The local two-player flip (3.4a) is implemented as an animated transition between the White and Black presets.
- FR-25 Camera state (position, target, zoom) persists for the session so a page refresh doesn't reset the view.

#### 3.4.3 3D view: rendering quality
- FR-26 Physically based materials: pieces use PBR materials (metalness/roughness) driven by the active room's material preset (e.g. polished wood, marble, glass, metal).
- FR-27 **Reflections**: the board surface is reflective, using drei `MeshReflectorMaterial` with blur and mirror strength tuned per room. Pieces reflect in the board; the room HDRI reflects in glossy pieces.
- FR-28 Image-based lighting from the room HDRI (`Environment`) plus one key directional light casting **soft shadows** from pieces onto the board (`ContactShadows` or PCF soft shadow maps).
- FR-29 Post-processing via `@react-three/postprocessing`: subtle bloom on highlighted squares and the check indicator, SSAO for contact darkening, and tone mapping (ACES). Post-processing is togglable.
- FR-30 Highlighted legal squares are emissive overlays that pulse gently; the selected piece lifts slightly and gets an outline.
- FR-31 **Quality tiers** in settings: Low (no reflections, no post, baked shadows), Medium (reflections, contact shadows, no post), High (everything). Auto-select based on `navigator.hardwareConcurrency` and device pixel ratio, with a manual override. Frame-time watchdog drops a tier if the scene sits below 30 fps for 5 seconds.
- FR-32 Pixel ratio capped at 2 for performance; resolution scaling on Low.

### 3.4a Local two-player (pass and play)
- FR-21a Started from `/play` as "Local 2 player". Only the signed-in player is required; the second player is a guest label ("Player 2") with an optional name entered before the game.
- FR-21b The game is stored in Convex like any other (mode `local`) so history, review, replay, and PGN export all work. It does not affect ratings or the leaderboard.
- FR-21c **Board flip on turn change**: after each move the camera animates from the White preset to the Black preset (or back), about 800 ms, eased, so the player to move is always looking from their own side. Input is locked during the animation. In 2D view the board flips instantly.
- FR-21d A short "White to move" / "Black to move" overlay appears during the flip so the device can be handed over.
- FR-21e Flip can be toggled off in settings for people who prefer a fixed view; the turn indicator still updates.
- FR-21f Undo is allowed in local games (both players share the device), rewinding one half-move at a time.
- FR-21g Reduced-motion preference disables the rotation animation and snaps the camera instead.

### 3.4b Room customisation (3D environment)
- FR-21h The board sits inside a 3D "room" made of an environment map (HDRI) plus optional floor and ambient props. Players choose the room from a picker in the game settings drawer.
- FR-21i v1 ships with at least five preset rooms: Classic Study (wood, warm light), Space (starfield, dark), Park (outdoor daylight), Neon Arcade, and Minimal White. Each preset is an HDRI from Poly Haven (CC0) plus a matching lighting rig and board material.
- FR-21j Custom colour mode: pick a solid background colour and board light/dark square colours with a colour picker. Live preview as you drag.
- FR-21k Stretch: upload your own image as the background (stored in Vercel Blob or Convex file storage, max 5 MB, converted to an equirectangular or blurred backdrop).
- FR-21l The chosen room is saved per player (`players.roomPreset`, `players.roomColors`) via Convex and applied to every game they view, including spectating. Each player sees their own room; it is not shared with the opponent.
- FR-21m Preset switching is instant (assets preloaded on the settings drawer open) and never interrupts a game in progress.
- FR-21n Room presets live in a single config file so new rooms can be added without touching scene code.

### 3.5 Matchmaking (online)
- FR-22 Player clicks "Find match" and is inserted into a `queue` table with rating and timestamp.
- FR-23 A Convex mutation pairs the two oldest queue entries whose ratings are within ±200, widening by 100 every 10 seconds. Colours are assigned randomly.
- FR-24 On pairing, a `games` row is created and both clients are redirected to `/game/[id]` via subscription.
- FR-25 Player can cancel queueing at any time.
- FR-26 A player cannot be in the queue and an active game simultaneously.
- FR-27 Optional (stretch): invite a friend by link, creating a private game.

### 3.6 Real-time play
- FR-28 Both clients subscribe to the game document; a move by one player appears on the other's board within one second.
- FR-29 Turn enforcement: the mutation rejects a move if it is not the caller's turn or the caller is not a participant.
- FR-30 Resign button with confirmation.
- FR-31 Draw offer: one player offers, the other accepts or declines; state stored on the game doc.
- FR-32 Disconnect handling: a player who is absent for 60 seconds (no heartbeat) forfeits; the opponent is notified.
- FR-33 Optional (stretch): per-side clock (e.g. 10+0) enforced server-side.

### 3.7 AI opponent (Stockfish + Eve)
- FR-34 Stockfish runs in a Web Worker in the browser (WASM). It never blocks the render thread.
- FR-35 Eve agent (server-side, Vercel) is the "opponent brain". It is given the current FEN, move history, and difficulty, and has a tool `analysePosition({ fen, depth, multiPv })` that returns Stockfish's top N candidate moves with evaluations.
  - Implementation note: to keep Stockfish server-callable for Eve, run a second Stockfish instance in a Node-compatible WASM build inside the tool, or have the client compute candidates and pass them to Eve. Decide on stream; the client-computed path is simpler.
- FR-36 Eve returns a structured response: `{ move: string (SAN), commentary: string }`. The move is validated with chess.js before being applied; if invalid, fall back to Stockfish's best move directly.
- FR-37 Eve commentary is displayed in a side panel after each AI move (streamed if possible).
- FR-38 AI move latency target: under 3 seconds at all difficulties.

### 3.8 Difficulty settings
Difficulty is chosen before an AI game starts and cannot be changed mid-game.

| Level | Stockfish Skill Level | Depth | Eve selection policy | Persona |
|---|---|---|---|---|
| Beginner | 1 | 2 | Random from top 5 candidates; avoids captures 50% of the time | Friendly coach; explains what the player could have done better |
| Casual | 5 | 6 | Random from top 3 | Encouraging club player |
| Intermediate | 10 | 10 | Best move 70%, second-best 30% | Confident, brief |
| Advanced | 15 | 14 | Best move | Serious, analytical |
| Grandmaster | 20 | 18 | Best move | Trash-talking grandmaster |

- FR-39 Difficulty is stored on the game doc and shown on the board header.
- FR-40 Hints (stretch): at Beginner and Casual, a "hint" button asks Eve to suggest a move without playing it. Limited to 3 per game.

### 3.9 Move history and undo
- FR-41 A move-history panel lists every move in SAN, paired by turn number, with the current move highlighted.
- FR-42 Clicking any past move shows that position on the board in review mode (board becomes read-only, banner says "Reviewing move 12").
- FR-43 **Undo (AI games only)**: a "Take back" button rewinds the last full turn (player move + AI reply). The player can also click a past move in history and press "Rewind to here" to roll back multiple turns.
- FR-44 Undo rebuilds the game by replaying the truncated move list through chess.js, then persists the new FEN and move list to Convex.
- FR-45 Undo count is tracked per game and shown on the result screen ("Won with 2 take-backs").
- FR-46 Undo is disabled in online matches. Stretch: an undo request the opponent must accept.
- FR-47 Full PGN export and copy-to-clipboard from the history panel.

### 3.10 Ratings and leaderboard
- FR-48 Each player has an Elo rating (start 1200), plus wins / losses / draws counters.
- FR-49 On game end, ratings update server-side in the same mutation that finalises the game.
  - Online games: K = 32.
  - AI games: K = 16, and the AI is assigned a fixed rating per difficulty (Beginner 800, Casual 1100, Intermediate 1400, Advanced 1800, Grandmaster 2300).
  - Games with any take-backs do not affect rating.
- FR-50 `/leaderboard` shows the top 100 players by rating with username, avatar, rating, record, and rank. Backed by a Convex index on `rating`.
- FR-51 Leaderboard filters: All, vs Humans only, vs AI only. (Requires separate rating fields or a computed view; simplest is three rating fields.)
- FR-52 Leaderboard updates live via subscription.
- FR-53 Player profile page: rating history sparkline, recent games with results, and links to replay each game.

### 3.11 Game replay
- FR-54 Any finished game can be opened at `/game/[id]` in review mode with previous/next/first/last controls and autoplay.

## 4. Data model (Convex)

```
players
  clerkId: string (indexed, unique)
  username: string
  avatarUrl: string
  rating: number            // overall
  ratingHuman: number
  ratingAi: number
  wins, losses, draws: number
  roomPreset: string             // e.g. "study", "space", "park", "arcade", "minimal", "custom"
  roomColors?: { background: string, lightSquare: string, darkSquare: string }
  roomImageStorageId?: Id<_storage>
  boardFlipEnabled: boolean      // local mode camera flip
  boardView: "2d" | "3d"
  qualityTier: "auto" | "low" | "medium" | "high"
  createdAt: number

queue
  playerId: Id<players>
  rating: number
  joinedAt: number

games
  whiteId: Id<players> | null   // null when AI plays white
  blackId: Id<players> | null
  mode: "online" | "ai" | "local"
  localPlayerTwoName?: string
  difficulty?: "beginner" | "casual" | "intermediate" | "advanced" | "grandmaster"
  aiColor?: "w" | "b"
  fen: string
  moves: string[]                // SAN
  pgn: string
  turn: "w" | "b"
  status: "waiting" | "active" | "checkmate" | "stalemate" | "draw" | "resigned" | "abandoned"
  winner?: "w" | "b" | "draw"
  drawOffer?: "w" | "b"
  undoCount: number
  lastMoveAt: number
  lastHeartbeat: { w: number, b: number }
  aiCommentary: { moveIndex: number, text: string }[]
  createdAt, endedAt

ratingHistory
  playerId, gameId, before, after, createdAt
```

## 5. Non-functional requirements
- NFR-1 Move-to-render latency under 300 ms on the acting client; opponent sees the move within 1 s.
- NFR-2 3D scene holds 60 fps at Medium quality on a 2020 MacBook Air and 60 fps at High on an M1 or better; fallback to 2D board on WebGL failure.
- NFR-2a Switching 2D↔3D takes under 500 ms after first load (3D bundle and assets are preloaded in the background once the game page mounts).
- NFR-3 Stockfish worker is lazily loaded only in AI mode; WASM bundle under 2 MB gzipped.
- NFR-4 All game-mutating logic is server-authoritative in Convex. The client never writes FEN directly.
- NFR-5 Eve calls have a 10-second timeout with automatic fallback to raw Stockfish best move.
- NFR-6 Mobile: touch selection works, board fits portrait viewport, history panel collapses into a drawer.
- NFR-7 Accessibility: keyboard move entry via SAN text box; move announcements in an aria-live region.
- NFR-8 Environment variables managed via `vercel env`; Clerk and Convex keys never committed.
- NFR-9 HDRI assets under 1.5 MB each (1k resolution is enough for a backdrop); loaded lazily and cached by the browser.
- NFR-10 Camera flip animation must stay above 50 fps on mid-range hardware; pause piece animations during the flip.

## 6. Pages and routes

| Route | Purpose |
|---|---|
| `/` | Landing, sign-in CTA, live "games in progress" ticker |
| `/play` | Mode picker: Find match, Play vs AI (difficulty select), Local 2 player, Spectate list |
| `/settings` | Room picker, custom colours, board flip toggle, 2D/3D default, quality tier |
| `/game/[id]` | The board, history panel, commentary panel, controls |
| `/leaderboard` | Top 100 with filters |
| `/profile/[username]` | Stats, rating chart, game history |
| `/sign-in`, `/sign-up` | Clerk hosted or embedded components |

## 7. Out of scope for v1
- Tournaments, clubs, chat between players
- Puzzles / opening trainer
- Native mobile apps
- Anti-cheat detection for online games
- Multiple board themes and piece sets

## 8. Stream build order (two sessions)

**Session 1: playable online chess**
1. Next.js + Clerk + Convex scaffold, protected routes, player sync on sign-in.
2. chess.js integration with a 2D board component.
3. Games table, server-validated move mutation, real-time subscription.
4. Matchmaking queue and pairing mutation.
5. Move history panel, review mode, PGN export.
6. Elo update, leaderboard page.
7. Resign and draw offers.

**Session 1 addendum**
8. Local two-player mode on the 2D board (turn indicator, half-move undo). Cheap to add here so the flip in session 2 is just a camera change.

**Session 2: 3D and AI**
1. React Three Fiber board, GLB pieces, raycast selection, move animation, 2D/3D toggle wired to the shared game state.
2. Camera: orbit, pan, zoom with clamps, presets, reset, session persistence.
3. Rendering: HDRI lighting, reflective board, soft shadows, post-processing, quality tiers.
4. Room system: five presets, settings drawer, per-player persistence.
5. Local two-player camera flip with hand-over overlay.
6. Stockfish WASM in a Web Worker with skill level and depth wiring.
7. Eve agent with `analysePosition` tool, difficulty personas, structured move + commentary output.
8. Undo / take-back for AI games with multi-turn rewind.
9. Spectate mode and game replay.
10. Polish: captured pieces tray, check highlight, custom colour picker, mobile layout.

## 9. Key risks
- **3D interaction time sink**: keep the 2D board as the shipped fallback so the stream always ends with a working game.
- **Eve picking illegal moves**: validate every Eve move with chess.js and fall back to Stockfish best move.
- **Stockfish on the server for Eve's tool**: if the Node WASM build fights you, compute candidates on the client and pass them into the Eve call as context.
- **Reflections and post-processing tanking framerate**: build the quality-tier switch first, default to Medium on stream, and show High only for the hero shot.
- **Camera flip feeling nauseating**: use a smooth ease-in-out, keep it under a second, and respect reduced-motion. Test on stream before committing to the default.
- **HDRI bundle bloat**: ship 1k versions only and lazy-load; five presets should total under 6 MB.
- **Matchmaking with few players live**: keep a "play vs AI while you wait" option and a friend-invite link so chat can pair up deliberately.
