---
target: the game screen
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:/Users/sonnysangha/Documents/Builds/chess-3d-ai-clerk-game/src/components/game/game-shell-view.tsx"
target_fingerprint: "sha256:1f33431e3c13bd45800b585de85bbcf129dac4ad53a7416207ba35c4bfb0fc86"
target_path: /Users/sonnysangha/Documents/Builds/chess-3d-ai-clerk-game/src/components/game/game-shell-view.tsx
timestamp: 2026-09-10T13-21-25Z
slug: src-components-game-game-shell-view-tsx
---
# Critique: the game screen (src/components/game/game-shell-view.tsx)

Method: dual-agent (A: design review · B: detector + browser evidence), Opus 5, isolated. B's output reached the parent before A completed; A's judgment formed in isolation.

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Canvas can sit blank in its ring until a pointer moves; status pill becomes a plain button in review. |
| 2 | Match system / real world | 3 | Mobile bar says "Full", "Panel"; "PGN" never expanded. |
| 3 | User control and freedom | 2 | Fullscreen on touch: HUD fades after 3 s, a tap does not wake it; only exit is a reload. |
| 4 | Consistency and standards | 3 | Three tooltip strategies in one bar; hint under two names; board framed against DESIGN.md. |
| 5 | Error prevention | 3 | "Rewind to here" destroys later moves from a hover icon with no confirmation. |
| 6 | Recognition rather than recall | 3 | Labels only from 1280 px; 1024–1279 gets ten unlabelled icons. |
| 7 | Flexibility and efficiency | 3 | Game-group actions have no shortcuts. |
| 8 | Aesthetic and minimalist design | 3 | Brass spent on non-interactive "You played" bubbles; hint bar at 50% opacity. |
| 9 | Error recovery | 3 | Result dialog shows a rating delta beside "Won with 1 take-back". |
| 10 | Help and documentation | 3 | ? dialog unreachable from fullscreen; nothing teaches a first 3D move. |
| Total | | 29/40 | Good |

## Design Specificity Verdict
Half-authored: palette, type and the opponent-as-chat are Castle's; layout, controls and the board's card frame are category-interchangeable. Detector: 38 CLI findings (37 design-system-font-size = one systemic ramp gap below 13 px; 1 bounce-easing on thinking dots); browser: action-bar thin border + wide shadow on every scenario, fullscreen 100% Geist, nested cards in result dialog and persona quote bubbles; landing kicker warnings accepted as the eyebrow pattern; dark-glow/transition-height treated as dev-indicator noise; no console errors; no overflow at 390.

## Priority Issues
1. [P0] Fullscreen traps touch users: FocusHud wakes only on pointermove/keydown; Exit fades to opacity 0 / pointer-events none. Fix: wake on pointerdown/touchstart; disable auto-hide unless (hover: hover) and (pointer: fine); keep an Exit outside the fading layer. src/components/ui-kit/focus-hud.tsx, game-shell-view.tsx. /impeccable harden
2. [P1] Draw offers absent in the focus layout (DrawOfferDialog only in the default branch; "Offer draw" gated off the compact bar). Fix: HUD layer + keep Offer draw in compact bar for online. /impeccable harden
3. [P1] Mobile board is 241×241 (~17% of 390×844) with the 241×320 canvas clipped by the square ring; sheet takes ~42%. Fix: full-width square board, drop min-h-[320px], sheet peeks one message. /impeccable adapt
4. [P1] Result dialog shows "+12 → 1296" beside "Won with 1 take-back" against the rating rule. Fix: suppress delta on take-backs; "Won with one take-back, so the rating stays put — 1284." /impeccable clarify
5. [P2] Board framed (rounded-xl ring-1) and action bar floats (shadow-soft) against DESIGN.md's rules. Fix: unframe + feather edges; shadow only on the focus variant. /impeccable polish

## Persona Red Flags
Alex: no keys for hint/take back/draw/resign; fullscreen loses commentary, list, resign, PGN, shortcuts; icon-only below 1280. Jordan: no first-move teaching; PGN/Room unexplained; take-back rating rule learned too late; unconfirmed rewind. Stream viewer on a phone: clipped stamp-sized board in a card; fullscreen black screen; blank first paint; no credits on the game screen.

## Minor Observations
Hint bubble tag/body concatenation for screen readers; double aria-live announcements; draw-offer bar has no role/live region and gives brass to Accept; captured trays 20 px with no material diff; hand-over overlay skipped under reduced motion; tooltip inconsistency (Camera/PGN none, Resign native title); buttons 28 px vs 32 px token; thinking dots bounce not pulse; "Rated: Yes/No"; type ramp needs a 12 px step or lifted micro-labels.

## Questions to Consider
Player bubbles in seam instead of brass? Resign in fullscreen HUD? Unread signal for commentary in fullscreen? Demand frameloop without initial invalidate on cold mobile loads? Credits in the game Info tab?
