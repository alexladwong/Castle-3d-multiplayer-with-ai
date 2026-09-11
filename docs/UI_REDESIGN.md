# UI Redesign — "The Study"

Design lead notes (2026-09-10). This document is the single source of truth for the visual
redesign. Implementation agents copy tokens, layouts and copy from here; they do not invent
alternatives. Product requirements (docs/PRD.md) and the technical blueprint
(docs/ARCHITECTURE.md) still apply; nothing here changes data flow, Convex functions, or the
BoardViewProps / useGameController contracts unless a section says so explicitly.

## 0. Brief, in one line

An online 3D chess club: you sit at a real board in a room you chose, an opponent with a
personality talks to you, and every control you need is in plain sight. The landing page's job
is to make a visitor click "Play"; the game screen's job is to keep every action one click away
without ever crowding the board.

## 1. Visual direction

The identity comes from the subject's own materials: the Classic Study room (walnut, ivory,
brass, baize) that every player sees first. Dark by default because the 3D rooms are the
product; light theme exists and is tokenised, but nothing is designed light-first.

### 1.1 Palette (tokens in src/app/globals.css)

| Token | Dark (default) | Light | Use |
|---|---|---|---|
| `--bg` | `#120e0a` espresso | `#f3ecdd` ivory | page ground |
| `--bg-elevated` | `#1c1610` walnut | `#fbf7ee` | cards, sidebar, header (with blur) |
| `--bg-sunken` | `#0c0907` | `#e9e0cf` | wells: move list, chat scroll area, code |
| `--fg` | `#f1e7d3` ivory | `#1a130d` | primary text |
| `--fg-muted` | `#b3a48c` | `#5c503f` | secondary text, labels |
| `--line` | `#2d241b` | `#d9cdb7` | hairlines, borders |
| `--accent` | `#c9a24a` brass | `#806018` | primary buttons, focus ring, selected state, headline italics |
| `--accent-fg` | `#1a130d` | `#fbf7ee` | text on accent |
| `--live` | `#3f9b73` baize | `#1f6b4d` | live indicators, success, "your turn" |
| `--danger` | `#d4644a` ember | `#a63d27` | resign, check, destructive |
| `--board-light` | `#d9b98a` | same | mini boards, illustrations |
| `--board-dark` | `#7a4a22` | same | mini boards, illustrations |

_Measured (U0, WCAG 2.1; `src/lib/ui/__tests__/contrast.test.ts` re-checks these against
globals.css on every run). Two values moved off the first draft to clear 4.5:1 — light `--accent`
`#8a6a1f` → `#806018` (was 4.29:1 on `--bg`) and dark `--danger` `#c4533a` → `#d4644a` (was
4.25:1 on `--bg`). Everything else is as drafted._

| Pair | Dark | Light |
|---|---|---|
| `--fg` on `--bg` | 15.66 | 15.62 |
| `--fg-muted` on `--bg` | 7.87 | 6.68 |
| `--fg-muted` on `--bg-elevated` | 7.35 | 7.34 |
| `--fg-muted` on `--bg-sunken` | 8.14 | 5.99 |
| `--accent-fg` on `--accent` | 7.66 | 5.45 |
| `--accent` on `--bg` | 8.01 | 4.95 |
| `--live` on `--bg` | 5.62 | 5.46 |
| `--danger` on `--bg` | 5.23 | 5.38 |

Board squares are the same in both themes: `--board-select` `#e0bb63`, `--board-last` `#c9a24a`
(brass), `--board-legal` `#3f9b73` (baize), `--board-capture` `#dd7256`, `--board-check` `#c4402a`.

Rules: exactly one accent (brass) for actions and emphasis; baize only for "live/turn/success";
ember only for danger/check. No gradients except the hero's radial vignette behind the canvas.
Shadows are soft and warm (`0 20px 60px -30px rgb(0 0 0 / .6)`), never blue-grey.

Map these onto the shadcn variables the components already read: `--background`→`--bg`,
`--card`/`--popover`→`--bg-elevated`, `--foreground`→`--fg`, `--muted-foreground`→`--fg-muted`,
`--border`/`--input`→`--line`, `--primary`→`--accent`, `--primary-foreground`→`--accent-fg`,
`--destructive`→`--danger`, `--ring`→`--accent`. Keep `--radius: 0.75rem` (cards 1rem, buttons
0.625rem, chips 999px).

### 1.2 Typography

| Role | Face | Loading | Notes |
|---|---|---|---|
| Display | **Fraunces** (variable) | `next/font/google` `Fraunces({ axes: ["opsz","SOFT","WONK"], subsets: ["latin"], variable: "--font-display" })` | Headlines only. `font-variation-settings: "opsz" 144, "SOFT" 40, "WONK" 1`; weight 500; tight tracking (-0.02em); line-height 0.98 at ≥ 56px. One italic word per headline max. |
| UI / body | **Geist** (already loaded as `--font-geist-sans`) | keep | 15px base on marketing pages, 14px in the app frame. |
| Data | **Geist Mono** (already loaded) | keep | Move notation, ratings, clocks, coordinates, IDs. Always `font-variant-numeric: tabular-nums`. |

Type scale (marketing): display 72/64/48 → h2 40 → h3 24 → body 17/15 → caption 13 uppercase
tracking 0.12em (eyebrows). App frame: h1 20, section labels 12 uppercase, body 14, mono 13.

### 1.3 Motion

- Page-load: hero headline words rise 12px + fade over 500ms staggered 60ms; the canvas fades in
  over 800ms once the first frame renders. Nothing else animates on load.
- Scroll: sections reveal once (opacity + 8px translate, 400ms, `IntersectionObserver`); the
  hero board's room swaps with a 600ms crossfade of lighting (existing Environment transition).
- Micro: buttons 120ms colour; chat bubbles enter with 160ms scale 0.98→1; the "thinking" bubble
  has three dots pulsing (900ms cycle).
- `prefers-reduced-motion`: no staggers, no auto-orbit, instant room swaps, static bubbles.

### 1.4 Signature

The landing hero is a **live 3D board replaying Morphy vs Duke Karl / Count Isouard, Paris 1858
("the Opera Game")** in the Classic Study room, cinematic slow orbit, one move every 1.8 s,
looping. A mono notation strip under it prints the moves as they land, and the caption reads
"Now playing · Morphy vs Duke Karl & Count Isouard · Paris, 1858". As the visitor scrolls into
the "Choose your room" section, the same board swaps rooms (Study → Space → Park → Neon Arcade →
Minimal) — the product's most distinctive feature demonstrated, not described. Spend the
boldness here; everything else stays quiet.

Opera Game SAN (validate with chess.js in code; it is public domain):
`e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7
O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+ Nxb8 Rd8#`

## 2. Copy voice

Sentence case, plain verbs, no filler. Buttons say what happens: "Play now", "Find a match",
"Offer draw", "Take back", "Resign", "Copy PGN", "Enter fullscreen". Errors say what happened
and what to do. Empty states invite: "No live games right now. Start one and it will show up
here." Never say "Submit", "Oops", or "Something went wrong" alone.

## 3. Landing page (/)

Layout (desktop ≥ 1024): a 12-column grid, max-width 1280, gutters 24. Header is transparent
over the hero and gains `--bg-elevated`/80 + blur after 40px scroll.

```
┌───────────────────────────────────────────────────────────────┐
│ ♞ 3D Chess        Play  Leaderboard  Rooms          Sign in ▐Play▌│
├───────────────────────────────────────────────────────────────┤
│  ONLINE 3D CHESS                      ┌──────────────────────┐ │
│  Chess you can                        │                      │ │
│  walk around.        (display)        │   live 3D board      │ │
│                                       │   (canvas bleeds     │ │
│  Sit at a board in a room you chose.  │    off the right     │ │
│  Play people near your rating, or an  │    edge)             │ │
│  AI that tells you what it thinks.    │                      │ │
│                                       └──────────────────────┘ │
│  ▐ Play now ▌  Watch live games       12. O-O-O Rd8 13. Rxd7 …  │
│  ● 14 playing now · 1,204 games       Now playing · Morphy …    │
├───────────────────────────────────────────────────────────────┤
│  CHOOSE YOUR ROOM                                              │
│  [Study] [Space] [Park] [Neon Arcade] [Minimal]  ← swaps hero  │
│  (5 cards: swatch of board colours + HDRI thumbnail + 1 line)  │
├───────────────────────────────────────────────────────────────┤
│  PLAY YOUR WAY        3 cards: Find a match / Play the AI /    │
│                       Pass and play — each with real detail     │
├───────────────────────────────────────────────────────────────┤
│  MEET THE OPPONENTS   5 persona cards, each with one sample    │
│                       commentary line rendered as a chat bubble │
├───────────────────────────────────────────────────────────────┤
│  LIVE NOW             live games list (Watch) + top 5 rating   │
├───────────────────────────────────────────────────────────────┤
│  footer: credits (pieces CC BY, HDRIs CC0, Stockfish GPL) links│
└───────────────────────────────────────────────────────────────┘
```

Hero details: left column spans 5 cols; the canvas container spans 7 cols and is allowed to
overflow the viewport on the right by ~10% (overflow hidden on the section). Canvas height
= min(72vh, 720px). Behind the canvas a radial vignette in `--bg-elevated` → transparent. The
notation strip is a single line, mono, `--fg-muted`, newest move in `--fg`, horizontally
scrolling to the latest move. The live counts come from the existing live-games query and a
lightweight `stats` query (players count + games played; add it in convex if absent — it is a
public query, index-backed: count is fine to approximate via `take(1000).length` capped, or
maintain nothing and show only "playing now" if a cheap count is not available; do not add a
counter table).

Hero board implementation: reuse `Board3D` (P4) in **showcase mode**: `interactive=false`,
`animate=true`, `cameraPreset="cinematic"`, quality tier medium (post FX off), `dpr ≤ 1.5`,
`frameloop` paused when the hero is out of the viewport, reduced-motion → static White seat
camera and no auto-play. Position stream: a tiny hook replays the Opera Game through chess.js
(`src/lib/chess.ts` helpers) with `PieceTracker` so captures animate. WebGL unavailable → render
the 2D `MiniBoard` at hero size with the same replay (so the section never blanks). Mobile
(< 768): hero stacks; the canvas is full width, height 56vw, tier low; the room cards become a
horizontal snap scroller.

"Choose your room" cards: hovering (desktop) or tapping (mobile) a card sets the hero room; the
active card shows a brass ring. Each card: room name, one line from `ROOMS[...].description`,
two colour swatches (light/dark squares) and a 64×40 thumbnail. Thumbnails: static JPGs are NOT
available; render the swatches + HDRI name instead of fabricating images. Do not screenshot.

"Play your way" cards (from real behaviour): Find a match — "Rated games against people within
±200 of your rating; the window widens every 10 seconds." Play the AI — "Five opponents from
Beginner to Grandmaster. Each one explains its moves." Pass and play — "Two people, one device.
The board turns to face whoever is to move." Each card has one primary button that deep-links
(`/play?mode=…`).

"Meet the opponents": persona name, difficulty, one-sentence character (from
`agent/instructions.md` personas), and a sample bubble (write 5 short, in-character lines in the
implementation; keep them under 90 characters).

## 4. App frame (all signed-in pages)

Header height 56: logo, primary nav (Play, Leaderboard, Settings), right: theme toggle,
UserButton. Content max-width 1200 except the game screen (full-bleed). Page headers use a
Fraunces h1 at 36 with an eyebrow above it.

## 5. Game screen (/game/[id]) — the usability fix

Principles: the board never scrolls; every action is visible with a label; the AI's voice lives
in a chat on the right; fullscreen is one click and keeps the essentials.

### 5.1 Desktop layout (≥ 1024)

```
┌──────────────────────────────────────────────────────────────────────┐
│ header (56)                                                          │
├──────────────────────────────────────────────┬───────────────────────┤
│ ● WhiteName 1240        Move 12 · White      │ ┌ Chat ┐ Moves  Info  │
│                         ▐ Beginner AI ▌       │ ├─────────────────────┤
│ ┌──────────────────────────────────────────┐ │ │ [avatar] Coach:     │
│ │                                          │ │ │  ┌────────────────┐ │
│ │                                          │ │ │  │ e4 already? …  │ │
│ │                BOARD                     │ │ │  └────────────────┘ │
│ │        (fills remaining height,          │ │ │            ┌──────┐ │
│ │         square, centred)                 │ │ │  You played│ Nf3  │ │
│ │                                          │ │ │            └──────┘ │
│ │                                          │ │ │  [● ● ●] thinking…  │
│ └──────────────────────────────────────────┘ │ │                     │
│ ● BlackName (AI · Beginner)   captured: ♙♙♗  │ ├─────────────────────┤
│ ┌────────────────────────────────────────────┐ │ │ ▐ Ask for a hint ▌ 2 left│
│ │ 2D/3D  Flip  Camera▾  Fullscreen │ Hint  Take back │ Draw  Resign │ PGN  Room  ?  │
│ └────────────────────────────────────────────┘ │ └─────────────────────┘
└──────────────────────────────────────────────┴───────────────────────┘
```

- Grid: `grid-template-columns: minmax(0,1fr) 380px`; sidebar 400px at ≥ 1440. Height:
  `calc(100dvh - 56px)`; the board column is a flex column: top player row (48), board area
  (flex-1, the board is `min(100%, availableHeight)` square, centred), bottom player row (48),
  action bar (56). No page scroll on desktop.
- Player rows: avatar 32, name, rating in mono, a `--live` dot + "to move" label on the side to
  move; captured pieces tray inline on the right of each row (glyphs + material diff in mono).
- Status pill (centre top): "Move 12 · White to move" / "Check!" (ember) / "Reviewing move 8 ·
  Back to live" (brass, clickable) / result text when over. Difficulty badge for AI games.
- **Action bar** (always visible, labelled, tooltips with shortcut):
  View group: `2D/3D` (T), `Flip` (R), `Camera ▾` (3D only: White/Black/Top/Orbit/Reset),
  `Fullscreen` (F).
  Game group: `Hint` (AI beginner/casual only, shows "2 left"), `Take back` (AI/local),
  `Offer draw` (online), `Resign` (danger, confirms).
  More group: `PGN ▾` (Copy, Download), `Room` (opens the settings drawer), `?` shortcuts.
  Buttons show icon + text at ≥ 1280, icon-only with tooltip below that; disabled states have
  tooltips explaining why ("Undo is not available in online games").
- **Right sidebar** tabs: Chat (default for AI games), Moves (default otherwise), Info.
  - Chat: a scrolling list of messages. AI messages: persona avatar (a lettered brass disc per
    persona) + name + move number, bubble in `--bg-elevated` with 12px radius (top-left 4px),
    max-width 88%. Player events as right-aligned bubbles in `--accent`/15 with brass text:
    "You played Nf3", "Hint requested". System chips centred in `--fg-muted`: "Draw offered",
    "Opponent reconnected", "Game over · 1-0". Thinking indicator: an AI bubble with three
    pulsing dots and, after 3 s, "still thinking…". Auto-scrolls to the newest message unless the
    user scrolled up (then show a "New message ↓" pill). Composer area: for AI games a primary
    "Ask for a hint" button with the remaining count; hints appear as AI bubbles tagged "Hint".
    For online/local games the Chat tab shows only system chips and a quiet note: "Commentary is
    available in games against the AI." Persisted rows come from the commentary table; the
    current-turn state from the ai-store — the chat merges both in ply order.
  - Moves: paired list (mono), current ply highlighted with a brass left rule, click to review;
    footer with ⏮ ◀ ▶ ⏭ and Autoplay; "Rewind to here" appears on the hovered/selected row for
    AI/local games.
  - Info: players, mode, difficulty, opening move count, started time, PGN copy/download,
    spectator count, link to profiles.
- Keyboard: F fullscreen, T 2D/3D, R flip, ←/→ review, Home/End first/last, ? shortcuts dialog,
  Esc exits fullscreen/review. Never capture keys while typing in the SAN box.

### 5.2 Fullscreen / board focus

`Fullscreen` calls `document.documentElement.requestFullscreen()` when available and, in all
cases, switches the shell to **focus layout**: header and sidebar hidden, board sized to the
viewport, a floating HUD: top-left player chip of the side to move, top-right "Exit fullscreen",
bottom-centre a compact action bar (2D/3D, Flip, Camera, Hint/Take back, Exit). In 3D the HUD
fades after 3 s idle and returns on pointer move; in 2D it stays. Esc and the button exit.
Persist the choice for the session in the ui-store (`layoutMode: "default" | "focus"`).

### 5.3 Mobile (< 1024)

Column: player row, square board (full width), player row, sticky action bar (5 primary buttons
+ "More" sheet), then a bottom sheet (Drawer) with the same three tabs, opened at a 40% peek by
default in AI games so the latest bubble is visible. Fullscreen hides the header and puts the
tabs behind a single "Chat" pill.

### 5.4 Dialogs and overlays

Promotion picker: a row of four piece glyphs in a small dialog anchored to the promotion square
(2D) or centred (3D). Result dialog: Fraunces headline ("You won", "Draw", "You resigned"),
result line, rating change in mono with a brass/ember delta, "Won with 2 take-backs" when
applicable, buttons: Play again (same mode), Review game, Back to lobby. Turn hand-over overlay
(local): full-board scrim with "Black to move — pass the device" in Fraunces, dismisses when the
flip ends. Draw offer banner: a system chip in chat plus an inline bar above the action bar with
Accept / Decline.

## 6. Other pages

- **/play**: eyebrow "Choose a mode"; three mode cards (as on landing) in a row; the AI card has
  the five personas as selectable chips with the persona line and a colour choice; Pass and play
  has the Player 2 name field inline; Find a match shows the queue panel in place of the card
  when searching (elapsed timer, current rating window with a growing bar, Cancel, "Play the AI
  while you wait"). Below: "Live now" grid of spectate cards with a `MiniBoard` thumbnail of the
  current position, player chips, move count, Watch button.
- **/leaderboard**: top three as a podium row (avatar 56, rating in Fraunces 40), the table
  below (rank, player, rating, record, form), pool tabs, the signed-in player pinned if outside
  the top 100 (only if the query supports it; otherwise omit).
- **/profile/[username]**: header card (avatar 72, name, ratings for all three pools in mono,
  record), rating sparkline card, recent games as rows with a 48px `MiniBoard` of the final
  position, opponent, result pill, replay link.
- **/settings**: left: sections (Room, Board, Camera & motion, Graphics, Engine, Account);
  right: a sticky live preview (Board3D showcase mode, interactive=false) that reflects changes
  instantly. Room cards with swatches; custom colours with three pickers and live preview.

## 7. Shared components to add (src/components/ui-kit/)

`Eyebrow`, `Display` (Fraunces heading with the variation settings), `Section` (padding, max
width, reveal-on-scroll), `StatPill`, `PlayerChip` (avatar + name + rating + live dot),
`ActionBar` + `ActionButton` (icon, label, shortcut, disabledReason), `Kbd`, `ChatMessage`
(variants: ai, you, system, thinking), `ChatList` (auto-scroll + new-message pill), `MoveList`,
`MiniBoard` (SVG board from FEN, reusing src/components/board2d/pieces-svg.tsx glyphs; props:
fen, orientation, size, lastMove), `RoomCard`, `PersonaCard`, `ModeCard`, `Podium`,
`FocusHud`, `ShortcutsDialog`. All keyboard accessible, all tokens from §1.

## 8. Verification harness (mandatory)

Because no agent can sign in, add `src/app/dev/game/page.tsx` (dev only: `notFound()` in
production) that renders the real game shell **view** with a mocked controller. This requires
splitting the current shell into `GameShellView({ vm, actions, viewerRole })` (pure, no Convex)
and a thin container that feeds it from `useGameController`. Scenarios via `?scenario=`:
`ai-midgame` (12 plies, three persisted commentary rows, thinking state on), `ai-hint` (hint
bubble), `online-draw-offer`, `local-flip` (hand-over overlay), `review` (reviewing ply 8),
`finished` (result dialog open), `fullscreen` (focus layout). Also extend `/dev/board3d` with a
"showcase" toggle (the landing hero mode). The visual QA step screenshots these at 1440×900 and
390×844.

## 9. Ownership for parallel implementation

| Package | Owns | Depends on |
|---|---|---|
| U0 design system | globals.css tokens, fonts in layout.tsx, `src/components/ui-kit/**`, `MiniBoard`, theme toggle, shadcn overrides | — (lands first) |
| U1 landing | `src/app/page.tsx`, `src/components/landing/**`, showcase hooks (`src/components/landing/use-showcase-game.ts`), convex `stats` query if added (coordinate: only `convex/stats.ts` new file) | U0, Board3D showcase props (U3) |
| U2 game screen | `src/app/(protected)/game/**`, `src/components/game/**`, `src/components/ai/**` (chat), `src/hooks/use-fullscreen.ts`, `use-shortcuts.ts`, ui-store `layoutMode`, `src/app/dev/game/**` | U0 |
| U3 board3d showcase | `src/components/board3d/**` (showcase mode: cinematic idle orbit without controls UI, pause when offscreen, dpr cap), `src/app/dev/board3d/**` | U0 |
| U4 pages | `src/app/(protected)/play/**`, `settings/**`, `leaderboard/**`, `profile/**`, their component folders, `src/components/nav/**` header | U0 |
| U5 visual QA | browser screenshots + fixes across all of the above (runs after U1–U4) | all |

File-level anchors from the current code are listed in §10 (filled in from the code map).

## 10. Code anchors (current implementation)

_Filled in below from the code survey; agents must read this before editing._

### 10.1 Tokens, fonts, chrome
- `src/app/globals.css`: shadcn neutral set in oklch (achromatic), `@custom-variant dark (&:is(.dark *))`, custom `--board-light/dark/select/legal/capture/last/check` exposed as `--color-board-*`, `--radius: 0.625rem`, `--font-heading` aliases Geist. U0 replaces the palette with §1.1 (keep the `--board-*` token NAMES; retune values), sets `--radius: 0.75rem`, adds `--font-display`.
- `src/app/layout.tsx`: loads `Geist`, `Geist_Mono`; provider chain Clerk → Convex → `ThemeProvider` (class, defaultTheme dark) → Tooltip → `PlayerSync`, `SiteHeader`, `main`, `Toaster`. U0 adds `Fraunces` (variable, axes opsz/SOFT/WONK) as `--font-display` and a theme toggle in the header (there is none today).
- `src/components/nav/{site-header,nav-links,auth-nav}.tsx`: sticky 56px header, brand "♞ 3D Chess", `NavLinks`, Clerk `UserButton` / sign-in links (client `useAuth`). U4 restyles; keep `prefetch={false}` on every Link.
- shadcn (base-nova): `tabs`, `toggle-group`, `dropdown-menu`, `popover`, `sheet`, `slider`, `separator` are installed but unused — use `Tabs` for the sidebar, `DropdownMenu` for Camera/PGN menus, `Sheet`/`Drawer` for mobile.

### 10.2 Landing today
- `src/app/page.tsx` → `src/components/landing/hero.tsx` (static copy, `HeroActions` from `src/components/nav/auth-nav.tsx`) + `live-ticker.tsx` (Convex live games query, chips). U1 replaces both with §3; keep `HeroActions` semantics (guest vs signed-in CTAs) and the live-games query.

### 10.3 Game screen today (U2 rebuilds per §5)
- `src/components/game/game-shell.tsx`: `mx-auto grid max-w-6xl lg:grid-cols-[minmax(0,1fr)_20rem]`; left: `GameHeader` (contains `board-view-toggle.tsx`), `SpectatorBanner`, `DrawOfferDialog` (inline banner), `BoardSurface` + `TurnOverlay`, `ReviewBar` + two Drawer triggers ("Moves" mobile, "Room" everywhere → `SettingsForm` in a Drawer, calls `preloadRoomAssets()`), `GameControls` (Resign AlertDialog, Offer draw, Take back/Undo move, Rewind to here, Flip board, `hintSlot` = `src/components/ai/hint-button.tsx`, `san-input.tsx`), `CommentaryPanel` (AI only). Right aside: `MoveHistoryPanel` (PGN copy/download in its footer). Overlays: `PromotionPicker` (Dialog), `GameResultDialog`, `MoveAnnouncer` (sr-only live region — keep).
- Controller: `useGameController(gameId)` in `src/hooks/use-game-controller.ts` returns `GameController` (`src/lib/types.ts:180-272`): `ready, error, view, role, board: BoardViewProps, history: MoveHistoryRow[], reviewPly, isLive, autoplay, pending, canMove, canUndo, canResign, canOfferDraw, drawOfferFrom, flipping, turnLabel, actions` with `actions = { selectSquare, deselect, move, choosePromotion, submitSan, undo(toPly?), resign, offerDraw, respondDraw, goToPly, stepReview, setAutoplay, setBoardView, setOrientation, copyPgn, downloadPgn }`. **Split rule:** `GameShellView({ controller, viewerRole, game meta })` must be a pure component that takes this object as a prop; the container `GameShell` calls the hook and passes it. The `/dev/game` harness constructs a `GameController`-shaped mock (all actions are no-op/stateful stubs).
- AI commentary: persisted rows in Convex table `commentary` (`{ gameId, ply, text, source, persona?, createdAt }`, index `by_gameId_and_ply`, read via `api.commentary.forGame`); live state in `useAiStore` (`src/lib/stores/ai-store.ts`: `engineStatus, downloadPercent, phase: idle|engine|agent|applying, streamingCommentary, lastSource, lastLatencyMs, hint, hintPending, error`). `src/components/ai/commentary-panel.tsx` currently renders a list (no bubbles, no composer) with `EngineLoading` and `AiThinkingIndicator` — U2 rebuilds it as the Chat tab (§5.1) keeping `EngineLoading` (progress bar) as a system chip/bubble, and keeps `hint-button.tsx` behaviour (3 per game, beginner/casual) inside the composer area.
- Keyboard today: only board-local handlers (2D grid roving cursor in `board-2d.tsx`; 3D camera keys in `board-3d.tsx`) and the SAN form. U2 adds `src/hooks/use-shortcuts.ts` (document-level, ignores inputs/textareas/contenteditable) and `use-fullscreen.ts`. No fullscreen exists anywhere.
- ui-store (`src/lib/stores/ui-store.ts`, persisted + mirrored to Convex `players`): `boardView, roomPreset, roomColors, boardFlipEnabled, qualityTier, postFxEnabled`; session-only: `resolvedTier, cameraPreset (white|black|top|cinematic), cinematic, reducedMotion, orientation, historyDrawerOpen, settingsDrawerOpen, roomImageUrl, engineBuild`. U2 adds session-only `layoutMode: "default" | "focus"` + `setLayoutMode`; do NOT add it to `partialize`.

### 10.4 Board3D contract (U3) and the showcase override
- `Board3D` (`src/components/board3d/board-3d.tsx`, default export) takes only `BoardViewProps`; `Board3DLoader` (`board-3d-loader.tsx`) is the `next/dynamic` ssr:false wrapper with `preloadBoard3D(hdriFiles?)`. Room/colours/tier/postFx/camera/cinematic/reducedMotion come from `useBoardSettings(props)` reading the ui-store. In-canvas overlay: White/Black/Top/Orbit/Reset buttons (`setCameraPreset`), `role="application"` keyboard camera.
- **Additive contract (U3 implements, U1/U4 consume):** add an optional prop to `Board3D`/`Board3DLoader`:
  `showcase?: { roomPreset: RoomPresetId; roomColors?: RoomColors | null; cameraPreset?: "white" | "black" | "top" | "cinematic"; tier?: "low" | "medium" | "high"; postFx?: boolean; hideControls?: boolean; pauseWhenOffscreen?: boolean; maxDpr?: number }`.
  When present, `useBoardSettings` uses these values instead of the store (never writes the store), the overlay controls are hidden when `hideControls`, the cinematic orbit runs without exiting on hover, the Canvas `frameloop` switches to "demand" while an `IntersectionObserver` reports the wrapper offscreen, and `dpr` is capped at `maxDpr` (default 1.5 in showcase). Add the same toggle to `/dev/board3d` ("Showcase: on/off").
- `useUiStore.setCameraPreset("cinematic")` sets `cinematic = true` and any user interaction exits it (`onUserInteract`) — the showcase mode must bypass that exit.

### 10.5 Pages today (U4)
- `/play` `src/app/(protected)/play/page.tsx` → `src/components/play/mode-picker.tsx` (3 Cards + Spectate Card; `find-match-panel.tsx`, `spectate-list.tsx` Table, `ai-setup-dialog.tsx` (Select difficulty + persona table + colour RadioGroup), `local-setup-dialog.tsx`). Rebuild per §6 keeping the same mutations/queries and the queue redirect logic.
- `/settings` → `settings-form.tsx` (Board / Room / Graphics / Credits Cards; `room-picker.tsx` with `warmRoom` + `preloadRoomAssets`, `quality-picker.tsx`, `colour-pickers.tsx`, `attributions.tsx`; there is now also an Engine section). Rebuild per §6 with the sticky preview (Board3D showcase mode, `interactive=false`).
- `/leaderboard` → `leaderboard-table.tsx` + `leaderboard-filters.tsx` (public). `/profile/[username]` → `profile-header.tsx`, `rating-sparkline.tsx` (inline SVG), `recent-games-table.tsx`.
- `/sign-in`, `/sign-up`: Clerk `<SignIn/>` centred; U4 adds the Clerk `appearance` prop mapped to the tokens (verify the appearance API in node_modules/@clerk/nextjs types before use).
- `src/components/board2d/pieces-svg.tsx` has the 12 piece glyphs; `MiniBoard` (U0) reuses them.

### 10.6 Tests to keep green
- `pnpm test` (vitest: 291 tests incl. `src/lib/__tests__/errors.test.ts` scanning error copy — keep `src/lib/errors.ts` as the single copy source), `pnpm e2e` public spec (`e2e/public.spec.ts` asserts hero + ticker region, leaderboard tabs, sign-in card, /play redirect, /dev/board3d canvas role=application + camera overlay buttons) — update its selectors with the new markup, keep intent.
