# Castle README screenshots

Captured on 11 September 2026 from the running local development application at `http://localhost:3000` using an isolated browser session. These are browser screenshots of the application, not generated illustrations.

Desktop captures use a 1600 × 1000 viewport; mobile captures use 390 × 844. Pages were inspected visually, and loading-state captures were replaced. The Next.js development indicator and development-scenario selector can appear in the captures.

| File | Source route / state | Data provenance |
| --- | --- | --- |
| `landing.png` | `/`, historical replay paused | Public page; historical Opera Game board and activity counters as displayed at capture time |
| `play.png` | `/dev/pages?section=play` | Real setup components in the development gallery, sample data; additional gallery states continue below the crop |
| `settings.png` | `/dev/pages?section=settings` | Settings components and live 3D preview in the development gallery |
| `profile.png` | `/dev/pages?section=profile` | Sample player, results, and rating history |
| `leaderboard.png` | `/dev/pages?section=leaderboard` | Sample leaderboard; the gallery also displays its empty state below |
| `online-game.png` | `/dev/game?scenario=online-draw-offer` | Sample online game, draw offer, and participant chat interface; no message sent to a real player |
| `tutor-3d.png` | `/dev/game?scenario=tutor-pro`, 3D | Scripted tutor conversation and annotation tools, rendered by the real game components |
| `tutor-2d.png` | Same scenario, switched to 2D | Same sample position, scripted conversation, and candidate-line arrows |
| `pro.png` | `/pro` | Public marketing page; the pictured example tutor is part of that page, not a live paid conversation |
| `game-mobile.png` | `/dev/game?scenario=tutor-pro`, 390 × 844 | Mobile sample game with tutor panel closed |
| `tutor-mobile.png` | Same scenario, 2D board and tutor sheet open | Mobile tutor interface with scripted conversation |

The development previews make UI states reproducible without recording personal account data. They do not establish that a live model request, subscription purchase, or multiplayer exchange succeeded. Source-level mechanics are documented separately in the root README.

## Refreshing the captures

Run the application in development mode, open the routes above, allow fonts/assets and hydration to finish, then set the corresponding board or panel state. Capture to the same filename and inspect the result before replacing it. Keep the source route and data provenance accurate if a capture changes.

Keep this directory beside the root README when publishing the repository or copying the documentation. All image paths are relative to the repository root.
