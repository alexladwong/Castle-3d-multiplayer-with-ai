---
name: Castle
description: An online 3D chess club — a lit board in a room you chose, an opponent who talks, people watching.
colors:
  espresso: "#151916"
  walnut: "#1e2420"
  cellar: "#101410"
  ivory: "#f0f2e9"
  parchment: "#b2b9ae"
  seam: "#343c34"
  brass: "#bcccad"
  brass-ink: "#1d271f"
  baize: "#3f9b73"
  ember: "#df745e"
  board-light: "#d9b98a"
  board-dark: "#7a4a22"
  board-select: "#e0bb63"
  board-legal: "#3f9b73"
  board-capture: "#dd7256"
  board-check: "#c4402a"
  light-ivory-ground: "#f5f4ef"
  light-paper: "#fffefa"
  light-vellum: "#e9eae2"
  light-espresso-ink: "#1d271f"
  light-umber: "#53614f"
  light-seam: "#d0d5ca"
  light-brass: "#496545"
  light-baize: "#1f6b4d"
  light-ember: "#a63d27"
typography:
  display:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "5.5rem"
    fontWeight: 500
    lineHeight: 0.98
    letterSpacing: "-0.02em"
    fontVariation: "'opsz' 144, 'SOFT' 40, 'WONK' 1"
  headline:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "2.5rem"
    fontWeight: 500
    lineHeight: 1.05
    letterSpacing: "-0.015em"
    fontVariation: "'opsz' 72, 'SOFT' 40, 'WONK' 1"
  headline-sm:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "2rem"
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: "-0.01em"
    fontVariation: "'opsz' 72, 'SOFT' 40, 'WONK' 1"
  title:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.6
  body-app:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "0.12em"
  data:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.4
    fontFeature: "'tnum' 1"
  micro:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: "0.02em"
rounded:
  chip: "999px"
  control: "0.625rem"
  card: "1rem"
  panel: "0.75rem"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  section: "96px"
components:
  button-primary:
    backgroundColor: "{colors.brass}"
    textColor: "{colors.brass-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0 10px"
    height: "32px"
  button-primary-hover:
    backgroundColor: "{colors.brass}"
    textColor: "{colors.brass-ink}"
  button-outline:
    backgroundColor: "{colors.walnut}"
    textColor: "{colors.ivory}"
    rounded: "{rounded.control}"
    padding: "0 10px"
    height: "32px"
  button-ghost:
    textColor: "{colors.ivory}"
    rounded: "{rounded.control}"
    padding: "0 8px"
    height: "32px"
  button-danger:
    backgroundColor: "{colors.walnut}"
    textColor: "{colors.ember}"
    rounded: "{rounded.control}"
    padding: "0 10px"
    height: "32px"
  input-text:
    textColor: "{colors.ivory}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0 10px"
    height: "32px"
  card:
    backgroundColor: "{colors.walnut}"
    textColor: "{colors.ivory}"
    rounded: "{rounded.card}"
    padding: "24px"
  chip:
    backgroundColor: "{colors.walnut}"
    textColor: "{colors.parchment}"
    typography: "{typography.label}"
    rounded: "{rounded.chip}"
    padding: "4px 10px"
  chat-bubble-ai:
    backgroundColor: "{colors.walnut}"
    textColor: "{colors.ivory}"
    typography: "{typography.body}"
    rounded: "{rounded.panel}"
    padding: "10px 14px"
  chat-bubble-you:
    backgroundColor: "{colors.seam}"
    textColor: "{colors.brass}"
    typography: "{typography.body}"
    rounded: "{rounded.panel}"
    padding: "8px 12px"
---

# Design System: Castle

## Overview

**Creative North Star: "The Castle Games Room"**

Castle keeps the atmosphere of a private chess room: a real, lit 3D board, an elegant
Fraunces headline and quiet, readable controls. The 2026-09-11 refinement preserves that
character while replacing yellowed parchment, brown surfaces and mustard gold with pale
stone, deep forest-charcoal and a restrained sage accent. The board's materials and room
lighting remain independent from the interface palette.

The landing page keeps the cinematic 3D replay and its soft edge. Its scene spans the
viewport; headline, actions and replay controls use a centered 1600px composition,
wider than the 1280px lower sections. The headline has a broader measure than its
supporting paragraph, with generous side space on ultrawide displays. The hero uses the ground token, while the sections below use the lighter elevated
surface and a fine dividing rule. Product pages retain
compact controls, readable game data and softly rounded surfaces. Avoid condensed sports
lettering, oversized uppercase slogans, ornamental badges, and generic feature grids.
The Top Rated preview is a single ordered ranking list, with consistent rows for all five
players and enough room for names and ratings; it never uses stacked podium cards.

## Colors

Runtime ownership: `src/app/globals.css` defines the canonical light and dark CSS tokens.
Its `@theme inline` block maps them to Tailwind and shadcn roles used throughout the app.
The frontmatter records those exact values. Legacy material names are retained as aliases
for existing consumers, not as instructions to restore the old brown-and-gold palette.

- **Ground / elevated / sunken:** forest-charcoal in dark mode, stone and off-white in light.
- **Foreground / muted:** soft ivory and desaturated sage-grey in dark; green-black and
  muted olive in light. Reading contrast is tested across all three surfaces.
- **Accent (`brass` alias):** muted sage in dark mode, forest green in light. Use sparingly
  for primary actions, focus, selected controls and a single italic headline word.
- **Live:** the existing brighter green for activity, success and legal moves, with labels
  or markers that communicate the state independently of colour.
- **Danger:** warm coral, adjusted to remain readable on the elevated dark surface.
- **Board tokens:** unchanged. Mini-board squares and the 3D rooms retain their own materials.

## Typography

**Display Font:** Fraunces (variable; with Georgia, serif)
**Body Font:** Geist (with system-ui, sans-serif)
**Label/Mono Font:** Geist Mono (with ui-monospace, monospace)

**Character:** An engraved serif with soft terminals set against a restrained modern grotesk. Fraunces
at large optical sizes with the "wonk" axis on reads like lettering on a trophy; Geist keeps the
interface neutral and legible; Geist Mono gives notation, ratings and clocks the tabular
discipline of a scoresheet.

### Hierarchy
- **Display** (500): the landing headline uses clamp(3rem, 5vw, 5.5rem) with 1.02 line height; result-dialog verdicts retain the shared display scale. One italic word per headline at most, set in the primary sage accent.
- **Headline** (500, 2.5rem, 1.05): section titles on marketing pages, page titles in the app frame at a smaller size (1.25–2.25rem).
- **Headline SM** (500, 2rem, 1.1): app-frame verdicts and overlays — the result dialog's verdict, the turn overlay, the promotion picker. One step under Headline, flat at every width because these sit over a board, not over a page.
- **Title** (600, 1.25rem, 1.3): card titles, dialog titles, sidebar tab headings.
- **Body** (400, 0.9375rem marketing / 0.875rem app frame, 1.6): copy; keep measure to 46–60 characters.
- **Label** (500, 0.8125rem, 0.12em tracking, uppercase): eyebrows, section labels, table headers.
- **Data** (500, 0.8125rem mono, tabular figures): move notation, ratings, clocks, coordinates, IDs.
- **Micro** (500, 0.75rem, 0.02em tracking): the floor of the ramp — metadata beside a name, counters and badges, keyboard caps. Nothing in the interface is set smaller than this, and anything that would be is lifted to it.

### Named Rules
**The Scoresheet Rule.** Anything a player would write on a scoresheet — moves, ratings, clocks, coordinates — is set in Geist Mono with tabular figures, never in the UI face.

**The One Italic Rule.** A display headline carries at most one italic word, set in the shared accent.

## Layout

Marketing pages sit on a 12-column grid, max width 1280px, 24px gutters, with sections spaced by
96px on desktop and 64px on mobile. The app frame has no page scroll on desktop: a 56px header,
then a grid of a board column and a 380px sidebar (400px from 1440px), sized to the viewport
height; the board is a square fitted to the remaining height, with 48px player rows above and
below and a 56px action bar beneath. Below 1024px the game screen becomes a single column: player
row, square board at full width, sticky action bar, then a bottom sheet carrying the sidebar
tabs. Spacing follows a 4px base (4 / 8 / 16 / 24 / 40) with 96px between marketing sections.
Buttons are 32px tall by default (36px large) with at least 36px of tappable area on touch; the action bar's buttons show icon and label from 1280px and
icon-only with a tooltip below that.

## Elevation & Depth

Depth is tonal. Surfaces step up from espresso (ground) to walnut (cards, sidebar) to cellar
wells that sink back; hairlines in seam separate regions. The single shadow token is warm and
soft and appears only on layers that genuinely float above the page: popovers, dialogs, the
fullscreen HUD and the hero board's glow. Floating layers rely on the shadow alone: no hairline.
Cards at rest carry no shadow; the scrolled header uses a walnut tint with a blur rather than a
shadow.

### Shadow Vocabulary
- **Soft float** (`box-shadow: 0 20px 60px -30px rgb(0 0 0 / 0.35)`): dialogs, popovers, the floating HUD, hero canvas glow. Nothing else.

### Named Rules
**The Only-Floating-Things-Cast-Shadows Rule.** If an element is part of the page's structure it gets tone and a hairline, never a shadow.

## Shapes

Softly rounded, never pill-shaped except for chips. Controls use a 10px radius, panels and
bubbles 12px, cards 16px, chips and avatars are fully round. Chat bubbles from the opponent
tuck their top-left corner to 4px so the tail points at the speaker; the player's bubbles tuck the
top-right. Hairline borders are 1px seam; the brass focus ring is a 3px ring at 50% opacity
outside the control. The board's frame and squares are the only hard-edged rectangles in the
system.

## Components

Tactile and confident: solid brass primaries, generous hit areas, crisp 120ms colour changes.
Things feel like well-made pieces you can pick up.

### Buttons
- **Shape:** softly rounded (10px radius), 32px tall by default and 36px for the large size, 10px horizontal padding, medium weight label.
- **Primary:** brass fill with brass-ink text; hover darkens the fill slightly (80% mix) over 120ms; focus shows the brass ring.
- **Outline:** walnut fill with a seam hairline and ivory text; used for the second action beside a primary.
- **Ghost:** no fill, ivory or parchment text; hover paints a faint walnut wash. Used in the action bar and header.
- **Danger:** ember fill, ivory text; always behind a confirmation dialog when the action is irreversible.
- **Action bar buttons:** icon plus label, label hidden below 1280px, tooltip with the keyboard shortcut in a `Kbd` cap; disabled buttons keep their tooltip and explain why.

### Chips
- **Style:** fully round, walnut fill, parchment label text; a leading baize dot when the chip means "live".
- **State:** selected chips switch to a seam fill with ivory text and a brass ring; the pool tabs on the leaderboard and the room cards follow the same selected treatment.

### Cards / Containers
- **Corner Style:** 16px.
- **Background:** walnut on the espresso ground; nested wells use cellar.
- **Shadow Strategy:** none at rest (see Elevation); floating variants use the single soft shadow.
- **Border:** 1px seam hairline.
- **Internal Padding:** 24px on marketing cards, 16px in the app frame.

### Inputs / Fields
- **Style:** transparent over its surface (a faint seam tint in dark mode), seam hairline, ivory text, 10px radius, 32px tall, 10px padding; placeholders in parchment.
- **Focus:** hairline turns brass and the 3px brass ring appears; no glow.
- **Error / Disabled:** error hairline in ember with a one-line message beneath in ember; disabled drops to 50% opacity and keeps its label.

### Navigation
- **Account navigation:** signed-in players can open their saved public profile from the main navigation or avatar menu. Clerk `Show` checks the `pro` plan: free members see “Upgrade to Pro”; members see a starred “Pro”. Both link to `/pro` for plan details and pricing.
- **Header:** 56px, knight glyph plus the wordmark "Castle" in Geist 600, primary links in parchment turning ivory on hover with a walnut wash for the active route. Transparent with no border over the landing hero; walnut at 80% with blur and a seam hairline once scrolled. Hidden entirely in the game's focus (fullscreen) layout.
- **Sidebar tabs (game):** three tabs with a brass underline on the active one; on mobile the same tabs sit in a bottom sheet opened at a 40% peek.

### Signature Component: the lit board
The 3D board is the system's one theatrical element. On the landing page it runs in showcase
mode — non-interactive, slow cinematic orbit, medium quality, no post-processing — with its
canvas masked so the room's glow is anchored to the top-right corner and dissolves diagonally
toward the headline. In play it fills the board column, square, with the labelled action bar
directly beneath. It is never framed, boxed or given a border; the room's light is its edge.

### Signature Component: the chat
The opponent's commentary is a chat, not a log. Opponent messages are walnut bubbles with a
lettered brass disc for the persona and the move number as a label; the player's actions are
seam bubbles with brass text on the right; system events are centred parchment chips. A
thinking bubble with three pulsing dots holds the place while the opponent decides, and after
three seconds says so plainly.

## Do's and Don'ts

### Do:
- **Do** keep brass under a tenth of any screen and use it for exactly one thing per view: the primary action, the selection, or the emphasised word.
- **Do** set every move, rating, clock and coordinate in Geist Mono with tabular figures.
- **Do** put every game action in the visible action bar with a text label at desktop widths and a tooltip below that; disabled actions keep their tooltip and say why.
- **Do** step depth by tone (espresso → walnut → cellar) and reserve the soft shadow for dialogs, popovers, the HUD and the hero glow.
- **Do** respect `prefers-reduced-motion`: no staggers, no auto-orbit, instant room swaps, static bubbles.

### Don't:
- **Don't** introduce a second accent, a gradient, or a cool grey; the only gradient in the system is the hero's light.
- **Don't** use baize or ember for anything that is not live or dangerous respectively.
- **Don't** set body copy or UI labels in Fraunces, or exceed one italic word in a headline.
- **Don't** frame the 3D board with a border, card or box; its light is its edge.
- **Don't** hide primary game actions behind a menu on desktop, and don't exclaim in chrome copy.
