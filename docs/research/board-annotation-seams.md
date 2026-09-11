# Board annotation and engine seams — verified 2026-09-10

Where a tutor's drawings (square tints, arrows, a candidate line) plug into both boards, and how
the in-browser engine can be asked for analysis. Line numbers are as of commit 164adab plus the
in-flight UI round; re-check before editing.

## Board props

- `BoardViewProps` — `src/lib/types.ts:180-212`: `fen, position: BoardPiece[], orientation, turn,
  interactive, animate, selectedSquare, legalTargets, lastMove, checkSquare, captured, promotion,
  reviewPly, onSquareSelect, onMove, onPromotionChoice, onDeselect, onRenderFailure?`. Both boards
  are pure functions of these props (contract at :176-179). **Add `annotations?` here.**
- Assembled in `src/hooks/use-game-controller.ts:500-522` (`const board: BoardViewProps = {…}`)
  and mirrored in `src/lib/mock/game-controller.ts:404-423` — update both.
- `src/components/game/board-surface.tsx:15` spreads the props to `Board2D` or `Board3DLoader`.

## 2D board (`src/components/board2d`)

- Root `board-2d.tsx:126` is a percentage box; the grid `:131` is `grid-cols-8 grid-rows-8`;
  one square = 12.5 %. `gridPosition(square, orientation)` in `src/lib/constants.ts:41-46`.
- Pieces layer `board-2d.tsx:179-189` is `pointer-events-none absolute inset-0`; a new SVG layer
  (`viewBox="0 0 8 8"`, `absolute inset-0 pointer-events-none`) goes between the grid and the
  pieces. Square centre = `(col + 0.5, row + 0.5)`.
- Existing highlights are spans inside `square-2d.tsx:64-93` using `--board-*` tokens; every cell
  has `data-square` (`:48`).

## 3D board (`src/components/board3d`)

- World frame (`src/lib/constants.ts:7-28`): 1 square = 1 unit, board centred on the origin, +Y up,
  white at +Z; `squareToWorld(square) → [file-3.5, 0, 3.5-rank]`, `worldToSquare(x, z)`.
- Y stack (`layout.ts:9-30`): `SQUARE_TOP_Y 0.06`, `HIGHLIGHT_Y = SQUARE_TOP_Y + 0.004`,
  `TILE_SIZE 0.98`, `PLINTH_SIZE 9.1`.
- Existing overlay: `highlights.tsx:123` one `<group rotation-x={-π/2} position={[0, HIGHLIGHT_Y, 0]}
  raycast={() => null}>`; children placed at `[x, -z, 0]`; materials `meshStandardMaterial`
  emissive, `toneMapped={false}`, `depthWrite={false}`, `polygonOffsetFactor={-2}`; geometries
  memoised and disposed (:104-120); per-frame pulse via `useFrame` (:33-39). Mount point for a
  `<TutorAnnotations>` group: `scene.tsx:125-132`, right after `<Highlights>`, at `HIGHLIGHT_Y + 0.002`.
- Picking: 64 invisible planes in `squares.tsx:15-21` with `userData.square`; handlers on the
  parent group (:194-210). Annotation meshes must set `raycast={() => null}`.
- Camera: `src/lib/camera.ts` presets (:23-30), limits (:32-50), `fitPoseToAspect` (:122-148);
  rig `camera-rig.tsx:142-155` reads `useThree(size)`, `SEAT_HALF`/`ORBIT_HALF_WIDTH` (:45,:54);
  refs at :158-165 stop resizes from replaying preset transitions. A narrower board column re-fits
  automatically through the container query.

## Game shell layout

- `game-shell-view.tsx:491-497`: grid `lg:grid-cols-[minmax(0,1fr)_23.75rem] xl:[…_25rem]`
  (focus: `grid-cols-1`); board column :500; board box :539-544 (`[container-type:size]`,
  `aspect-square h-[min(100cqw,100cqh)]`); sidebar :688; outer frame :468-478 never scrolls
  (`h-[calc(100dvh-3.5rem)] overflow-hidden`), so a tutor panel owns its own scrollport.
- `GameShellMeta` at :60-77 is where a `tutor?` slot belongs.

## Engine

- `src/lib/engine/stockfish-client.ts`: `SearchRequest { fen, depth, multiPv, skillLevel?,
  timeoutMs, signal? }` (:40-51) → `SearchResult { bestmove, lines: PvLine[], elapsedMs, stopped }`
  (:53-61); `search()` :199-201 is **queued** (:311-318), cancel only via `signal`/`stop()`;
  refcounted singleton `acquireEngine/releaseEngine` (:403-468); `useStockfish(enabled)` in
  `use-stockfish.ts:83` publishes `engineStatus`/`downloadPercent` to `useAiStore`.
- `parse-uci.ts` `PvLine { multipv, depth, seldepth, scoreCp, mateIn, pv }` (side-to-move POV);
  `candidates.ts:52 linesToCandidates(fen, lines)` adds SAN.
- Precedents: hints `use-hint.ts:50-57` (depth 12, multiPv 3, 1500 ms, skill 20); AI turn
  `use-ai-turn.ts:231-237`. Server-side quota precedent: `src/app/api/ai/hint/route.ts:92` charges
  `api.games.useHint` with the caller's token before the model runs; `convex/games.ts:718-736`.

## Auth seams

- Client: `ConvexProviderWithClerk` (`src/components/providers/convex-client-provider.tsx:20`);
  gate subscriptions on `useConvexAuth().isAuthenticated`; Clerk-only state via `useAuth()`.
- `src/proxy.ts:22-24` protects `/play /game /settings /profile`; `/api/ai` excluded on purpose.
- Route handlers: `auth()` first (`hint/route.ts:62`, `move/route.ts:66`); `guardAiGame`
  (`_lib/game-guard.ts:38-60`); `getAuthToken()` (`src/lib/convex-server.ts:23-26`).
- Convex: `convex/lib/auth.ts` `requireIdentity` :13-17, `requirePlayer` :33-38, `optionalPlayer` :41-45.

## Dev harness

- `src/app/dev/game/harness.tsx:66-69` renders the real `GameShellView` from
  `useMockGameController(scenario)`; it pushes AI state into the real stores (:76-82) and fakes
  hint meta (:105-128). Scenarios in `src/lib/mock/scenarios.ts:26-34, 45-80`.
- `src/app/dev/board3d` → `src/components/board3d/dev-preview.tsx` is the fastest place to
  iterate on 3D meshes (fps readout, showcase toggle).
