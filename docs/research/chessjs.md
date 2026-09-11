# chess.js 1.4.0 — verified API reference for the 3D chess project

Scope: everything a server-validated (Convex mutation) multiplayer chess app needs from chess.js. Every claim below was verified against the installed package at `node_modules/chess.js` (version 1.4.0, BSD-2-Clause) — `package.json`, `README.md`, `dist/types/chess.d.ts`, `dist/esm/chess.js` — and by executing a Node 24 script against `dist/esm/chess.js`. Source tags: `[d.ts]`, `[README]`, `[src]` (dist/esm/chess.js), `[run]` (executed and observed).

Requirements this maps to (`/Users/sonnysangha/Downloads/3dchessrequirements.md`): FR-9 (all rules via chess.js), FR-10/NFR-4 (server-side validation in Convex mutations), FR-11 (promotion picker), FR-12 (store FEN + SAN list + PGN + turn + status + result), FR-13 (statuses), FR-16 (captured-pieces tray), FR-36 (validate Eve's SAN move), FR-44 (undo = replay truncated SAN list), FR-47 (PGN export).

---

## 1. Package shape and importing

- `package.json` `[d.ts][run]`: `"main": "dist/cjs/chess.js"`, `"module": "dist/esm/chess.js"`, `"types": "dist/types/chess.d.ts"`. **There is no `exports` field and no `"type"` field.** Bundlers (Next/Turbopack, Convex's esbuild) pick the ESM build via `module`; plain Node `require`/`import` picks `main` (CJS). Both project tsconfigs use `moduleResolution: "bundler"`, so `import { Chess } from 'chess.js'` type-checks fine.
- Single module, no subpath imports. Deep-importing `chess.js/dist/esm/chess.js` works but is unnecessary.
- **Named exports only, no default export** `[run]`: `Object.keys(mod)` = `BISHOP, BLACK, Chess, DEFAULT_POSITION, KING, KNIGHT, Move, PAWN, QUEEN, ROOK, SEVEN_TAG_ROSTER, SQUARES, WHITE, validateFen, xoroshiro128`. `'default' in mod === false`. `import Chess from 'chess.js'` will NOT work.
- Type-only exports `[d.ts]`: `Color`, `Piece`, `PieceSymbol`, `Square`.

```ts
import { Chess, Move, DEFAULT_POSITION, SQUARES, WHITE, BLACK, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, validateFen } from 'chess.js'
import type { Color, Piece, PieceSymbol, Square } from 'chess.js'
```

### Constants and types `[d.ts]`
```ts
const WHITE = 'w'; const BLACK = 'b'
const PAWN = 'p'; const KNIGHT = 'n'; const BISHOP = 'b'; const ROOK = 'r'; const QUEEN = 'q'; const KING = 'k'
type Color = 'w' | 'b'
type PieceSymbol = 'p' | 'n' | 'b' | 'r' | 'q' | 'k'
type Square = 'a8' | 'b8' | ... | 'h1'            // all 64, a string-literal union
type Piece = { color: Color; type: PieceSymbol }
const DEFAULT_POSITION = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const SQUARES: Square[]                           // length 64, ordered a8..h8, a7..h7, ..., a1..h1  [run]
const SEVEN_TAG_ROSTER: Record<string,string>     // { Event:'?', Site:'?', Date:'????.??.??', Round:'?', White:'?', Black:'?', Result:'*' } [src]
function validateFen(fen: string): { ok: boolean; error?: string }
```
Note `BISHOP` and `BLACK` are both the string `'b'`; they are disambiguated only by which field you put them in (`type` vs `color`).

---

## 2. Runtime compatibility (Convex default runtime, Next.js server/client, Web Worker)

- `[src]` `grep` of `dist/esm/chess.js` for `require(`, `fs`, `process.`, `Buffer`, `__dirname`, `import ` returned **nothing**. The bundle is dependency-free, pure ES2022-style JS (class fields, optional chaining, `Map`).
- `[src]` It uses **BigInt** at module-evaluation time (`xoroshiro128`, `0x...n` literals, `MASK64`) for Zobrist hashing (`hash()`, threefold repetition). Any runtime without BigInt will fail at import.
- Convex default runtime `[context7: docs.convex.dev/functions/runtimes]`: "supports most npm libraries compatible with browsers, Deno, and Cloudflare Workers"; queries and mutations can import npm packages; `"use node"` is only for libraries that need Node built-ins. chess.js needs none. BigInt is a first-class Convex value (`v.int64()` maps to `bigint`; `Value` union includes `bigint`) `[node_modules/convex/dist/esm-types/values/validator.d.ts:45,142; value.d.ts:45]`, so the runtime has BigInt.
- Conclusion: **chess.js can be imported directly in Convex mutations/queries (default runtime), Next.js server components/route handlers, client components, and Web Workers.** No `"use node"` needed. chess.js README: "extensively tested in node.js and most modern browsers" `[README]`.
- The `convex/tsconfig.json` already targets `ESNext` / `lib: ES2023`, which covers BigInt literals for type-checking.

---

## 3. Constructor, load, reset, clear

```ts
new Chess(fen?: string, { skipValidation?: boolean } = {})   // [d.ts]
chess.load(fen: string, { skipValidation?: boolean; preserveHeaders?: boolean } = {}): void
chess.reset(): void                                           // = load(DEFAULT_POSITION)  [src]
chess.clear({ preserveHeaders?: boolean } = {}): void         // empty board '8/8/8/8/8/8/8/8 w - - 0 1'
```
- Invalid FEN **throws** `Error` from both the constructor and `load()` `[README][src:1847][run]`. Observed message: `Invalid FEN: must contain six space-delimited fields` for `'garbage'`. With `{ skipValidation: true }` no throw `[run]`.
- `load()` accepts FEN with 2–5 fields and pads castling/ep/halfmove/fullmove with `- - 0 1` `[src:1836-1842][README]`.
- **`load()` (and therefore `reset()`) calls `clear()`, which wipes `_history`, `_comments`, and the repetition `_positionCount` map** `[src clear()]`. Verified `[run]`: after `move('e4'); load(fen)`, `undo()` returns `null` and `history().length === 0`. Consequence: a `Chess` built from a stored FEN has **no history and cannot detect threefold repetition** for positions that occurred before the load. For server validation of threefold/fifty-move you must replay the SAN list from the start (see section 11), not just load the FEN.
- Loading a non-default FEN auto-sets PGN headers `SetUp: '1'` and `FEN: <fen>` (only if history is empty) `[src _updateSetup]`.

---

## 4. Making moves: `move()`

```ts
chess.move(
  move: string | { from: string; to: string; promotion?: string } | null,
  { strict?: boolean } = {},
): Move                                                       // [d.ts]
```
- **Illegal / unparsable move THROWS** (it never returns `null` in 1.x) `[src:2527-2530][run]`:
  - string input: `Error("Invalid move: e5")`
  - object input: `Error("Invalid move: {\"from\":\"e2\",\"to\":\"e5\"}")`
  - `move(null)` performs a *null move* (SAN `'--'`) and throws `Error('Null move not allowed when in check')` if in check `[src:2535][run]`. Never pass `null` from user input; reject it before calling.
- SAN is **case-sensitive**: `move('nf3')` throws `[README][run]`.
- Default parser is **permissive**: accepts `e2e4`, `e7-e5`, `Pf2-f4`, `ef4`, `Ng1-f3`, `d7xd6`, sloppy disambiguation `[README][run]`. `{ strict: true }` accepts only spec-compliant SAN; `move('e2e4', { strict: true })` throws `[run]`. Recommendation: for Eve-produced SAN (FR-36) use permissive mode (the model may emit LAN); for stored SAN lists (which chess.js itself generated) either works.
- Object form: matched against generated legal moves by `from`, `to`, and, **when the legal move is a promotion, `promotion` must equal exactly** `[src:2512-2518]`. Verified `[run]`: on `4k3/1P6/8/8/8/8/8/4K3 w - - 0 1`, `move({ from:'b7', to:'b8' })` throws `Invalid move: {...}`; `move({ from:'b7', to:'b8', promotion:'q' })` returns `{ san:'b8=Q+', lan:'b7b8q', promotion:'q', flags:'np' }`. So a UI must supply `promotion` or the server will reject the move; there is no implicit auto-queen.
- On non-promotion moves an extraneous `promotion` field is ignored (the matcher only checks it when the generated move has a promotion) `[src]`.
- SAN promotion form is `b8=Q` (chess.js adds `+`/`#` itself) `[run]`.
- Returned `Move` is computed **before** the board mutates (SAN/`before`/`after` are generated by temporarily making and undoing the move) `[src:2540-2545]`.

---

## 5. The `Move` object `[d.ts][src][run]`

`Move` is a class (exported), returned by `move()`, `undo()`, `moves({verbose:true})`, `history({verbose:true})`.

| Field | Type | Notes |
|---|---|---|
| `color` | `Color` | mover |
| `from`, `to` | `Square` | |
| `piece` | `PieceSymbol` | moving piece |
| `captured?` | `PieceSymbol` | set on captures **and en passant** (`'p'`) `[run]` |
| `promotion?` | `PieceSymbol` | set on promotions |
| `flags` | `string` | **deprecated, removed in 2.0** `[d.ts]`. Chars: `n` normal, `c` capture, `b` big pawn (2-square), `e` en passant, `p` promotion, `k` kingside castle, `q` queenside castle, `-` null move `[src FLAGS]` |
| `san` | `string` | e.g. `Qxf7#`, `O-O`, `b8=Q+` |
| `lan` | `string` | `from+to`, **plus promotion letter when promoting** (`b7b8q`) `[src][run]`. Castling LAN is king move `e1g1` `[run]` — this is UCI format, directly usable with Stockfish. |
| `before` | `string` | FEN before the move |
| `after` | `string` | FEN after the move |

Methods `[d.ts]`: `isCapture()`, `isPromotion()`, `isEnPassant()`, `isKingsideCastle()`, `isQueensideCastle()`, `isBigPawn()`.

Gotchas:
- **`isCapture()` is `false` for en passant** (`isEnPassant()` is `true`, `captured === 'p'`) `[README][run]`. For a captured-pieces tray use `move.captured` (truthy check), not `isCapture()`.
- There is **no `isCastle()`** despite the deprecation comment mentioning it; use `isKingsideCastle() || isQueensideCastle()` `[d.ts]`.
- `captured` and `promotion` are declared class fields, so `Object.keys(move)` always lists them and `'captured' in move` is always `true` even when `undefined` `[run]`. Test with `move.captured !== undefined` / truthiness. `JSON.stringify(move)` drops the undefined ones and the methods `[run]` — a serialised `Move` is a plain object without `isCapture()` etc.; if you store it in Convex, store the fields you need explicitly.

---

## 6. Legal move generation: `moves()`

```ts
chess.moves(): string[]                                          // SAN list
chess.moves({ square }: { square: Square }): string[]
chess.moves({ piece }: { piece: PieceSymbol }): string[]
chess.moves({ verbose: true, square?, piece? }): Move[]
chess.moves({ verbose: false, square?, piece? }): string[]
chess.moves({ verbose?: boolean, square?, piece? }): string[] | Move[]
```
`[d.ts]` (many overloads). `square` and `piece` are case-insensitive inside `_moves` `[src]`. An unknown square (`moves({ square: 'zz' })`) returns `[]` rather than throwing `[src][run]`. Empty array also when the game is over or the square holds no piece of the side to move.

Promotion detection for a UI (FR-11): `moves({ square: from, verbose: true }).filter(m => m.to === to)` — if any has `isPromotion()` (or `promotion` set) there will be exactly four (`b8=N b8=B b8=R+ b8=Q+`) `[run]`; show the picker, then call `move({ from, to, promotion })`.

---

## 7. Position queries

```ts
chess.fen({ forceEnpassantSquare?: boolean } = {}): string
chess.turn(): Color
chess.moveNumber(): number                     // full-move number from FEN field 6 [run: 4 after 7 plies]
chess.board(): ({ square: Square; type: PieceSymbol; color: Color } | null)[][]   // 8 rows, row 0 = rank 8 (a8..h8), row 7 = rank 1 [run]
chess.get(square: Square): Piece | undefined   // undefined when empty [run]
chess.findPiece(piece: Piece): Square[]        // e.g. findPiece({ type: KING, color: WHITE }) -> ['e1'] [run]
chess.squareColor(square: Square): 'light' | 'dark' | null   // null for bogus input [run]
chess.hash(): string                           // 64-bit Zobrist hex, e.g. '3436f01fd716346e' for start position [run]
chess.ascii(): string
chess.perft(depth: number): number
chess.getCastlingRights(color: Color): { k: boolean; q: boolean }   // keys are the KING/QUEEN constants 'k'/'q' [d.ts][run]
chess.setCastlingRights(color: Color, rights: Partial<{ k: boolean; q: boolean }>): boolean
chess.isAttacked(square: Square, attackedBy: Color): boolean       // ignores side to move; own pieces / empty squares count [README][run]
chess.attackers(square: Square, attackedBy?: Color): Square[]      // defaults to side to move; pinned pieces still count [README]
chess.put(piece: { type: PieceSymbol; color: Color }, square: Square): boolean  // false on invalid piece/square or 2nd king of same colour [README][run]
chess.remove(square: Square): Piece | undefined
chess.setTurn(color: Color): boolean          // true if changed; throws if side to move is in check [README]
```

**FEN en passant gotcha** `[src _updateEnPassantSquare, fen()][run]`: chess.js only records/prints the en passant square when a pawn of the side to move can actually capture (after `1.e4` the FEN's 4th field is `-`, and even `forceEnpassantSquare: true` printed `-` because the internal square had already been cleared). Stockfish/lichess print `e3` there. Do **not** compare chess.js FENs byte-for-byte against FENs from other tools; when handing a FEN to Stockfish this is harmless (fewer ep squares, never wrong ones).

---

## 8. Game status

```ts
chess.isCheck(): boolean          // side to move is in check
chess.inCheck(): boolean          // alias of isCheck() [src:2264]
chess.isCheckmate(): boolean      // isCheck() && no legal moves
chess.isStalemate(): boolean      // !isCheck() && no legal moves
chess.isInsufficientMaterial(): boolean   // K v K, K v KN, K v KB, and any-number-of-bishops all on one colour [src]
chess.isThreefoldRepetition(): boolean    // position hash count >= 3 in *this object's* history [src]
chess.isDrawByFiftyMoves(): boolean       // halfmove clock >= 100 [src]
chess.isDraw(): boolean           // fiftyMoves || stalemate || insufficient || threefold  [src:2336-2341]
chess.isGameOver(): boolean       // checkmate || isDraw()  [src:2342]
```
- `isDraw()` **includes stalemate** in 1.4.0 (`[src]`; the README text saying "50-move rule or insufficient material" is stale). Check `isCheckmate()`/`isStalemate()` before `isDraw()` if you need distinct statuses (FR-13 has separate `checkmate`, `stalemate`, `draw`).
- Threefold and fifty-move are automatic (no claim step) — `isGameOver()` becomes true as soon as they occur `[run]`. The fifty-move counter is read from the FEN, so it survives a `load()`; threefold does not (section 3).
- Winner on checkmate is the opposite of `turn()` (side to move is the mated side).

---

## 9. History, undo, PGN, headers, comments

```ts
chess.history(): string[]                       // SAN
chess.history({ verbose: true }): Move[]        // each with before/after FEN
chess.undo(): Move | null                       // null when nothing to undo [run]
chess.pgn({ newline?: string; maxWidth?: number } = {}): string
chess.setHeader(key: string, value: string): Record<string,string>
chess.getHeaders(): Record<string,string>
chess.removeHeader(key: string): boolean
chess.header(...args: string[]): Record<string, string|null>   // DEPRECATED: returns ~30 null placeholder tags too [d.ts][run]
chess.loadPgn(pgn: string, { strict?: boolean; newlineChar?: string } = {}): void   // throws on bad PGN / bad move: 'Invalid move in PGN: Qxe5' [run]
chess.getComment(): string; chess.setComment(c: string): void; chess.removeComment(): string
chess.getComments(): { fen: string; comment: string }[]; chess.removeComments(): same
// deleteComment()/deleteComments() are deprecated aliases [d.ts]
```
- **Performance**: `history()` (both forms) and `pgn()` undo every move to the start and replay them, regenerating SAN each time `[src history(), pgn()]`. O(n) per call with real work per ply; call once per mutation, never inside a per-move loop.
- **`pgn()` in 1.4.0 always emits the Seven Tag Roster** with `?` placeholders plus `[Result "*"]` even when you set nothing `[src HEADER_TEMPLATE][run]`:
  `[Event "?"]\n[Site "?"]\n[Date "????.??.??"]\n[Round "?"]\n[White "?"]\n[Black "?"]\n[Result "*"]\n\n1. e4 e5 ... *`. (The README example showing only White/Black is stale.) The trailing result token is `this._header.Result || '*'` `[src]` — set `setHeader('Result', '1-0' | '0-1' | '1/2-1/2')` yourself when the game ends; chess.js does not infer it. Set `White`/`Black`/`Date`/`Event` from your game doc for FR-47 export.
- If the game started from a custom FEN, `pgn()` includes `[SetUp "1"]` and `[FEN "..."]` `[src _updateSetup]`; `loadPgn` requires `FEN` when `SetUp` is present `[src:2950]`.
- `loadPgn` default `newlineChar` is `\r?\n`; parse errors throw `[README][run]`.
- Comments are keyed by FEN of the position they annotate `[README][run]`; `setComment` after a move annotates the resulting position and appears as `1. e4 {hi}` in PGN `[run]`. Useful for storing Eve commentary in the exported PGN.

---

## 10. Verified end-to-end snippet (server-side validation helpers)

Executed against the installed build `[run]`; outputs noted in comments.

```ts
import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js'

// ---- 1. Replay a SAN move list from the start position (FR-44 undo, FR-10 validation)
export function replay(sans: string[], startFen?: string): Chess {
  const chess = startFen ? new Chess(startFen) : new Chess()   // throws on invalid FEN
  for (const san of sans) chess.move(san)                       // throws Error('Invalid move: X') on the first illegal SAN
  return chess
}

// ---- 2. Validate + apply one incoming move inside a Convex mutation
export type Incoming = { from: string; to: string; promotion?: 'q' | 'r' | 'b' | 'n' } | string
export function applyMove(chess: Chess, input: Incoming, expectedColor: Color) {
  if (chess.turn() !== expectedColor) throw new Error('Not your turn')
  try {
    return chess.move(input)          // permissive parser; use { strict: true } if input is guaranteed SAN
  } catch {
    throw new Error('Illegal move')   // chess.js throws; never returns null in 1.x
  }
}

// ---- 3. Does from->to need a promotion choice? (FR-11)
export function needsPromotion(chess: Chess, from: Square, to: Square): boolean {
  return chess.moves({ square: from, verbose: true }).some(m => m.to === to && m.isPromotion())
  // start pos 4k3/1P6/8/8/8/8/8/4K3 w: needsPromotion(c,'b7','b8') === true; moves are b8=N b8=B b8=R+ b8=Q+
}

// ---- 4. Game status string matching FR-13 / games.status + games.winner
export type Status =
  | { status: 'active'; inCheck: boolean }
  | { status: 'checkmate'; winner: Color }
  | { status: 'stalemate'; winner: 'draw' }
  | { status: 'draw'; winner: 'draw'; reason: 'threefold' | 'insufficient' | 'fifty-move' }
export function gameStatus(chess: Chess): Status {
  if (chess.isCheckmate()) return { status: 'checkmate', winner: chess.turn() === 'w' ? 'b' : 'w' }
  if (chess.isStalemate()) return { status: 'stalemate', winner: 'draw' }   // check BEFORE isDraw(): isDraw() includes stalemate
  if (chess.isThreefoldRepetition()) return { status: 'draw', winner: 'draw', reason: 'threefold' }
  if (chess.isInsufficientMaterial()) return { status: 'draw', winner: 'draw', reason: 'insufficient' }
  if (chess.isDrawByFiftyMoves()) return { status: 'draw', winner: 'draw', reason: 'fifty-move' }
  return { status: 'active', inCheck: chess.inCheck() }
}
// replay(['e4','e5','Qh5','Nc6','Bc4','Nf6','Qxf7#']) -> { status:'checkmate', winner:'w' }; isGameOver() true; fen ends '... b KQkq - 0 4'

// ---- 5. Captured pieces from history (FR-16 tray). Keyed by the capturer's colour.
export function capturedPieces(chess: Chess): Record<Color, PieceSymbol[]> {
  const out: Record<Color, PieceSymbol[]> = { w: [], b: [] }
  for (const m of chess.history({ verbose: true })) {
    if (m.captured) out[m.color].push(m.captured)   // truthy check: field exists but is undefined on quiet moves; en passant sets 'p'
  }
  return out
}
// Scholar's mate above -> { w: ['p'], b: [] }

// ---- 6. Persisted snapshot for the games doc (FR-12)
export function snapshot(chess: Chess, result?: '1-0' | '0-1' | '1/2-1/2') {
  if (result) chess.setHeader('Result', result)
  return {
    fen: chess.fen(),
    moves: chess.history(),           // SAN[]
    pgn: chess.pgn(),                 // includes seven-tag roster + '[Result ...]'
    turn: chess.turn(),
    lastMoveUci: chess.history({ verbose: true }).at(-1)?.lan,  // 'e2e4' / 'e7e8q' — Stockfish-compatible
  }
}
```

Recommended mutation flow (FR-10, NFR-4): load `game.moves` (SAN[]) -> `replay()` (so threefold works) -> assert `turn()` matches the caller's colour -> `applyMove()` -> `gameStatus()` -> write `fen`, `moves`, `pgn`, `status`, `winner`. Replaying ~100 plies is cheap; if games get long, cache `fen` for reads only and keep the SAN list as the source of truth. For Eve's suggested SAN (FR-36): `try { new Chess(fen).move(san) } catch { fallbackToStockfishBestMove() }` — note a FEN-constructed instance can't see repetition history, which is fine for a legality check.

Stockfish interop: feed Stockfish `position fen <chess.fen()>` or `position startpos moves <history({verbose:true}).map(m=>m.lan).join(' ')>`; convert Stockfish `bestmove e7e8q` back with `chess.move({ from: 'e7', to: 'e8', promotion: 'q' })` (or just `chess.move('e7e8q')`, which the permissive parser accepts `[run: 'e2e4' accepted]`).

---

## 11. Breaking changes vs 0.x to watch for (1.x-specific behaviour verified above)

- `move()` **throws** on illegal moves (0.x returned `null`). Wrap in try/catch.
- Constructor/`load()` **throw** on invalid FEN (0.x `load()` returned `false`). `validateFen()` is the non-throwing check.
- `new Chess()` must be called with `new` (class). README's `Chess()` without `new` in the `squareColor` example is a typo.
- `header()` is deprecated (returns null placeholder tags) — use `setHeader`/`getHeaders`/`removeHeader`.
- `deleteComment(s)` deprecated -> `removeComment(s)`.
- `Move.flags` deprecated (removed in 2.0) -> use `isCapture()`/`isPromotion()`/etc.
- `game_over()`, `in_check()`, `in_checkmate()`, snake_case names are gone; use the camelCase names listed above (`isGameOver`, `inCheck`/`isCheck`, `isCheckmate`, ...).
- `Move` gained `lan`, `before`, `after`.

---

## Unverified / open questions

- ~~Convex default-runtime import of chess.js was verified indirectly...~~ **RESOLVED — see section 12 below.** chess.js 1.4.0 was executed inside a live Convex dev deployment (`tangible-dogfish-529`) in the default V8 isolate runtime, with no `'use node'`.
- The README text for `isDraw()` ("50-move rule or insufficient material") disagrees with the 1.4.0 source, which also includes stalemate and threefold. The source and a live run were treated as authoritative.
- `fen({ forceEnpassantSquare: true })` returned `-` after `1.e4` in the run, because `_epSquare` is cleared when no capturing pawn exists. Whether it ever differs from the default output in 1.4.0 (i.e. only in the "pinned ep pawn" case) was not tested.
- ~~Precise cost of `history()`/`pgn()` on long games was not benchmarked; expected to be well under a millisecond...~~ **RESOLVED — see section 12.6 below. The "well under a millisecond" expectation was WRONG: `history()` and `pgn()` each cost ~5 ms on a 60-move game inside the Convex isolate.**
- `perft()` and `xoroshiro128` are exported but irrelevant to the project; not exercised.

---

# 12. Verified: chess.js inside a live Convex deployment

**Status: PROVEN.** Everything below was executed against the project's real Convex dev deployment
`tangible-dogfish-529` (`https://tangible-dogfish-529.convex.cloud`) on 2026-09-09, using
`npx convex dev --once` to push and the Convex MCP `run` tool to invoke. All probe files
(`convex/chessProbe.ts`, `convex/chessProbeFr10.ts`, `convex/chessProbeCleanup.ts`) and the
`probeGames` rows were deleted afterwards; `convex/` is back to `README.md` + `_generated` + `tsconfig.json`.

## 12.1 Headline answers

| Question | Answer |
|---|---|
| Does `import { Chess } from "chess.js"` work in a **default-runtime** Convex query/mutation/action? | **Yes.** No `'use node'` anywhere. |
| Is a `'use node'` action + `internalMutation` split required? | **No.** Do not use one — it would cost a second round trip and lose transactionality. |
| Which runtime does Convex bundle it into? | `environment: "isolate"` (the V8 runtime), confirmed from `--debug-bundle-path` metadata. |
| Bundle size warning? | **None emitted.** Push took 2.0–2.8 s. |
| Does chess.js's internal BigInt (zobrist) break anything? | **No** — it stays internal. But BigInt *crossing the function boundary* is a real hazard (12.5). |
| Does anything trip the Convex value serializer? | **Yes — the `Move` class instance.** You must flatten it. See 12.5. |
| `~40-move load + move + pgn()` round trip | **0.176 ms** (FEN path) / **9.34 ms** (SAN-replay path). See 12.6. |

## 12.2 Bundling facts (verified via `npx convex dev --once --debug-bundle-path <dir>`)

`fullConfig.json` for a single module importing chess.js:

```json
{ "modules": [{ "path": "chessProbe.js", "environment": "isolate", "source": "<136802 bytes>" }],
  "nodeDependencies": [], "udfServerVersion": "1.45.0" }
```

- `environment: "isolate"` — **not** `"node"`. chess.js runs in the V8 isolate.
- `nodeDependencies: []` — chess.js is **bundled inline**, not shipped as an external node package.
- Single-module bundle: **136,802 bytes** (133.6 KiB), chess.js inlined.
- **chess.js is NOT duplicated per module.** With three convex modules importing it, esbuild code-splits it
  into a shared chunk:

  ```
  chessProbe.js        8,618 bytes   (isolate)
  chessProbeB.js         246 bytes   (isolate)
  chessProbeC.js         255 bytes   (isolate)
  _deps/UB7ISJ55.js  128,341 bytes   (isolate)   <- the whole of chess.js, ONCE
  TOTAL              137,460 bytes
  ```
  So importing chess.js from as many Convex modules as you like costs ~128 KiB total, against Convex's
  **32 MiB per-deployment code limit** (docs.convex.dev/production/state/limits). Zero pressure.

- **Why the BigInt literals survive:** Convex's bundler runs esbuild with `target: "esnext"`
  (verified: two occurrences of `target: "esnext"` in `convex@1.45.0/dist/cli.bundle.cjs`).
  The 128-bit literal `0xa187eb39cdcaed8f31c4b365b102e01en` (the xoroshiro128 seed at
  `chess.js/dist/esm/chess.js:1281`) is emitted **verbatim** into the bundle — no downleveling,
  no "Big integer literals are not available in the configured target environment" error.
  Verified by grepping the emitted bundle.

## 12.3 Exact probe code that was run (default runtime — note the absence of `'use node'`)

```ts
// convex/chessProbe.ts  (THROWAWAY — deleted after the run)
import { query, mutation, action } from "./_generated/server";
import { Chess, validateFen, SQUARES } from "chess.js";

const MID_FEN = "3b4/3n2pr/5p1n/1p1P1PNp/PP5k/4KP1P/Q2p2PR/5B2 w - - 2 41"; // after 40 full moves
const GAME_60: string[] = ["b3","e6","Na3","e5", /* …120 SAN plies, 60 full moves… */ "Rc3"];

function core() {
  const c = new Chess();
  const m = c.move("e4");
  const verbose = c.moves({ verbose: true });
  const scholars = new Chess();
  for (const san of ["e4","e5","Qh5","Nc6","Bc4","Nf6","Qxf7#"]) scholars.move(san);
  const loaded = new Chess();
  loaded.load(MID_FEN);
  const afterLoad = loaded.move("Qa1");
  return {
    moveSan: m.san, moveLan: m.lan, moveIsCapture: m.isCapture(),
    moveBeforeEqStart: m.before === new Chess().fen(),
    verboseCount: verbose.length, verboseIsMoveInstance: verbose[0].constructor.name,
    fen: c.fen(), pgn: c.pgn(),
    hashHex: c.hash(),                       // exercises the BigInt zobrist path
    hashAfterUndoMatchesStart: (() => { const x = new Chess(); const h0 = x.hash();
                                        x.move("e4"); x.undo(); return x.hash() === h0; })(),
    scholarsIsCheckmate: scholars.isCheckmate(), scholarsIsGameOver: scholars.isGameOver(),
    loadedTurn: loaded.turn(), loadedMoveNumber: loaded.moveNumber(),
    afterLoadSan: afterLoad.san, afterLoadFen: loaded.fen(),
    validateFenOk: validateFen(MID_FEN).ok, squaresCount: SQUARES.length,
    illegalThrows: (() => { try { new Chess().move("e5"); return "NO THROW"; }
                           catch (e) { return (e as Error).message; } })(),
  };
}
function replay(sans: string[]) { const c = new Chess(); for (const s of sans) c.move(s); return c; }

export const probeMutation = mutation({ args: {}, handler: async () => {
  const t0 = Date.now(); const c = replay(GAME_60); const t1 = Date.now();
  return { ...core(), replay120Plies: { fen: c.fen(), historyLen: c.history().length,
           dateNowDelta: t1 - t0, dateNowPinned: t0 === t1 } };
}});
```

### Actual output of `convex run chessProbe:probeMutation '{}'`

```json
{
  "moveSan": "e4", "moveLan": "e2e4", "moveColor": "w", "moveFrom": "e2", "moveTo": "e4",
  "movePiece": "p", "moveIsCapture": false, "moveBeforeEqStart": true,
  "verboseCount": 20, "verboseFirst": "Nc6", "verboseIsMoveInstance": "Move",
  "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
  "pgn": "[Event \"?\"]\n[Site \"?\"]\n[Date \"????.??.??\"]\n[Round \"?\"]\n[White \"?\"]\n[Black \"?\"]\n[Result \"*\"]\n\n1. e4 *",
  "hashHex": "7dc436b2c931692c",
  "hashAfterUndoMatchesStart": true,
  "scholarsIsCheckmate": true, "scholarsIsGameOver": true,
  "scholarsFen": "r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4",
  "scholarsPgnTail": ". e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# *",
  "loadedTurn": "b", "loadedMoveNumber": 41, "afterLoadSan": "Qa1",
  "afterLoadFen": "3b4/3n2pr/5p1n/1p1P1PNp/PP5k/4KP1P/3p2PR/Q4B2 b - - 3 41",
  "validateFenOk": true, "squaresCount": 64,
  "illegalThrows": "Invalid move: e5",
  "replay120Plies": { "fen": "6n1/8/1P1PN3/4pP1p/p3KP1k/2r4P/8/5B2 w - - 3 61",
                      "historyLen": 120, "dateNowDelta": 0, "dateNowPinned": true }
}
```

Every API the project needs — `new Chess()`, `move(san)`, `move({from,to,promotion})`,
`moves({verbose:true})`, `fen()`, `pgn()`, `hash()`, `undo()`, `isCheckmate()`, `isGameOver()`,
`load(fen)`, `turn()`, `moveNumber()`, `history()`, `validateFen()`, `SQUARES` — works unmodified.

**Note `"scholarsPgnTail": "… 4. Qxf7# *"`** — `pgn()` does **not** auto-set the `Result` tag on
checkmate; it stays `*`. You must `setHeader('Result', '1-0' | '0-1' | '1/2-1/2')` yourself.

## 12.4 Verified end-to-end FR-10 / NFR-4 mutation (with real db reads + writes)

This is the shape to copy. It was deployed and exercised on the live deployment.

```ts
// convex/chessProbeFr10.ts  (THROWAWAY — deleted after the run)
import { mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { Chess } from "chess.js";

export const applyMove = mutation({
  args: { gameId: v.id("probeGames"), from: v.string(), to: v.string(),
          promotion: v.optional(v.string()), asColor: v.union(v.literal("w"), v.literal("b")) },
  handler: async (ctx, args) => {
    const g = await ctx.db.get(args.gameId);
    if (!g) throw new ConvexError("no game");

    // rebuild the authoritative position from the stored SAN list (so threefold works)
    const c = new Chess();
    for (const san of g.moves as string[]) c.move(san);

    if (c.turn() !== args.asColor)
      throw new ConvexError({ code: "NOT_YOUR_TURN", turn: c.turn() });

    let move;
    try { move = c.move({ from: args.from, to: args.to, promotion: args.promotion }); }
    catch (e) { throw new ConvexError({ code: "ILLEGAL_MOVE", detail: (e as Error).message }); }

    const status = c.isCheckmate() ? "checkmate"
                 : c.isStalemate() ? "stalemate"
                 : c.isDraw()      ? "draw" : "active";
    await ctx.db.patch(args.gameId, {
      fen: c.fen(),
      moves: [...(g.moves as string[]), move.san],   // free — no history() call needed
      pgn: c.pgn(), turn: c.turn(), status,
    });
    // Move is a CLASS instance -> MUST be flattened before returning (see 12.5)
    return { san: move.san, lan: move.lan, captured: move.captured ?? null,
             isCapture: move.isCapture(), status, inCheck: c.inCheck(), fen: c.fen() };
  },
});
```

Observed results:

| Call | Result |
|---|---|
| `applyMove {from:"e2",to:"e4",asColor:"w"}` | `{"san":"e4","lan":"e2e4","captured":null,"isCapture":false,"status":"active","inCheck":false,"fen":"rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"}` |
| `applyMove {from:"e7",to:"e6",asColor:"w"}` (wrong turn) | `Uncaught ConvexError: {"code":"NOT_YOUR_TURN","turn":"b"}` |
| `applyMove {from:"e7",to:"e5",asColor:"b"}` | OK, `san:"e5"` |
| `applyMove {from:"f1",to:"f4",asColor:"w"}` (blocked bishop) | `Uncaught ConvexError: {"code":"ILLEGAL_MOVE","detail":"Invalid move: {\"from\":\"f1\",\"to\":\"f4\"}"}` |

**Transaction rollback confirmed.** After the two rejected calls, the stored doc was still clean:

```json
{ "fen": "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
  "moves": ["e4","e5"], "turn": "w", "status": "active",
  "pgn": "[Event \"?\"]…\n\n1. e4 e5 *" }
```

Throwing out of the mutation aborts the whole transaction — no partial writes. This is exactly the
NFR-4 guarantee: the client cannot corrupt the game by sending an illegal move.

**Error-message formats differ by input form** (useful for client-side messaging):
- SAN string input → `Invalid move: e5`
- object input → `Invalid move: {"from":"f1","to":"f4"}`

## 12.5 Convex value-serializer gotchas (all reproduced live)

### (a) Returning a `Move` instance THROWS — flatten it

```ts
return { raw: c.moves({ verbose: true })[0] };   // ❌
```
```
Uncaught Error: Move {"color":"w","from":"a2","to":"a3","piece":"p","captured":"undefined",
"promotion":"undefined","flags":"n","san":"a3","lan":"a2a3","before":"…","after":"…"}
is not a supported Convex type (present at path .raw in original object {...}).
    at convexToJsonInternal (convex/src/values/value.ts:407:37)
```

Convex rejects class instances (only plain objects are `Value`s). This bites **any** function that
returns `move`, `moves({verbose:true})`, or `history({verbose:true})` directly — which is the natural
thing to write for FR-11 (legal-move highlighting) and FR-16.

**Fixes, both verified working:**

```ts
// 1. spread — works. Convex SILENTLY DROPS undefined-valued fields.
return { spread: { ...m } };
// -> {"after":"…","before":"…","color":"w","flags":"b","from":"e2","lan":"e2e4",
//     "piece":"p","san":"e4","to":"e4"}
//    note: `captured` and `promotion` are ABSENT, not null. Declare them v.optional(...).

// 2. explicit map — preferred for the legal-move payload (smaller over the wire;
//    `before`/`after` are two full FENs per move and you almost never want 20-40 of them)
return c.moves({ verbose: true })
        .map(m => ({ from: m.from, to: m.to, san: m.san, promotion: m.promotion ?? null }));
// -> [{"from":"a2","promotion":null,"san":"a3","to":"a3"}, …29 more]
```

`{...m}` drops the methods (`isCapture()`, `isPromotion()`, …), so call them **before** spreading.

### (b) BigInt at the boundary: `hash()` is safe, raw zobrist is not

`chess.hash()` returns a **string** (`this._hash.toString(16)`, `chess.js:2255`) — e.g. `"7dc436b2c931692c"` —
so the intended API is safe. But Convex's `v.int64()` is a **signed** 64-bit integer, and a returned
BigInt outside that range throws:

```ts
return { huge: BigInt("0xa187eb39cdcaed8f31c4b365b102e01e") };   // ❌
```
```
Uncaught Error: BigInt 214711438343225530594246349426526445598 does not fit into a 64-bit signed integer.
    at convexToJsonInternal (convex/src/values/value.ts:361:8)
```

Practical consequence: **never** do `BigInt("0x" + chess.hash())` and store it as `v.int64()` — zobrist
hashes are *unsigned* 64-bit, so roughly half of them (those with a leading hex nibble ≥ 8) exceed
`Int64::MAX` and will throw at runtime, intermittently, only for some positions. **Store `chess.hash()`
as a `v.string()`.**

### (c) `Date.now()` is PINNED inside queries and mutations

`probeMutation` measured `dateNowDelta: 0, dateNowPinned: true` across a 120-ply replay that actually
takes ~8 ms. Convex freezes the clock inside a transaction for determinism. Consequences:
- You cannot benchmark or measure elapsed time inside a query/mutation. Use an **action**
  (`performance.now()` **is** available in the Convex isolate — verified `hasPerformanceNow: true`,
  and `Date.now()` does advance there).
- For FR chess-clock work, compute remaining time from `Date.now()` **deltas across mutations**
  (each mutation gets one consistent timestamp), never from two reads inside one mutation.

## 12.6 Benchmarks — measured inside the Convex V8 isolate

Run in a **default-runtime `action`** (no `'use node'`) with `performance.now()`, 50–500 iterations
each after warm-up. Two consecutive runs produced numbers within ~1%, so these are warm/JIT-stable.

### Primitive costs

| Operation | ms/op |
|---|---|
| `new Chess()` | 0.047 |
| `new Chess(MID_FEN)` | 0.028 |
| `load(MID_FEN)` on an existing instance | 0.028 |
| `new Chess().move("e4")` | 0.130 |
| `moves({ verbose: true })` (40-move midgame position) | 1.49 |
| `fen()` on a 120-ply game | **0.0012** |
| `isCheckmate()` when not in check (short-circuits on `isCheck()`) | **0.0005** |
| `isThreefoldRepetition()` on a 120-ply game (Map lookup) | **0.0005** |
| replay 80 plies (40 moves) from SAN | 5.48 |
| replay 120 plies (60 moves) from SAN | 7.96 |
| **`history()` on a 120-ply game** | **5.04** |
| **`history({verbose:true})` on a 120-ply game** | **5.62** |
| **`pgn()` on a 120-ply game** | **5.35** |

### The open question about `history()` / `pgn()` — SETTLED

The earlier guess ("well under a millisecond") was **wrong by ~5×**. `history()`, `history({verbose:true})`
and `pgn()` each cost **~5 ms on a 60-move game** — the same order as replaying the entire game from
scratch — because 1.4.0 implements them by undoing every move to the start and re-applying it to
regenerate SAN. They scale **linearly in ply count** (~0.045 ms/ply). By contrast `fen()`, `turn()`,
`isCheckmate()`, `isThreefoldRepetition()` are effectively free (µs), because they read live board state.

**Rules that follow:**
1. Call `pgn()` **at most once per mutation**, and ideally only when the game ends.
2. **Never call `history()` to append a move.** You already have `move.san`; do
   `moves: [...g.moves, move.san]`. Calling `history()` for this doubles the mutation's CPU for nothing.
3. Don't call `history({verbose:true})` per move to recompute the captured-piece tray (FR-16) — maintain
   the tray incrementally from `move.captured`, or compute it once on the client from the SAN list.

### The two candidate FR-10 mutation strategies, measured

`A` = FEN-primary (`new Chess(storedFen)` → `move` → `fen` → status flags).
`B` = SAN-replay (`new Chess()` → replay stored SAN[] → `move` → `fen` → status flags, incl. threefold).
`C` = `B` + `pgn()` + `history()`.
`D` = legal-move list for the client: `new Chess(storedFen).moves({verbose:true})`.

| Game length | A (ms) | B (ms) | C (ms) | D (ms) |
|---|---|---|---|---|
| 10 moves / 20 plies  | 0.179 | 1.65 | 3.37 | 1.37 |
| 40 moves / 80 plies  | 0.143 | 5.51 | 12.98 | 1.33 |
| ~60 moves / 119 plies | 0.115 | 8.21 | 18.40 | 0.60 |

(A gets *faster* as the game goes on — fewer pieces means fewer moves to generate. D likewise.)

**The `~40-move load + move + pgn()` round trip specifically asked for:**
- FEN path — `new Chess(); load(MID_FEN); move("Qa1"); pgn()` → **0.176 ms**
- SAN-replay path — replay 80 plies + `move` + `fen` + `pgn` + status → **9.34 ms**

### Headroom against Convex limits

Convex's **query/mutation execution-time limit is 1 second** of user code (excludes db ops);
actions get 30 minutes in the Convex runtime; V8 memory is 64 MiB
(docs.convex.dev/production/state/limits, fetched 2026-09-09).

| Strategy at 60 moves | ms | % of the 1 s mutation budget |
|---|---|---|
| A FEN-primary | 0.12 | 0.01 % |
| B SAN-replay | 8.2 | **0.8 %** |
| C SAN-replay + pgn + history | 18.4 | 1.8 % |

Even a pathological 300-ply game on strategy C extrapolates to ~46 ms (4.6 %). **Move validation will
never be the thing that hits the Convex time limit.** Optimise for correctness, not for these numbers.

### Recommendation for FR-10

Use **B**, not A. A is ~50× cheaper but a `Chess` built from a bare FEN has **no position history**, so
`isThreefoldRepetition()` can never fire and the 50-move counter is only as good as the FEN's halfmove
field. 8 ms of the 1000 ms budget is a trivial price for correct threefold detection. Concretely:

- Store `moves: v.array(v.string())` (SAN) as the **source of truth**; store `fen` as a denormalised
  read-cache for the client and for Stockfish (`position fen …`), and `pgn` for export.
- Per mutation: replay SAN → check `turn()` → `move()` in try/catch → derive status → patch
  `{ fen, moves: [...old, move.san], turn, status }`.
- Write `pgn` only on the terminal move (and `setHeader('Result', …)` first), or accept the extra ~4 ms
  and write it every move — both are comfortably in budget.
- Serve the FR-11 legal-move list from a **query** using the cached `fen` (strategy D, ~1.3 ms) rather
  than replaying — legality of the *next* move never depends on repetition history.

## 12.7 Reproducing this

```bash
cd /Users/sonnysangha/Documents/Builds/chess-3d-ai-clerk-game
# 1. write convex/chessProbe.ts (section 12.3)
npx convex dev --once                                  # push; ~2.7s, no warnings
npx convex run chessProbe:probeMutation '{}'
npx convex dev --once --debug-bundle-path /tmp/bundle  # inspect environment + sizes
```
The dev deployment is already provisioned; `CONVEX_DEPLOYMENT` and `NEXT_PUBLIC_CONVEX_URL`
are in `.env.local`.

---

## Unverified / open questions (updated 2026-09-09 after the live Convex run)

Resolved by section 12: default-runtime execution, bundle size/duplication, BigInt bundling,
`history()`/`pgn()` cost. Still open:

- These timings come from one Convex dev deployment on one day. Convex isolates are shared/multi-tenant,
  so absolute ms will vary with host load; the **ratios** (fen/status ≈ free, history/pgn/replay ≈ linear
  in plies) are the durable part. Re-measure if you ever get near the budget.
- The **cold-start** cost of the first invocation after a push (isolate boot + parsing the 128 KiB
  chess.js chunk) was not isolated from network latency. It did not produce a timeout in any run, but the
  first `probeBench` call was not measurably slower than the second, so it appears small.
- Convex's exact bundle-size *warning* threshold was not found in `convex@1.45.0/dist/cli.bundle.cjs`
  (the grep hit a base64 blob). No warning was emitted at 137 KiB; the documented hard limit is
  32 MiB of code per deployment. The threshold at which the CLI starts complaining is unknown.
- Only the `probeGames` table was used, with **no `convex/schema.ts` present** (schemaless mode). Once a
  real schema exists, the `v.optional()` treatment of `Move.captured` / `Move.promotion` (which Convex
  drops entirely when `undefined` — see 12.5a) must be encoded in the validators; this was not tested
  against a declared schema.
- Not tested inside Convex: `undo()` in a mutation loop, `Chess` instances surviving across mutations
  (they cannot — each invocation gets a fresh isolate state; never cache a `Chess` in module scope, since
  Convex isolates may be reused and a mutated module-scope object would leak between transactions).
- The interaction of chess.js with a `'use node'` action was not tested, because it proved unnecessary.
