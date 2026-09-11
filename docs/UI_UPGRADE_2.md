# UI upgrade 2: landing, lobby, game

Owner's brief (2026-09-10): "upgrade the landing page, the game selection screen and the playing
screen, needs a huge upgrade", using the UI/UX Pro Max skill. This document is the build contract
for that round. It changes structure, density and materiality inside the committed Castle world;
it does not open a new visual direction.

## 0. Authority and inputs

Precedence when anything conflicts: `DESIGN.md` (tokens, type ramp, named rules) → `PRODUCT.md`
and `docs/BRAND_BRIEF.md` §4 (voice, lexicon) → this document → the Pro Max search outputs → habit.

Pro Max inputs (run 2026-09-10, `python3 .claude/skills/ui-ux-pro-max/scripts/search.py`):

- `--design-system -p Castle` recommended the **3D & Hyperrealism** style ("depth, realistic
  textures, 3D models, spatial navigation, tactile, immersive"; best for gaming and product
  showcase; accessibility risk high: contrast 4.5, keyboard, visible focus, reduced motion), the
  **Feature-Rich Showcase / Immersive-Interactive** landing pattern, a "felt green + gold on dark"
  palette note (which is baize + brass on espresso: DESIGN.md already owns it), an editorial serif
  + humanist sans pairing (Fraunces + Geist already own it), and a **stagger-list** motion preset
  (300–450 ms, `back.out(1.4)`-style overshoot, grid-aware stagger, reduced-motion final state).
- `--domain landing`: **Interactive 3D configurator** (hero is the configurator; named rotate/zoom
  buttons and keyboard controls, pause offscreen, reduced-motion final state) and **Real-time
  landing** (label telemetry live only when backed by a current source; static under reduced
  motion).
- `--domain gsap`: scroll reveal with small y offset (8–16 px reads as a fade, not a slide), stagger
  per item 30–80 ms, never more than ~8 staggered children, `play none none reverse`.
- `--domain ux`: auto-rotating content needs pause; focus ring on every control incl. inside
  dialogs; mobile-first; touch targets 44 px with 8 px gaps; `min-h-dvh`; no horizontal page
  scroll; skeletons over spinners; one primary CTA per screen.

Impeccable craft floor (binding): **no kicker/eyebrow above a heading** (a ban); no same-size
icon+heading+text card grids as page structure; nested cards are always wrong; no gradient text;
one authored motion moment per page, not an identical entrance on every section; shadows carry an
offset and a soft blur; theme the browser surfaces (selection, caret, scrollbar, focus ring,
tabular numerals); every state (hover, focus, disabled, loading, error, empty) present.

Detector findings to clear in this round (`impeccable detect`, 2026-09-10): `kicker-above-heading`
×5 on `/`; `nested-cards` ×5 on `/` and ×1 in the result dialog; `gpt-thin-border-wide-shadow`
(1 px hairline + 60 px blur) on the action bar, HUD and dialogs; `layout-transition: height` in the
game frame; off-ramp `text-[…]` sizes in `display.tsx`, `promotion-picker.tsx`, `turn-overlay.tsx`,
`game-result-dialog.tsx`, `podium.tsx`.

## 1. Rules for every builder

**Ownership.** Three builders work in the same tree at the same time. Each edits only the files
it owns and creates new files only inside its own folders. Nobody edits `src/app/globals.css`,
`src/components/ui-kit/index.ts`, `DESIGN.md`, `PRODUCT.md`, `e2e/**`, `convex/**`, or another
builder's files. Requests for those go in the builder's structured report; the integrator applies
them.

| Builder | Owns | May import but not edit |
|---|---|---|
| landing | `src/app/page.tsx`, `src/components/landing/**` | ui-kit, `src/components/play/spectate-list.tsx` (SpectateCardView), lib |
| lobby | `src/app/(protected)/play/page.tsx`, `src/components/play/**`, the play slice of `src/app/dev/pages/gallery.tsx` | ui-kit, `src/components/settings/room-picker.tsx`, board3d loader, lib |
| game | `src/components/game/**`, `src/components/ai/game-chat.tsx`, `src/app/dev/game/**`, and these ui-kit files only: `action-bar.tsx`, `chat-list.tsx`, `chat-message.tsx`, `focus-hud.tsx`, `move-list.tsx`, `player-chip.tsx`, `kbd.tsx`, `shortcuts-dialog.tsx`, `stat-pill.tsx` and their `__tests__` | everything else |

Backward compatibility inside ui-kit: the game builder may add optional props to the files it owns
but may not rename or remove exports or change defaults, because `player-chip.tsx` and
`stat-pill.tsx` are also used by the landing page.

**Custom CSS.** No builder touches `globals.css`. Screen-specific CSS (keyframes, masks, scrollbar
theming, `@starting-style` entries, scroll-driven animations) goes in a file the builder owns,
`src/components/<landing|play|game>/<name>.css`, imported once from that screen's top-level client
component. Use existing tokens (`var(--bg-elevated)`, `var(--accent)`, `var(--dur-*)`,
`var(--ease-out-soft)`); introduce no new colours. Tailwind utilities in JSX need nothing.

**Tokens and type.** Only DESIGN.md colours, in their named roles (brass for the one action or
selection, baize only for live/turn/success, ember only for danger/check, every neutral warm). Type
steps: display, headline, title, body, label, data (mono, `tabular`), micro (12 px floor). Where an
existing element uses an off-ramp `text-[…]` size in a file you own, move it to the nearest ramp
step; app-frame verdicts and overlays use the new `headline-sm` step (2 rem) the integrator adds.

**Copy.** Club-host voice: sentence case, plain verbs, no exclamation marks, never "Submit",
never explain the stack, "opponent" for humans and AI alike, "take back" in AI games and "undo"
in local games, "room", "seat", "review", "replay". At most one light line per screen.

**Selectors that must survive** (Playwright and vitest pin them; keep the exact strings, roles and
attributes):

- Landing: `h1` "Chess you can walk around."; link "Play now"; list named "Moves played so far"
  containing `e4`; text "Now playing · Morphy vs Duke Karl & Count Isouard · Paris, 1858";
  `#rooms` containing the room buttons; link "Find a match" with an `href`; region named
  "Games in progress." containing heading "Top rated"; text "Chess pieces by Jarlan Perez via
  Poly Pizza — CC BY 3.0"; `[data-showcase=true]` on the hero canvas wrapper; `[data-hero-flag]`.
- Lobby: `h1` "Play"; button "Find a match"; group named "Opponent" with buttons named exactly
  "Pip" … "Kasparova" carrying `aria-pressed`; button "Play Pip" (i.e. `Play {persona.name}`);
  colour group labelled by `#ai-colour-label`; label "Player 2 name"; button "Start the game"
  visible on load without any click; link "Resume game" when a game is active; toast text
  "Match found — good luck." and the auto-redirect to `/game/{id}`.
- Game: toolbar named "Game actions"; buttons `2D`/`3D`, "Flip", "Fullscreen", "Take back",
  "Undo move", "Room", "Shortcuts", `/^Ask for a hint/` with `aria-label="Ask for a hint. N of M
  left."`, "Resign the game", "PGN export", "Camera angle"; exactly three `role=tab` (Chat, Moves,
  Info) with Chat selected in AI games; list named `Conversation with {persona}` containing
  "You played e4"; `data-testid="chat-ai-message"` on opponent bubbles; tabpanels "Chat" and
  "Moves"; `[role="list"][aria-label="Moves"] button[aria-label^="Move "]` and the name
  "Move 1, e4"; text "No moves yet."; `role=status` text matching `/to move|Your move|Game over/`
  incl. "Your move — pick a piece"; `html[data-layout="focus"]`, `header[data-slot="site-header"]`
  hidden in focus, `[data-slot="focus-hud"]`, `[data-slot="focus-hud-fade"]`, buttons "Exit
  fullscreen" and "Keyboard shortcuts" outside the fading layer; `role=alert` containing "offers a
  draw" with buttons "Accept"/"Decline"; `role=alertdialog` with button "Resign"; result `dialog`
  with button "Review game"; grid named `/chess board/i` with `[data-square]` cells; application
  named `/3D chess board/i`. Vitest: `action-bar.test.tsx`, `chat-message.test.tsx`,
  `mini-board.test.tsx` (the game builder updates the first two if the markup they pin changes).

**Verification per builder** (batched, not a loop): screenshots at 390, 768, 1024 and 1440 in
dark and light of every state you touched, via a Playwright script in the scratchpad (`chromium`
from `@playwright/test`, `page.emulateMedia({colorScheme})`), then one fix batch, then one confirm
round. `pnpm typecheck` and `pnpm lint` clean for your files; `pnpm test` green for tests you own;
`impeccable detect` on your folders shows no blocking finding and no `kicker-above-heading`,
`nested-cards` or `gpt-thin-border-wide-shadow`.

## 2. Landing page `/` (mode: Persuade)

Spatial thesis: one theatrical element (the lit board) and everything else quiet, in the order
board → invitation → three ways to sit → who you will play → who is playing now → credits. The page
is a 12-column, 80 rem grid, 96 px between sections (64 px on mobile). No eyebrows anywhere; the
headings carry themselves.

### 2.1 Hero (keep, refine)

Keep the current composition (headline left, live board glow anchored to the top-right and
dissolving toward the copy; canvas under the transparent header on desktop; the Opera Game replay
with the notation strip and caption). Changes:

- Delete the "Online 3D chess" eyebrow. The `h1` stays exactly "Chess you can walk around." with
  `walk` as the single brass italic.
- Sub-line: "Sit at a board in a room you chose. Play people near your rating, or an opponent
  that tells you what it thinks."
- CTAs unchanged in name: "Play now" (primary) and "Watch live games" (outline). Keep the 44 px
  height on touch.
- The two live counters stay as chips beneath the CTAs but read as one sentence, mono numerals:
  "● 3 playing now · 14 games played" (the dot is baize only when the count is above zero; at
  zero the chip has no dot and reads "0 playing now"). Never fabricate a count; skeletons while
  loading.
- **Room switcher moves into the hero.** Replace the separate "Pick where you sit" section with a
  segmented room switcher directly under the caption line, still `id="rooms"`, still a `<ul>` of
  five buttons: a 36 px round swatch per room painted from the room's own colours (two halves:
  floor and light, defined in `src/lib/rooms.ts`) with the label beside it, selected = brass ring,
  `aria-pressed`. Hover intent (120 ms) previews, click commits, arrow keys move between rooms.
  The board crossfades to the new room over `--dur-room`; under reduced motion it swaps.
- Add one host line under the switcher: "Every room lights the same board. Pick the one you would
  sit in." (this is the page's one light line; nothing else on the page jokes).
- The 3D canvas keeps `showcase` mode (`cameraPreset: "cinematic"`, `postFx: false`,
  `hideControls`, `pauseWhenOffscreen`, `maxDpr 1.5`, tier medium ≥ 768 px, low below). Add a
  visible **pause/play control** for the replay (Pro Max: auto-rotating content needs a stop):
  a ghost icon button beside the caption, `aria-label="Pause the replay"` / "Play the replay",
  paused state persists for the visit; reduced motion starts paused on the final position.

### 2.2 Three ways to sit down (replaces the Modes card grid)

An editorial **ledger**, not cards: three full-width rows separated by seam hairlines, each row a
12-column split: title and copy in columns 1–6, an artefact in columns 8–12 (artefact first on
mobile, then title, then copy). Titles in Fraunces headline size; the row's link is the title itself
(one link per row, named as below) plus a brass arrow that slides 4 px on hover.

1. **Find a match** → `/play?mode=online`. Copy: "Rated games against people near your rating.
   The window starts at ±{QUEUE_BASE_RANGE} and widens every {QUEUE_WIDEN_INTERVAL_MS/1000}
   seconds until someone sits down." Artefact: the **widening window**: a horizontal rating rail
   (mono ticks 800 … 2400) with a brass bracket centred on "you" that breathes outward once on
   reveal (motion-safe only) and rests at the widened state.
2. **Play the AI** → `/play?mode=ai`. Copy: "Five opponents from Beginner to Grandmaster. Each
   one tells you what it was thinking after every move." Artefact: two real chat bubbles from the
   product (the ChatMessage `ai` variant, lettered brass disc, move label) with Marco's sample
   line and a player reply bubble, exactly as they look in a game.
3. **Pass and play** → `/play?mode=local`. Copy: "Two people, one device. The board turns to face
   whoever is to move, and either of you can undo." Artefact: a `MiniBoard` (size ~200) that flips
   orientation when the row is hovered or focused (motion-safe), with two small seat chips
   "White · Player 1" / "Black · Player 2" swapping ends.

Heading for the section: "Three ways to sit down." (Fraunces, no eyebrow).

### 2.3 Five opponents, five opinions (replaces the persona card grid)

Heading "Five opponents, five opinions." Below it a **roster**: one row on desktop, five columns
separated by seam hairlines (`divide-x`), each column: lettered brass disc (48 px), name in title
size, "{label} · {rating}" in mono, "3 hints" micro chip for Pip and Marco, and one sample line set
as a compact opponent bubble (the `SAMPLE_LINE` copy already in `opponents.tsx`). Ratings rise left
to right so the row itself reads as a ladder; a faint rule under the discs climbs with them. On
mobile the roster is a horizontal snap list (`-mx-4 snap-x`), one column per screen and a half.
Reveal: staggered 60 ms per column (five children, inside the Pro Max limit), static under reduced
motion. No cards, no nested surfaces.

### 2.4 Games in progress (keep the data, upgrade the display)

Keep the `Section id="live-now"` region named "Games in progress." and the aside heading "Top
rated". Live games render as **board tiles**: `MiniBoard` (size ~220, real FEN via
`api.games.get`, last move highlighted) with the two players as `PlayerChip`s above and below in
seat order, a baize "live" dot, move count in mono, and the whole tile a link named "Watch {white}
against {black}" (keep the `useConvexAuth` gate: signed-out visitors see the boards and a "Sign in
to watch" outline button instead of the links). Up to six tiles in a 3-up grid (2-up at 768, 1-up
at 390). Empty state (host voice): "No live games right now. Start one and it will show up here."
"Top rated" uses the existing `Podium` for the top three and a mono list for 4–5; entries link to
profiles.

### 2.5 Footer

Keep every credit line verbatim. Set the wordmark "Castle" in Fraunces at headline size with the
knight glyph, links in parchment, hairline above. No other change.

### 2.6 Motion budget

The hero is the page's authored moment (word rise + glow fade, already built). Everything else is
a 12 px fade-up on scroll (`Reveal`, existing) except the three artefacts, each of which has one
small motion of its own (bracket breath, bubble entrance, board flip) that plays once on reveal.
All of it is off under `prefers-reduced-motion`.

## 3. Game selection `/play`: "the lobby" (mode: Operate, one committed moment)

Spatial thesis: choose a seat on the left, see your table on the right. The lobby is where a
player configures a game (opponent, colour, room) so it earns the product's one theatrical element:
a live preview of *their* board in *their* room.

### 3.1 Layout

App width (75 rem). From 1024 px: two columns, `minmax(0, 34rem) minmax(0, 1fr)` with a 40 px
gutter; the right column is `sticky top-20` and holds the table preview. Below 1024 px: a single
column, preview hidden, everything else in order. Page title `h1` "Play" in Fraunces headline with
the host line "Take a seat." beneath it; no eyebrow. When `myActiveGame` exists, the existing banner
with the "Resume game" link sits directly under the title.

### 3.2 The three seats (left column)

Three **stacked panels** separated by seam hairlines on the espresso ground (walnut only for the
inner controls, never a card inside a card). All three are visible on load; nothing is behind a tab
or modal. Deep links `?mode=online|ai|local` scroll the matching seat into view and give it the
brass ring for one second.

1. **Online match.** Title "Find a match", line "Rated. Someone near {myRating} first; the window
   widens every ten seconds." Primary button "Find a match" (brass; the lobby's one brass button
   while idle). In the queue the panel becomes the **waiting state** in place: elapsed time
   (mono, `aria-live="polite"`), the widening-window rail (same visual as the landing artefact, now
   live: bracket width = current range), "Cancel" (outline) and "Play the AI while you wait"
   (ghost). The match-found toast and redirect stay as they are.
2. **The opponent.** Title "Play the AI". The **persona roster**: five 44 px lettered discs in a
   row (`role="group" aria-label="Opponent"`, each a button named exactly by persona name with
   `aria-pressed`), name and "{label} · {rating}" in micro/mono beneath each; the selected disc
   carries the brass ring. Under the roster the selected persona speaks: one opponent bubble
   (ChatMessage `ai` variant) with their sample line, and a micro line "{label} · {rating} · 3
   hints" (hints only where allowed). Colour: a three-way segmented control White / Black / Random
   (`aria-labelledby="ai-colour-label"`, label text "Your colour"). Primary button "Play {name}"
   (brass; when this seat is focused it is the primary, and the online button drops to outline: one
   brass button per view). Selecting Black flips the table preview.
3. **Same device.** Title "Pass and play", line "Two people, one device. The board turns to face
   whoever is to move." Field with visible label "Player 2 name" (placeholder "Player 2"), button
   "Start the game" (outline). No other fields.

All controls 36 px tall minimum with 8 px gaps; disabled states keep their label at 50 % opacity
with a tooltip that says why (not signed in, already in a game).

### 3.3 The table preview (right column, ≥ 1024 px)

A **nameplate** ("{username} · {rating}" mono, avatar disc) above the player's board in the
player's room: `Board3DLoader` in showcase mode (`roomPreset` = the player's saved preset or
`study`, `cameraPreset: "cinematic"`, `postFx: false`, `hideControls`, `pauseWhenOffscreen`,
`maxDpr 1.5`, tier low), starting position, `orientation` following the colour choice ("Random"
shows white), masked with `.board-canvas-feather`, never framed. Under it a **room row**: five
round swatches (same component idea as the landing switcher; the lobby builder writes its own in
`src/components/play/`) that call `api.players.updateSettings` so the choice persists into the
game; a ghost link "Board & room settings" → `/settings`. When WebGL is unavailable or the tier is
low on a small laptop, the preview is a `MiniBoard` (size 320) in the room's square colours. The
preview pauses when the tab is hidden and when scrolled away.

### 3.4 Below the seats

- **At the boards.** Heading "At the boards", live games as the same board tiles as the landing
  (the lobby owns `SpectateGridView`; the landing imports `SpectateCardView` read-only, so keep its
  props backward compatible). Empty state text: "No live games right now. Start one and it will
  show up here."
- **Your recent games.** New. `api.games.myRecentGames({ limit: 8 })` rendered as a
  **scoresheet** (a table, mono): result mark (W in baize, L in ember, D in parchment, each with
  the letter so colour is never the only signal), opponent name, mode, rating change (`+16`/`−8`,
  mono, or "unrated"), "Replay" link → `/game/{id}`. Skeleton rows while loading; empty state:
  "Your games will be listed here once you have played one."

### 3.5 Dev harness

`/dev/pages?section=play` must render the new pure views with mock data: idle seats, the waiting
state (frozen at 47 s, range 400), a selected persona (Marco), the table preview in 2D fallback
form, the board tiles with three positions and the empty state, and the recent-games scoresheet
with six rows. The Convex-connected containers stay out of the harness.

## 4. Playing screen `/game/[id]` (mode: Operate)

Spatial thesis unchanged: the board owns the viewport, the labelled action bar sits directly
beneath it, the opponent's conversation lives on the right. This round raises materiality and
rhythm, clears the detector, and makes the sidebar read as a chat, a scoresheet and a match card.

### 4.1 Nameplates (player rows)

Replace the two plain player rows with **nameplates**: a 48 px walnut plate with a seam hairline,
containing avatar disc, name (title weight), rating in mono, the captured tray inline with a mono
material balance (`+2`), and a **turn lamp** at the leading edge: a baize dot with the text "to
move" that lights only for the side to move (Live Green rule). The far plate carries the status
pill (unchanged component and `role=status` text) and the mode chip ("AI · Beginner", "Online ·
Rated", "Local"). The near plate carries the spectator count when above zero ("3 watching", mono).
On mobile the plates compress to 40 px and drop the tray behind a `+2` that expands the tray on
tap.

### 4.2 Board: the room is not a box (owner feedback, 2026-09-10)

Today the 3D canvas is exactly the board square, so the room's light stops at a rectangle with a
5 % feather and reads as a boxed-off picture on the espresso ground (owner: "the background
shouldn't be boxed off like this"). Fix it structurally, not by fading harder:

1. **The canvas fills the whole board column.** In 3D the canvas is the full width and height of
   the area between the nameplates (the current `[container-type:size]` box), not the inner
   square; the camera frames by height, so the board stays the same size and the room simply
   continues to the column's edges, under the plates and up to the sidebar hairline. The square
   `aspect-square h-[min(100cqw,100cqh)]` constraint moves into the 2D branch only (the 2D board
   stays a centred square with square corners).
2. ~~**The edges dissolve into a matching ground.**~~ **Retired 2026-09-11 (owner: "Don't blur
   this background with the vignette").** With the canvas filling the column, its edges sit on
   the nameplates and the sidebar hairline, so no mask and no tinted ground are needed; the
   dissolve smeared the backdrop into a brown halo on the light theme. `.board-canvas-dissolve`
   is gone; `.board-canvas-feather` remains for the lobby preview only. Original text kept below
   for the record: The column paints a room-tinted ground behind
   the canvas: `--room-glow` set inline from the room's key-light colour (`ROOMS[id].lights.key
   .color`, e.g. study `#ffd9a8`, space `#bcd4ff`, park `#fff4e0`, arcade `#ff6ad5`; custom rooms
   use their floor colour) and a background of
   `radial-gradient(ellipse 70% 60% at 50% 45%, color-mix(in oklab, var(--room-glow) 18%,
   var(--bg)), var(--bg) 75%)`. The canvas mask becomes a real dissolve: 12 % feather left and
   right, 8 % top and 14 % bottom (a new `.board-canvas-dissolve` class the integrator adds to
   `globals.css`; `.board-canvas-feather` stays for the lobby preview). Because the canvas now
   extends far beyond the board, the feather never touches a corner square.
3. **Nothing frames it.** No hairline, no card, no shadow around the canvas; the plates and the
   action bar sit on their own walnut plates over the tinted ground. In the focus layout the
   canvas already fills the viewport; apply the same dissolve there so the HUD floats over room
   light, not over a rectangle. Verify with a screenshot at 1440×900 and 1280×800 that no
   straight canvas edge is visible against the ground in any room (study, space, park, arcade,
   minimal) and that a8/h1 are fully lit.

### 4.3 Action bar

Same component, same names, same shortcuts. Visual upgrade: a walnut plate with a seam hairline
and **no shadow** (it is structural; the vitest assertion on `shadow-soft` moves to the focus HUD
where the shadow belongs); actions grouped by `ActionSeparator` into View (2D/3D, Flip, Camera
angle), Play (Ask for a hint with "N left", Offer draw or Take back/Undo move), Game (Resign the
game in ember ghost, PGN export) and Frame (Room, Shortcuts, Fullscreen at the far right). Labels
show from 1280 px, icon-only with a tooltip and `Kbd` cap below. Buttons 36 px tall on touch.
Disabled buttons keep their tooltip and say why.

### 4.4 Sidebar

- **Chat tab.** A **persona header plate** at the top: lettered brass disc, name, "{label} ·
  {rating}" mono, and a status line that is the game's live truth: "thinking…" with the three
  dots while the engine runs, "to move" (baize dot) when it is the opponent's turn, "your move"
  when it is yours, "watching" for spectators. Then `ChatList`, then the composer row with the hint
  button. Bubbles: opponent = walnut, top-left corner 4 px, disc + move label in mono; player =
  seam bubble with brass text, right-aligned, top-right corner 4 px; system events = centred
  parchment chips; max bubble width 85 %. New bubbles enter over `--dur-bubble` (fade + 6 px rise),
  static under reduced motion. Empty state unchanged in text.
- **Moves tab.** A **scoresheet**: a two-column grid per move number (mono number column in
  parchment, White and Black SAN as buttons in mono), current ply on a seam plate with brass text,
  the row auto-scrolled into view, ←/→ keyboard review, the autoplay controls in a 36 px row, then
  the live-position note. Keep the list role, the button names and "No moves yet.".
- **Info tab.** A **match card** as a definition list: mode, opponent, rating pool, room, quality
  tier, spectators, game id, with "PGN export" and "Board & room settings" as ghost actions.

### 4.5 Floating layers, dialogs and the HUD

Floating layers rely on the soft shadow alone: **no 1 px hairline on anything that floats**
(focus HUD, tooltips, popovers, dialogs, the mobile sheet). Structural layers (nameplates, action
bar, sidebar) carry a hairline and no shadow. The result dialog loses its inner box: verdict in
Fraunces (`headline-sm` in the app frame), reason and rating line as prose, actions in one row. Turn
overlay and promotion picker use ramp sizes (`headline-sm` for text, `size-*` for piece glyphs).
Replace any `transition: height` with a transform, `grid-template-rows` or `interpolate-size`
animation.

### 4.6 Mobile

Structure unchanged (plate, square board, sticky bar, sheet with the three tabs). The sheet peek
shows the persona header line and the last bubble; the sheet opens to 60 dvh. All targets 44 px.

### 4.7 Dev harness

`/dev/game?scenario=…` must show every state above: `ai-midgame` (thinking header, bubbles),
`ai-hint`, `online-draw-offer` (alert with Accept/Decline), `local-flip`, `review` (scoresheet
with a reviewed ply), `finished` (result dialog), `fullscreen` (HUD). Add nothing that needs
Convex.

### 4.8 Critique items folded into this round (heuristic re-run, 2026-09-10, 29/40)

The game builder owns these; they are not optional polish.

1. **Fullscreen keeps the status and the voice.** Pass `GameStatusPill` into the focus HUD's
   top-centre slot (outside the fading layer, so Check is never hidden) and add a chat affordance
   to the desktop focus layout: the newest opponent bubble as a dismissible HUD card plus a "Chat"
   pill that opens the conversation as an overlay (the pattern the mobile focus layout already
   has). Fullscreen must never silence the opponent.
2. **Accepting a draw is guarded like resigning.** Accept opens the same alert-dialog pattern
   `ResignAction` uses ("Accept the draw?" / "The game ends as a draw and both ratings are
   updated." / "Keep playing"). Decline stays the quiet default. Both buttons move from the 28 px
   size to the 32 px token, 36 px on coarse pointers. The banner names the person, not the colour:
   "adrienne offers a draw." (fall back to the colour only when no name exists).
3. **Touch floor.** A `(pointer: coarse)` minimum of 36 px on `ActionButton` and the shared
   `Button`, 44 px for destructive rows in the mobile "More actions" sheet, so the focus HUD and
   the sheet inherit it instead of call-site patches.
4. **Result dialog.** Initial focus lands on "Play again"; the background is `inert` while it is
   open; the body is the Fraunces verdict, one result line and the rating line in mono. No
   repeated statement of the same fact.
5. **Key collision.** Move the 3D board's camera keys off the review keys: orbit on Shift+arrows
   (and `[` / `]`), reset via the Camera menu; arrows and R keep their global meaning everywhere.
   Document whatever survives in the shortcuts dialog and in the board's `aria-label`, and say
   there how to move a piece ("Click a piece, then a highlighted square; press T for the 2D board
   with keyboard squares").
6. Minor, same files: the hint action is named "Ask for a hint" everywhere (mobile bar included,
   with "N left" as a count beside it); the composer's hint button is a ghost, not the only brass
   on the screen; "Room" is the one name for the room action; the SAN input off-turn is
   `aria-disabled` with a reason, not `disabled`; on a finished game the hint reason is "The game
   is over."; the status pill shows the ply while reviewing ("Reviewing 12…Nf6") so every arrow
   press changes it; the review state also changes the nameplate lamp text to "reviewing".

## 5. Integration and verification

Integrator (after the three builders): apply the builders' shared-file requests (`globals.css`
scrollbar/selection/caret theming and any `@utility` they asked for; `ui-kit/index.ts` exports for
components worth promoting; DESIGN.md: add `headline-sm` (2 rem, 500, 1.1) to the type ramp and
the sentence "Floating layers rely on the shadow alone: no hairline." under Elevation); delete
components nothing imports any more; run `pnpm typecheck`, `pnpm lint`, `pnpm test`; fix fallout.

Verification round (parallel): `pnpm e2e` and `pnpm e2e:auth` against the dev server;
`impeccable detect --json` over `src/components/{landing,play,game,ai,ui-kit} src/app/page.tsx
'src/app/(protected)/play'` with zero blocking findings and none of the three named rules; a visual
review of every screen and state at 390/768/1024/1440, dark and light, against §2–§4 and the Pro
Max pre-delivery checklist (no emoji icons, `cursor-pointer` on clickables, 150–300 ms hovers,
4.5:1 text contrast in both themes, visible focus on every control, reduced motion respected,
no horizontal page scroll, 44 px touch targets); `pnpm build`. One fix batch, one confirm round,
then commit and deploy.

## 6. Code map (verified 2026-09-10)

Landing: `src/app/page.tsx` (31, server; composes HeroBodyFlag, Hero, Modes, Opponents, LiveNow,
LandingFooter) · `landing/hero.tsx` (116, client; room state, `useInView`, `useShowcaseGame`,
tier by `useMediaQuery(min-width:768px)`; renders HeroBoard, HeroCtas, LandingStats,
NotationStrip, caption, then `Section id="rooms"` with RoomStrip) · `hero-board.tsx` (134; 3D via
`Board3DLoader` with `showcase: { roomPreset, cameraPreset: "cinematic", tier, postFx: false,
hideControls: true, pauseWhenOffscreen: true, maxDpr: 1.5 }`, 2D `MiniBoard size={640}` fallback,
`.hero-canvas-blend`) · `use-showcase-game.ts` (204; `OPERA_GAME_SAN`, 1800 ms per move,
`SHOWCASE_CAPTION`) · `hero-ctas.tsx` (42; `useAuth`, "Play now" → /play or /sign-up, "Watch live
games" → #live-now) · `landing-stats.tsx` (44; `api.stats.landing` → `{playingNow, gamesPlayed}`,
cap "1000+") · `modes.tsx` (78, server; 3 ModeCards linking `/play?mode=online|ai|local`, copy uses
`QUEUE_BASE_RANGE`, `QUEUE_WIDEN_INTERVAL_MS`, `MAX_HINTS_PER_GAME`) · `opponents.tsx` (51, server;
`DIFFICULTIES`/`DIFFICULTY_ORDER` + local `SAMPLE_LINE`) · `live-now.tsx` (169;
`api.games.listLive {limit: 6}`, `api.leaderboard.top {filter:"all", limit:5}`, `useConvexAuth`
gate, region "Games in progress.", aside h3 "Top rated") · `room-strip.tsx` (95; `ROOMS`,
`ROOM_ORDER`, hover intent 120 ms, `preloadBoard3D`) · `notation-strip.tsx` (71; list "Moves
played so far") · `landing-footer.tsx` (102, credits) · `hero-body-flag.tsx` (15) ·
`use-in-view.ts` (89; `useMounted`, `useDocumentVisible`, `useMediaQuery`, `useInView`).

Lobby: `src/app/(protected)/play/page.tsx` (23; Section width="app", Eyebrow, Display h1 "Play",
Suspense → ModePicker) · `play/mode-picker.tsx` (217; `api.players.me`, `api.games.myActiveGame`,
mutations `queue.leave`, `games.createAiGame {difficulty, playerColor}`, `games.createLocalGame
{playerTwoName?}`, all "skip" until `isAuthenticated`; `?mode=` aliases; FR-24 auto-redirect with
toast "Match found — good luck."; active-game banner with link "Resume game") · `ai-setup.tsx`
(129; `AiSetupProps {onStart(difficulty, playerColor); starting?; disabled?; notice?}`, persona
chips group "Opponent", colour group `aria-labelledby="ai-colour-label"`, submit "Play {name}") ·
`local-setup.tsx` (61; label "Player 2 name", `MAX_LOCAL_NAME_LENGTH`, submit "Start the game") ·
`find-match-panel.tsx` (258; `QueuePanelView` pure + `FindMatchPanel`; `api.queue.myStatus`,
`queue.join`, `queue.leave`; bar labelled "Rating window", `BAR_MAX_RANGE = 1000`) ·
`spectate-list.tsx` (179; `SpectateCardView`, `SpectateGridView`, `SpectateList`;
`api.games.listLive {limit: 9}` + per-card `api.games.get` for the FEN) · `api.games.myRecentGames
{limit}` returns `vGameSummary[]` (read `convex/games.ts` for the fields) · dev harness
`src/app/dev/pages/{page.tsx,gallery.tsx,sections.ts}` with `?section=play`.

Game: `src/app/(protected)/game/[id]/page.tsx` (44; `preloadQuery(api.games.get)`, `GameShell
gameId initialView`) · `game-shell.tsx` (265, container; builds `meta: GameShellMeta`) ·
`game-shell-view.tsx` (685, pure view; props `{controller: GameController; viewerRole; meta}`;
`GameShellMeta {commentary, opponentStale, opponentOnline, spectatorCount, hint, rating,
playAgainPending, onPlayAgain, onRetryEngine?, roomSettings?, onRoomOpenChange?}`; grid
`lg:[minmax(0,1fr)_23.75rem] xl:[…_25rem]`; focus = `fixed inset-0 z-50` + `data-layout="focus"`
on the div and `<html>`; board box `[container-type:size]` + `aspect-square
h-[min(100cqw,100cqh)]`) · `GameController` in `src/lib/types.ts:248` (`ready, error, view, role,
board, history, reviewPly, isLive, autoplay, pending, canMove, canUndo, canResign, canOfferDraw,
drawOfferFrom, flipping, turnLabel, actions`) · `game-action-bar.tsx` (429; exports `ResignAction`,
`GameActionBar`; `variant: "full" | "focus"`) · `game-mobile-bar.tsx` (319) · `game-sidebar.tsx`
(591; `GameSidebar`, `GameSheetPeek`; shadcn Tabs Chat/Moves/Info) · `game-status-pill.tsx` (143) ·
`board-surface.tsx` (106) · `captured-tray.tsx` (59) · `draw-offer-dialog.tsx` ·
`game-result-dialog.tsx` · `turn-overlay.tsx` · `promotion-picker.tsx` · `ai/game-chat.tsx` (262;
`ChatHintState`, `GameChatProps`; `useAiStore` phase/engineStatus) · ui-kit: `action-bar.tsx`
(ActionBar, ActionGroup, ActionSeparator, ActionButton), `chat-list.tsx`, `chat-message.tsx`,
`focus-hud.tsx`, `move-list.tsx`, `player-chip.tsx`, `kbd.tsx`, `shortcuts-dialog.tsx`,
`stat-pill.tsx`, `mini-board.tsx`, `display.tsx`, `podium.tsx`, `reveal.tsx`, `section.tsx` ·
mock: `src/lib/mock/game-controller.ts` (446) + `scenarios.ts` (ids `ai-midgame`, `ai-hint`,
`online-draw-offer`, `local-flip`, `review`, `finished`, `fullscreen`) · harness
`src/app/dev/game/harness.tsx` (155) · shortcuts `src/hooks/use-shortcuts.ts`, camera keys in
`src/components/board3d/board-3d.tsx` (~195–227).

Shared: `site-header.tsx` (`data-slot="site-header"`, `data-scrolled`, transparent over
`[data-hero-flag]`, hidden under `[data-layout=focus]`) · `globals.css` (380; utilities
`font-display`, `eyebrow`, `tabular`, `reveal`, `no-scrollbar`, `hero-vignette`; classes
`.hero-canvas-blend`, `.board-canvas-feather`; durations `--dur-micro 120`, `--dur-bubble 160`,
`--dur-reveal 400`, `--dur-rise 500`, `--dur-room 600`, `--dur-canvas 800`, `--ease-out-soft`) ·
`src/lib/rooms.ts` (`study` Classic Study, `space`, `park`, `arcade` Neon Arcade, `minimal`
Minimal White; `ROOM_ORDER`, `DEFAULT_ROOM`, `resolveRoom`) · personas in `src/lib/difficulty.ts`
(`DIFFICULTIES`, `DIFFICULTY_ORDER`, `AI_RATING`, `aiDisplayName`; Pip 800 Beginner hints, Marco
1100 Casual hints, Ada 1400 Intermediate, Viktor 1800 Advanced, Kasparova 2300 Grandmaster) ·
`src/lib/ui/__tests__/contrast.test.ts` parses `globals.css` by path (token renames fail vitest).
