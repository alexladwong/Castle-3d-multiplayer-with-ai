---
target: the game screen (re-run)
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/Users/sonnysangha/Documents/Builds/chess-3d-ai-clerk-game/src/components/game/game-shell-view.tsx"
target_fingerprint: "sha256:20e4eb46b0050374c7be75bee61b94a7223a3bd1a16dab57289f99d648de3b03"
target_path: /Users/sonnysangha/Documents/Builds/chess-3d-ai-clerk-game/src/components/game/game-shell-view.tsx
timestamp: 2026-09-10T15-44-05Z
slug: src-components-game-game-shell-view-tsx
---
# Critique: the game screen (src/components/game/game-shell-view.tsx), re-run after the first fix round

Method: dual-agent (A: design review · B: detector + browser evidence), Opus 5, isolated. Target as committed at 164adab (after the P0/P1 fixes from the 13:21Z run). B's output reached the parent first; A's judgment formed in isolation.

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Fullscreen drops the status pill (no move number, Check or reviewing marker); the pill shows whole moves, so half of all ArrowLeft presses in review read the same. |
| 2 | Match system / real world | 3 | "Black offers a draw." beside a row that says "adrienne 1311"; PGN/SAN expanded only in tooltips. |
| 3 | User control and freedom | 3 | Resign is guarded by an alert dialog; Accept on a draw ends the same rated game instantly from a 28 px button 8 px from Decline. |
| 4 | Consistency and standards | 2 | Hint named two ways (bar/composer vs mobile "Hint · 2 left"); "Room" vs "Board and room settings"; three numbering schemes on one move row; SAN input hard-disabled without a reason. |
| 5 | Error prevention | 3 | Unconfirmed, undifferentiated Accept; finished-game hint tooltip gives the wrong reason. |
| 6 | Recognition rather than recall | 3 | Nothing says how to move a piece on the 3D board; SAN box lives in the non-default Moves tab; icon-only bar below 1280 px. |
| 7 | Flexibility and efficiency | 3 | Arrows and R mean orbit/reset while the 3D board has focus, review/flip elsewhere; no shortcuts for hint, take back, draw, resign. |
| 8 | Aesthetic and minimalist design | 3 | The only brass on the screen is a disabled 376×32 composer hint button, duplicating the bar's action. |
| 9 | Error recovery | 3 | SAN input natively disabled off-turn, unfocusable, no reason. |
| 10 | Help and documentation | 3 | Shortcuts dialog omits the board-focus meanings; offered inside the mobile More sheet on a keyboardless device. |
| Total | | 29/40 | Good |

## Design Specificity Verdict
Authored, not category-interchangeable, and measurably so: brass 0.93 % of the 1440×900 viewport on one pressable element; baize only on "to move" and live dots; ember only on Check and Resign; all 14 sampled notation/rating strings in Geist Mono with tabular figures; Fraunces nowhere in the app frame except the result verdict and the hand-over overlay; the board unframed (feathered dissolve); the opponent a chat with a lettered disc. Two category defaults remain: the action bar is ten ghost buttons in a hairline card, and the fullscreen layout deletes the commentary. Detector (B): 15 CLI findings, all advisory (13 design-system-font-size off-ramp `text-[…]` in display.tsx, podium.tsx, promotion-picker.tsx, turn-overlay.tsx, game-result-dialog.tsx, dev harness; 2 undocumented colours in board2d/pieces-svg.tsx); browser: `gpt-thin-border-wide-shadow` on the action bar and ×6 in fullscreen, `layout-transition: height`, `nested-cards` in the result dialog, `kicker-above-heading` ×5 and `nested-cards` ×5 on `/`; text-overflow is an sr-only false positive; no console errors; no page overflow at 390 once the detector's own overlay is excluded.

## Priority Issues
1. [P1] Fullscreen silences the opponent and blinds the status line: the focus layout removes the sidebar with no replacement on desktop and drops the status pill (no move number, Check or reviewing marker). Fix: pass GameStatusPill into FocusHud's top-centre slot outside the fading layer; newest bubble as a dismissible HUD card plus a "Chat" pill that opens the conversation as an overlay (the mobile focus pattern). src/components/game/game-shell-view.tsx, src/components/ui-kit/focus-hud.tsx, src/components/ai/game-chat.tsx. /impeccable craft
2. [P1] Accepting a draw ends a rated game instantly with no confirmation from a 65×28 button identical to Decline and 8 px away; Resign is guarded. Fix: route Accept through the ResignAction alert-dialog pattern ("Accept the draw?" / rating consequence / "Keep playing"), differentiate Accept from Decline, lift both to the 32 px token with 36 px on coarse pointers. src/components/game/draw-offer-dialog.tsx. /impeccable harden
3. [P1] Touch targets in the fullscreen HUD are 34×32 and every mobile "More actions" row is 32 px (padding 0 8px, no ::before/::after), against DESIGN.md's 36 px floor, while the mobile bar's own buttons are 56 px. Fix: a (pointer: coarse) minimum on the shared Button/ActionButton so the HUD and the sheet inherit it. src/components/ui-kit/action-bar.tsx, game-action-bar.tsx, game-mobile-bar.tsx. /impeccable adapt
4. [P2] The result dialog does not take focus (activeElement BODY; first control is the 30th focusable; background aria-hidden but not inert) and states the outcome three times ("You won" / "quinn wins by checkmate" / "Checkmate"). Fix: initial focus on "Play again", inert background, verdict + one result line + mono rating line. src/components/game/game-result-dialog.tsx. /impeccable clarify
5. [P2] ArrowLeft/Right and R change meaning when the 3D board holds focus (board-3d.tsx handleKeyDown maps them to orbit/reset and preventDefault, which use-shortcuts honours); neither the shortcuts dialog nor the board's aria-label mentions the other meaning. Fix: move orbit to Shift+arrows or [ / ], reset to the Camera menu; document what survives; say how to move a piece. src/components/board3d/board-3d.tsx, src/hooks/use-shortcuts.ts. /impeccable clarify

## Persona Red Flags
**Alex (impatient power user):** arrows/R silently switch between orbit and review; no shortcut for hint, take back, draw or resign; fullscreen throws away the move list and commentary; the status pill shows whole moves so half his review presses look dead; the hint is rendered twice and the duplicate is the only brass.
**Jordan (confused first-timer):** nothing says how to move a piece in 3D; the brightest control is a greyed-out hint button; "2D" is ambiguous as a label; PGN/SAN/O-O unexplained on screen; "Black offers a draw" needs a colour-to-name lookup and there is no "what does accepting do?".
**Developer watching the stream on a phone:** fullscreen removes the commentary being demonstrated; HUD buttons 34×32 and More rows 32 px while the bar manages 56 px; Resign/Take back/Offer draw two taps deep behind More while Flip is top-level; Exit fullscreen at the top of an 844 px screen; the hint is "Hint · 2 left" on the phone and "Ask for a hint" on the desktop demo.

## Minor Observations
- Hint rendered twice in AI games (bar ghost + brass composer button), both aria-disabled with the same reason in the observed state; naming drift "Ask for a hint" vs "Hint · 2 left" despite the source comment asserting one name.
- "Room" (desktop) vs "Board and room settings" (mobile sheet) for one action.
- One move row carries three numbering conventions: aria "Move 13, Nc3" (ply), tooltip "Rewind to White's move 7", pill "Move 7".
- SAN input natively `disabled` off-turn and during review with no reason, breaking the aria-disabled + tooltip convention; finished-game hint tooltip says "No hints left in this game." when the game is over.
- Flip announces "Viewing from White's side." only from the 3D board; the 2D board is silent on R. The local hand-over overlay is aria-hidden, so screen-reader users are never told to pass the device.
- Each move produces two turn announcements (status pill + sr-only announcer).
- Resign renders as ember/20 tint with ember text (4.88:1), not the documented ember-fill danger button. Draw buttons use the abandoned 28 px size.
- At 1280×800 the bar wraps with PGN/Room/Shortcuts orphaned right-aligned on the second row.
- In review the top row still reads "Pip to move" while the pill reads "Reviewing move 4".
- The Chat tab is default in AI games, so the keyboard move box (Moves tab) is one tab-switch away from a keyboard-only player's landing state. The 2D grid (64 labelled gridcells, roving tabindex) is reachable only after T, which the 3D board never mentions.
- The chat renders an opponent move only when it carries commentary, so it is not a complete narrative.
- Mobile sheet is closed by default with a one-line preview rather than §5.3's 40 % peek (arguably better; spec not updated). The hand-over overlay uses the Display step, which DESIGN.md reserves for the landing headline and result verdicts.

## Questions to Consider
- Is the loss of commentary in desktop fullscreen deliberate or an oversight?
- Should Accept gain the confirmation Resign has, or is a confirmation considered pressure?
- DESIGN.md vs UI_REDESIGN §5.4 on Fraunces for the hand-over overlay: which is authoritative?
- Is the closed-by-default sheet an intentional improvement worth writing into the spec?
- Should the status pill show the ply while reviewing so every arrow press produces visible feedback?
