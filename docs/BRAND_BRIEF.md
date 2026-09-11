# Brand brief: name and voice

Shape round, 2026-09-10. Product truth lives in PRODUCT.md; this brief settles the two things
it left open: the product's **name** and the product's **voice**. It writes no code and chooses
no visuals; the visual world stays "The Study" (docs/UI_REDESIGN.md).

## 1. Job and audience

Developers following the build, then anyone who plays. They meet the name on the landing page
header and tab title, in the sign-in card ("Sign in to ___"), in the result dialog, and when
they tell someone else about it. The name has one job: be repeatable after a single hearing and
feel like a place, not a feature list.

## 2. Outcome and proof

Success: a visitor can say the name back, it fits the knight glyph and the espresso-and-brass
world without explanation, and the copy across the product reads as one host speaking.
Proof available: the product itself (a room, a board, a talking opponent, spectators) — the
name should be true of it. No testimonials, press or domain purchases exist; none are claimed.

## 3. Naming direction (confirmed criteria)

- Evocative, one word. Not descriptive ("___ Chess"), not insider-only wordplay.
- Suggests a place people gather to play and talk, because that is what the product is:
  a room, an opponent with opinions, people watching.
- Works with the existing knight mark, in sentence case, in Fraunces on the landing page and in
  Geist in the header.
- No domain or trademark constraint at this stage (owner's decision); availability is checked
  when the owner picks.

### Shortlist

| Name | Why it fits | How it reads in use | Watch-outs |
|---|---|---|---|
| **Kibitz** (recommended) | A chess and cards word for the onlooker who comments on the game. It names the two things only this product has: an opponent who talks and people who watch. Friendly, slightly cheeky, one word, pronounceable. | "Sign in to Kibitz" · "Kibitz · Chess you can walk around." · result dialog: "Kibitz says: well played." | Yiddish origin; readers outside chess may not know it, which makes it distinctive rather than confusing. |
| **Castle** | The chess move and a building full of rooms in one word; broad, warm, instantly pronounceable; pairs naturally with "rooms". | "Play at Castle" · "Castle · Pick where you sit." | Common word; less specific to the talking opponent. |
| **Parlour** | The room in a house where games are played and conversation happens; matches the walnut-and-brass world exactly; British spelling suits the owner. | "Welcome to the Parlour" · "Parlour · A board in a room you chose." | Slightly genteel; less energy for the Grandmaster persona. |
| **Salon** | A gathering for conversation and play; elegant, international, short. | "Salon · Sit, play, listen." | Collides with hair salons in search. |
| **Tempo** | Chess term (a unit of initiative); quick and modern; sounds like an app. | "Tempo · Your move." | Says little about the room or the voice; many products share it. |

Recommendation: **Kibitz**, with the knight glyph kept as the mark. It is the only candidate
that is literally true of the product's two protected claims.

## 4. Voice: the club host (confirmed register)

The product speaks as a good club host: knows the game, never lectures, warm and brief,
dry wit at most once per page. The five AI personas keep their own voices; the host's voice is
everything else — buttons, labels, empty states, errors, dialogs, the landing page.

Principles:

1. **Say what happens.** Buttons name the action and its result: "Find a match", "Offer draw",
   "Take back", "Copy PGN", "Enter fullscreen". Never "Submit", "OK", "Go".
2. **Short, sentence case, plain verbs.** One idea per line. No exclamation marks in chrome.
3. **Never apologise, never blame.** Errors say what happened and what to do next:
   "That move is not legal from here. Pick a highlighted square." not "Oops, something went
   wrong."
4. **Invitations, not voids.** Empty states point at the next action: "No live games right
   now. Start one and it will show up here."
5. **Wit is a garnish.** At most one light line per screen, only where a player is relaxed
   (result dialog, empty leaderboard), never in errors or during a live game.
6. **The host does not explain the stack.** No framework names, no "AI-powered", no
   "powered by". Say "the opponent", "the engine" only when a player needs it (engine
   download progress).

Lexicon: "game" (not "match", except "Find a match" for the queue); "opponent" for humans and
AI alike; "take back" (not "undo") in AI games, "undo" in local games; "room" for the
environment; "seat" for the side of the board you sit on; "review" for looking at a past
position, "replay" for a finished game.

Sample lines:

- Landing CTA: "Play now" / "Watch live games".
- Queue: "Looking for a player near 1240. The window widens every ten seconds." · "Play the
  opponent while you wait".
- Turn overlay (local): "Black to move. Pass the device."
- Result: "You won." / "Draw by repetition." / "You resigned." then "Rating 1240 → 1256".
  With take-backs: "Won with two take-backs, so the rating stays put."
- Hint limit: "That was your last hint for this game."
- Disconnect: "Your opponent lost connection. They have 60 seconds to return."
- WebGL fallback: "This browser cannot run the 3D board, so here is the 2D one. Nothing else
  changes."

## 5. Scope and boundaries

In scope once the name is confirmed: header wordmark and tab title, sign-in/up card title,
metadata, README title, result-dialog copy, footer, PRODUCT.md brand section. Out of scope:
a logo redesign beyond the knight glyph, domain purchase, legal names, and any change to the
personas' voices.

## 6. Decision (owner, 2026-09-10)

- **Name: Castle.** The chess move and a building full of rooms; broad, warm, one word.
- **Mark: the knight glyph stays.**
- **Voice: the club host** as specified in section 4.

Applying the name is implementation work outside this brief: header wordmark and tab title,
Clerk application name (drives "Sign in to Castle"), metadata, README, footer, result-dialog
copy, PRODUCT.md.
