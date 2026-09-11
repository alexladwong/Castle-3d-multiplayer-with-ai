# stockfish 18.0.8 (npm) — research notes for the 3D chess project

Scope: running Stockfish in a browser Web Worker from Next.js 16 (App Router, Turbopack), and secondarily in Node for an Eve tool.
Everything below was verified against the installed package at
`node_modules/stockfish` (v18.0.8), by executing the engine in Node 24.14.1 and in a real browser (classic Worker served from a plain static server with **no** COOP/COEP headers), and by reading Stockfish 18 upstream source (`sf_18` tag). Sources are cited per section.

---

## 1. Package facts

| Item | Value | Source |
|---|---|---|
| Package | `stockfish@18.0.8`, `buildVersion: "18"` (Stockfish 18 engine) | `package.json` |
| Author / sponsor | Nathan Rugg (nmrugg/stockfish.js), Chess.com | `package.json`, README |
| License | **GPL-3.0** (`Copying.txt` is the GPLv3 text; README: "Stockfish.js (c) 2026, Chess.com, LLC, GPLv3"). The tiny Node glue files (`index.js`, `scripts/*.js`) carry `/// License: MIT` headers, but the engine `.js`/`.wasm` are GPLv3. Shipping the worker in a web app = distributing GPL code: keep the license header in the copied `.js` (it is in the file banner), and keep `Copying.txt` alongside in `public/stockfish/`. | `Copying.txt`, `README.md`, file banners |
| `main` | `index.js` — a **Node-only** loader (uses `require("fs")`). Do not import `stockfish` from client code. | `index.js` |
| `bin` (CLI) | `scripts/cli.js` → runs `bin/stockfish.js` as a UCI REPL on stdin/stdout | `scripts/cli.js` |
| Published files | `bin/` only (+ `scripts/postinstall.js`). There is **no `src/`** in the npm tarball. | `package.json#files`, `ls` |
| postinstall | creates symlinks `bin/stockfish.js -> stockfish-18.js` and `bin/stockfish.wasm -> stockfish-18.wasm` (the **full multi-threaded** build) | `scripts/postinstall.js` |
| Dependencies | none | `package.json` |

## 2. Shipped build variants (measured)

`ls -la` + `gzip -9 -c f | wc -c` on `node_modules/stockfish/bin/`:

| Variant | Files | Raw | gzip -9 | Threads | Needs SharedArrayBuffer / COOP+COEP? | Notes |
|---|---|---|---|---|---|---|
| Full, multi-threaded | `stockfish-18.js` + `stockfish-18.wasm` | 32.8 KB + **113.0 MB** | 12.1 KB + **75.8 MB** | yes (`Threads` option, pthread pool = `navigator.hardwareConcurrency`) | **YES** — wasm *imports* a `shared: true` memory; JS throws `"bad memory"` if `SharedArrayBuffer` is unavailable | Strongest. Spawns pthread workers by re-loading the same `.js` URL with `#<wasm>,worker` hash. |
| Full, single-threaded | `stockfish-18-single.js` + `stockfish-18-single.wasm` | 21.3 KB + 113.0 MB | 8.2 KB + 76.5 MB | no (`Threads` max 1) | No (non-shared memory, ASYNCIFY build) | Nets: `EvalFile nn-c288c895ea92.nnue` + `EvalFileSmall nn-37f18f62d772.nnue` (verified via `uci`). |
| Lite, multi-threaded | `stockfish-18-lite.js` + `stockfish-18-lite.wasm` | 32.9 KB + 7.09 MB | 12.1 KB + **5.59 MB** | yes | **YES** (shared memory import) | Small net only. |
| **Lite, single-threaded** | `stockfish-18-lite-single.js` + `stockfish-18-lite-single.wasm` | 21.4 KB + 7.30 MB | 8.3 KB + **5.64 MB** | no | **No** — wasm *defines* its own non-shared memory (`flags=1, shared=false, min=2048 pages, max=32768 pages`) | README's recommended default. Net: `nn-9067e33176e8.nnue` (11 MiB uncompressed in-memory, embedded). |
| asm.js fallback | `stockfish-18-asm.js` (no wasm) | 10.5 MB | 6.59 MB | no | No | "Very slow and weak … last resort" (README). Larger gzipped than lite wasm — not worth shipping. |

Verification of the SAB requirement: parsed the wasm import/memory sections with a small Node script — `stockfish-18-lite.wasm` has `memImport {mod:"a", fld:"a", shared:true}`, `stockfish-18-lite-single.wasm` has `memDef {shared:false}`. `stockfish-18-lite.js` contains `new WebAssembly.Memory({initial:…, maximum:32768, shared:!0})` and throws `Error("bad memory")` when the buffer is not a `SharedArrayBuffer`; `stockfish-18-lite-single.js` contains no `SharedArrayBuffer` reference at all. In the browser test page `crossOriginIsolated === false` and `typeof SharedArrayBuffer === "undefined"`, and the lite-single worker still searched to depth 10 in ~350 ms.

Compile flags (upstream `src/emscripten/wasm-makefile.mk`, fetched from GitHub master — matches the observed exports): all wasm flavours use `-msimd128` (**WASM SIMD required**; asm.js build excluded); single-threaded flavours add `-s ASYNCIFY=1 -s ASYNCIFY_STACK_SIZE=10485760 -s USE_PTHREADS=0`; multi-threaded use `-s USE_PTHREADS=1 -s PROXY_TO_PTHREAD`; all use `-s ALLOW_MEMORY_GROWTH=1 -s INITIAL_MEMORY=134217728 -s MAXIMUM_MEMORY=2147483648`, `-s MODULARIZE=1 -s EXPORT_NAME="Stockfish"`, `-s ENVIRONMENT=web,worker,node`, `EXPORTED_FUNCTIONS=['_main','_command','_isSearching']` (+`_isReady` on MT), `EXPORTED_RUNTIME_METHODS=ccall`.

Consequences:
- **Each engine instance reserves 128 MB of WASM memory up-front** (2048 × 64 KiB pages), growable to 2 GB. Create one worker per page, lazily, and `terminate()` it when leaving AI mode.
- Browser support = WASM SIMD: README says Chrome/Edge/Firefox/Opera/Safari on Windows 10+/macOS 11+/iOS 16+/Linux/Android (exact Safari minor not verified — see §10).

### 2.1 The <2 MB gzipped budget (NFR-3) is NOT achievable with this package

The smallest WASM this package ships is **5.64 MB gzipped** (lite-single). Nothing in the tarball is under 2 MB. Options, in order of preference:

1. **Ship lite-single (~5.65 MB gz incl. JS), lazy-loaded only in AI mode, with a download progress bar** (the wrapper has a built-in progress channel, §4.3) and long-lived immutable caching (§3.3). Raise NFR-3 to "≤ 6 MB gzipped, lazy, cached". This is what the README recommends and what Chess.com ships.
2. Build an `ULTRA_LITE_NET=yes` flavour yourself — upstream `build.js` has that switch, but **no ultra-lite artifact is published in the npm package** and building needs emscripten 3.1.7 (README). Size unknown (§10).
3. Use a different engine package with a smaller net — out of scope here.

The engine also needs the (non-cacheable-by-us) 128 MB memory reservation regardless of net size.

## 3. Serving the lite-single build from Next.js

### 3.1 Copy the files

```bash
mkdir -p public/stockfish
cp node_modules/stockfish/bin/stockfish-18-lite-single.js  public/stockfish/
cp node_modules/stockfish/bin/stockfish-18-lite-single.wasm public/stockfish/
cp node_modules/stockfish/Copying.txt public/stockfish/LICENSE-GPL-3.0.txt   # license compliance
```

Add a `postinstall`/`prebuild` script (`scripts/copy-stockfish.mjs`) that does the copy so the 7 MB binary does not have to be committed (or commit it — it is versioned by filename). Filenames must keep the `stockfish-18-lite-single` basename (see 3.2).

### 3.2 How the `.js` finds its `.wasm` (verified from the minified source of `stockfish-18-lite-single.js`)

When the script runs inside a Web Worker it executes this glue (de-minified):

```js
// worker branch: `typeof onmessage !== "undefined" && (typeof window === "undefined" || window.document === undefined)`
e = self.location.hash.substr(1).split(",");
u = decodeURIComponent(e[0] || location.origin + location.pathname.replace(/\.js$/i, ".wasm"));
c = {
  locateFile: (p) => p.indexOf(".wasm") > -1
      ? (p.indexOf(".wasm.map") > -1 ? u + ".map" : u)
      : self.location.origin + self.location.pathname + "#" + u + ",worker",
  listener: (line) => postMessage(line),
  instantiateWasm: (imports, done) => fetchWithProgress(u).then(r => WebAssembly.instantiateStreaming(r, imports)) …
};
onmessage = onmessage || function (e) { /* see §4 */ };
```

So:
- **Default**: the wasm URL is the worker script URL with `.js` → `.wasm`, same directory. `new Worker("/stockfish/stockfish-18-lite-single.js")` fetches `/stockfish/stockfish-18-lite-single.wasm`. No `locateFile` config is needed or possible from outside.
- **Override**: pass the wasm URL in the hash: `new Worker("/stockfish/stockfish-18-lite-single.js#" + encodeURIComponent("https://cdn.example.com/sf/stockfish-18-lite-single.wasm"))` (first comma-separated hash field; it is `decodeURIComponent`-ed). Cross-origin wasm then needs CORS on the CDN.
- The wasm is fetched with `fetch(url)` and `WebAssembly.instantiateStreaming(response)`; the custom `instantiateWasm` has **no ArrayBuffer fallback** (`catch(e){console.error("WASM streaming failed:",e);throw e}`), so the server **must send `Content-Type: application/wasm`**. Python's static server did (and Next/Vercel use standard mime tables — see §10 to confirm on first run). Do not put the wasm behind a route that rewrites content-type.
- It must be a **classic same-origin Worker** loaded by URL string. Do **not** use `new Worker(new URL("./x.js", import.meta.url))` (Turbopack/webpack would try to bundle a 21 KB UMD file that uses `self.location`, `importScripts` detection and `require` probes) and do not `import` it. Keep it in `/public`.
- `self.location.hash` must not carry `,worker` as its 2nd field — that is the internal marker for pthread sub-workers of the MT build; with it the script does nothing.

### 3.3 next.config.ts additions

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  async headers() {
    return [
      {
        // filenames are version-stamped (stockfish-18-…), safe to cache forever
        source: "/stockfish/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};
export default nextConfig;
```

`headers` is a valid `NextConfig` key in 16.3.4 (`node_modules/next/dist/server/config-shared.d.ts:1238`). **Do not add COOP/COEP** — not needed for lite-single, and `Cross-Origin-Embedder-Policy: require-corp` would break Clerk/Convex/HDRI cross-origin loads.

## 4. Worker message API (verified from source + live browser run)

- **Input**: `worker.postMessage("<uci command string>")`. One command per message. Whitespace is trimmed.
- **Output**: every engine stdout/stderr line arrives as `worker.onmessage = (e) => e.data` where `e.data` is a **plain string** (`listener: (line) => postMessage(line)`; `Module.print`/`printErr` both route to `listener`).
- First line emitted (before you send anything): `Stockfish 18 Lite WASM by the Stockfish developers (see AUTHORS file)`.
- **No custom handshake**: standard UCI. Commands posted before the wasm has finished instantiating are buffered in an array and replayed in order once ready, so you can `postMessage("uci")` immediately after `new Worker(...)`.
- **Internal queueing** (function `i`/`a` in the glue): commands starting with `go` or `setoption` are queued and only forwarded when `Module._isSearching()` is false (flushed via `onDoneSearching`). All other commands (`stop`, `isready`, `position`, `ucinewgame`, `uci`, `quit`) are forwarded immediately via `ccall("command", null, ["string"], [cmd], {async: /^go\b/})`. Practical rule: **never send `position`/`go` for a new request while a search is running — send `stop`, await `bestmove`, then continue.**
- `postMessage("quit")` → the glue calls `self.close()` (worker ends). Prefer `worker.terminate()` from the main thread (upstream `examples/loadEngine.js` does this).
- Special messages:
  - `postMessage("setoption name CanOutputEngineDownloadProgress")` → engine replies `"info WillOutputEngineDownloadProgress"` (capability probe).
  - `postMessage({ progressPort: port2 }, [port2])` with a `MessageChannel` → `port1.onmessage` receives download-progress objects `{percent, loaded, total, speedBytesPerSec, speedText, eta, etaText}` (throttled ~4 ms; port auto-closes at 100 %). Verified in browser: `{"percent":1,"loaded":7295411,"total":7295411,…}`.
- Errors: `worker.onerror` for load failures (e.g. wrong MIME → `"WASM streaming failed:"` in console then rethrow).

### 4.1 Observed startup timings
Node (files on disk): lite-single ready in ~90 ms, full-single ~250 ms. Browser (localhost, cached): `uci`→`uciok`+`go depth 10` MultiPV 2 finished 353 ms after worker creation. Cold download of 5.6 MB dominates on first visit.

## 5. UCI protocol sequence to implement (all outputs below are verbatim from the lite-single engine)

```
> uci
< id name Stockfish 18 Lite WASM
< id author the Stockfish developers (see AUTHORS file)
< option name Threads type spin default 1 min 1 max 1
< option name Hash type spin default 16 min 1 max 33554432
< option name Clear Hash type button
< option name Ponder type check default false
< option name MultiPV type spin default 1 min 1 max 256
< option name Skill Level type spin default 20 min 0 max 20
< option name Move Overhead type spin default 10 min 0 max 5000
< option name nodestime type spin default 0 min 0 max 10000
< option name UCI_Chess960 type check default false
< option name UCI_LimitStrength type check default false
< option name UCI_Elo type spin default 1320 min 1320 max 3190
< option name UCI_ShowWDL type check default false
< option name EvalFile type string default nn-9067e33176e8.nnue
< option name EvalFileSmall type string default <empty>
< uciok
> isready
< readyok
> ucinewgame                      // call at the start of every new game (clears hash/history)
> setoption name MultiPV value 3   // 1..256
> setoption name Skill Level value 5   // 0..20 (20 = full strength)
> isready                         // re-sync after setoptions
< readyok
> position startpos moves e2e4 e7e5
      // or: position fen <FEN> [moves <uci> ...]  (moves are long algebraic: e2e4, e7e8q)
> go depth 8                      // or: go movetime 1500 | go nodes N | go infinite (+ stop) | go wtime W btime B winc I binc I
< info string NNUE evaluation using nn-9067e33176e8.nnue (11MiB, (22528, 256, 15, 32, 1))
< info string Network replica 1: Local memory. Shared memory not supported by the OS. Local allocation fallback.
< info depth 8 seldepth 12 multipv 1 score cp 43 nodes 21336 nps 1066800 hashfull 4 time 20 pv g1f3 d7d5 f3e5 ...
< info depth 8 seldepth 14 multipv 2 score cp 34 nodes 21336 nps 1066800 hashfull 4 time 20 pv d2d4 d7d5 ...
< info depth 8 seldepth 11 multipv 3 score cp 18 nodes 21336 nps 1066800 hashfull 4 time 20 pv f1c4 b8c6 ...
< bestmove b1c3 ponder b8c6
> stop                            // during a `go movetime 5000`, bestmove arrived 51 ms later (verified)
< bestmove d2d4 ponder e5d4
```

Parsing notes (verified against captured output):
- `info` lines to parse have the shape `info depth D seldepth S multipv M score (cp X | mate Y) [lowerbound|upperbound] nodes N nps P hashfull H time T pv m1 m2 …`. When `MultiPV` is 1 the `multipv 1` token is still present.
- Skip lines containing ` lowerbound` / ` upperbound` (fail-high/low partial results; a `score cp 34 upperbound … pv d2d4 e5d4` line was observed) and `info string …` lines.
- `score cp` is centipawns **from the side to move's perspective** (after `position startpos moves e2e4`, Black to move, all lines were negative: `cp -10 … -42`). Negate for a White-relative eval when Black is to move. `score mate N`: N>0 side-to-move mates in N moves, N<0 gets mated.
- `bestmove <uci> [ponder <uci>]`; `bestmove (none)` when no legal move (mate/stalemate) — guard with chess.js before calling the engine anyway.
- Only the **last** `info … multipv M` line per M (highest depth) matters; keep a `Map<multipv, line>` and overwrite.
- `mate` and `cp` never appear together; `wdl` appears only with `setoption name UCI_ShowWDL value true` (not needed).
- Sending `setoption` between games is fine; `setoption name Clear Hash value true` exists if needed.

## 6. Skill Level / UCI_Elo semantics (Stockfish 18 source, `src/search.h` + `src/search.cpp` at tag `sf_18`)

```cpp
struct Skill {
    constexpr static int LowestElo  = 1320;
    constexpr static int HighestElo = 3190;
    Skill(int skill_level, int uci_elo) {
        if (uci_elo) { double e = double(uci_elo - LowestElo) / (HighestElo - LowestElo);
                       level = std::clamp((((37.2473*e - 40.8525)*e + 22.2943)*e - 0.311438), 0.0, 19.0); }
        else level = double(skill_level);
    }
    bool enabled() const { return level < 20.0; }
    bool time_to_pick(Depth depth) const { return depth == 1 + int(level); }
    …
};
// search.cpp: Skill(options["Skill Level"], options["UCI_LimitStrength"] ? int(options["UCI_Elo"]) : 0);
// search.cpp:307  if (skill.enabled()) multiPV = std::max(multiPV, size_t(4));
// search.cpp:474  if (skill.enabled() && skill.time_to_pick(rootDepth)) skill.pick_best(rootMoves, multiPV);
// search.cpp:540  if (skill.enabled()) std::swap(rootMoves[0], *find(... skill.best ? skill.best : skill.pick_best(...)));
```

Implications for the difficulty table (Beginner 1/2, Casual 5/6, Intermediate 10/10, Advanced 15/14, Grandmaster 20/18):
- `Skill Level 20` = full strength. Any value < 20 turns on handicap mode: the engine **internally searches with MultiPV ≥ 4** and, at iteration depth `1 + level` (or at the end of the search if that depth was never reached), **picks a randomised sub-optimal move** (`pick_best`, PRNG seeded with `now()` → non-deterministic). `weakness = 120 - 2*level`.
- **`bestmove` can therefore differ from `multipv 1`'s first pv move** when Skill Level < 20. The `info … multipv` lines still report the true ranking. For Eve's `analysePosition` (needs honest top-N candidates), run with `Skill Level 20` and `MultiPV N` and apply the selection policy in JS. Use `Skill Level` only when you want Stockfish itself to play the weakened move (e.g. the 10-second fallback move).
- `UCI_LimitStrength true` + `UCI_Elo` (1320..3190) **overrides** `Skill Level` (mapped to a fractional level 0..19). Either mechanism, not both. The requirements use Skill Level; keep it.
- Depth interacts: with Beginner `Skill Level 1` and `go depth 2`, `time_to_pick` fires at depth 2 — fine. With `go depth 18` and `Skill Level 15` it fires at depth 16.
- Because of the forced MultiPV ≥ 4 and the ASYNCIFY single thread, keep an eye on FR-38 (< 3 s): depth 18 at Grandmaster on a phone may exceed it — prefer `go depth 18` **with a client-side timeout that sends `stop`** (bestmove then arrives within ~50 ms) or `go movetime 2500`.

## 7. Minimal TypeScript wrapper (browser) — verified API surface only

```ts
// src/lib/engine/stockfish-client.ts  ('use client' consumers only; never import on the server)
export type PvLine = { multipv: number; depth: number; scoreCp?: number; scoreMate?: number; pv: string[] };
export type SearchResult = { bestmove: string; ponder?: string; lines: PvLine[] };

const INFO_RE = /^info depth (\d+) seldepth \d+ multipv (\d+) score (cp|mate) (-?\d+)( lowerbound| upperbound)? .*? pv (.+)$/;

export class StockfishClient {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private queue: Promise<unknown> = Promise.resolve(); // serialise searches
  private lineHandlers = new Set<(l: string) => void>();

  constructor(private url = "/stockfish/stockfish-18-lite-single.js") {}

  /** Lazily start the worker and complete `uci` -> `uciok`, `isready` -> `readyok`. */
  init(onProgress?: (p: { percent: number; loaded: number; total: number }) => void): Promise<void> {
    if (this.ready) return this.ready;
    const w = new Worker(this.url);           // classic worker, same origin, .wasm resolved as sibling
    this.worker = w;
    w.onmessage = (e: MessageEvent<string>) => { for (const h of this.lineHandlers) h(String(e.data)); };
    if (onProgress) {
      const ch = new MessageChannel();
      ch.port1.onmessage = (e) => onProgress(e.data);
      w.postMessage({ progressPort: ch.port2 }, [ch.port2]);
    }
    this.ready = (async () => {
      await this.expect("uciok", () => this.send("uci"));
      await this.expect("readyok", () => this.send("isready"));
    })();
    return this.ready;
  }

  send(cmd: string) { this.worker!.postMessage(cmd); }

  private expect(token: string, run: () => void, timeoutMs = 15000): Promise<string> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { off(); reject(new Error(`stockfish: timeout waiting for ${token}`)); }, timeoutMs);
      const h = (l: string) => { if (l === token || l.startsWith(token + " ")) { clearTimeout(t); off(); resolve(l); } };
      const off = () => this.lineHandlers.delete(h);
      this.lineHandlers.add(h); run();
    });
  }

  async newGame(opts: { skillLevel: number; multiPv: number }) {
    await this.init();
    this.send("ucinewgame");
    this.send(`setoption name Skill Level value ${Math.max(0, Math.min(20, opts.skillLevel))}`);
    this.send(`setoption name MultiPV value ${Math.max(1, Math.min(256, opts.multiPv))}`);
    await this.expect("readyok", () => this.send("isready"));
  }

  /** One search at a time; `position fen …` then `go depth N`, resolved on `bestmove`. */
  search(fen: string, go: { depth?: number; movetime?: number }, hardTimeoutMs = 3000): Promise<SearchResult> {
    const run = async () => {
      await this.init();
      const lines = new Map<number, PvLine>();
      const collect = (l: string) => {
        const m = INFO_RE.exec(l);
        if (!m || m[5]) return;                 // skip bound lines
        const line: PvLine = { depth: +m[1], multipv: +m[2], pv: m[6].split(" ") };
        if (m[3] === "cp") line.scoreCp = +m[4]; else line.scoreMate = +m[4];
        lines.set(line.multipv, line);
      };
      this.lineHandlers.add(collect);
      const stopTimer = setTimeout(() => this.send("stop"), hardTimeoutMs); // FR-38 guard
      try {
        this.send(`position fen ${fen}`);
        const bm = await this.expect("bestmove", () =>
          this.send(go.movetime ? `go movetime ${go.movetime}` : `go depth ${go.depth ?? 10}`), hardTimeoutMs + 5000);
        const [, bestmove, , ponder] = bm.split(" ");
        return { bestmove, ponder, lines: [...lines.values()].sort((a, b) => a.multipv - b.multipv) };
      } finally { clearTimeout(stopTimer); this.lineHandlers.delete(collect); }
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }

  stop() { this.send("stop"); }
  dispose() { this.worker?.terminate(); this.worker = null; this.ready = null; }
}
```

Notes: `bestmove` is UCI long algebraic (`e7e8q` for promotions) — convert with `chess.js` `move({from, to, promotion})` to SAN. Scores are side-to-move relative (§5). Wrap in a `useEffect`/zustand store so the worker is created once per AI game and `dispose()`d on unmount.

### 7.1 Difficulty mapping (from requirements §3.8, mapped onto verified option ranges)

| Level | `setoption name Skill Level` | `go depth` | Suggested `MultiPV` for Eve candidates |
|---|---|---|---|
| Beginner | 1 | 2 | 5 |
| Casual | 5 | 6 | 3 |
| Intermediate | 10 | 10 | 2 |
| Advanced | 15 | 14 | 1 |
| Grandmaster | 20 | 18 | 1 |

Per §6, for the candidate list sent to Eve use `Skill Level 20` + `MultiPV N`; use the row's Skill Level only for the raw-Stockfish fallback move.

## 8. Running in Node (server-side Eve tool) — verified

### 8.1 Official loader (`require("stockfish")`)
```js
const initEngine = require("stockfish");          // index.js, CommonJS, Node only
const engine = await initEngine("lite-single");   // keywords: "full" | "lite" | "single" | "lite-single" | "asm" | <absolute/relative path to a .js>; default = bin/stockfish.js (FULL MT build!)
engine.listener = (line) => { /* every output line, string */ };
engine.sendCommand("uci");                        // schedules ccall("command") via setImmediate; `go …` is ccall'd async
```
Verified sequence in Node 24.14.1: `uci`→`uciok`, `isready`→`readyok`, `setoption`, `position`, `go depth 8` (MultiPV 3) → `bestmove` in 20 ms; `go movetime 5000` + `stop` after 400 ms → `bestmove` in 451 ms; `UCI_LimitStrength`/`UCI_Elo 1320` accepted. `initEngine(path, cb)` callback form also exists. `engine` is the raw Emscripten `Module` (has `ccall`, `terminate`, etc.).

Caveats:
- `engine.sendCommand` does **no** go/setoption queueing (unlike the worker glue) — serialise searches yourself (await `bestmove` before the next `position`/`go`).
- Without a keyword, `initEngine()` loads the **full multi-threaded** build (113 MB wasm, `readFileSync` into memory, needs SAB/worker_threads). Always pass `"lite-single"` (or `"single"`).
- `index.js` also concatenates `*-part-*.wasm` chunks if present (not applicable to 18.0.8).
- **Cannot be used inside a Node `worker_threads` Worker**: the engine `.js` glue checks `!require("worker_threads").isMainThread` and then skips *all* setup, leaving `module.exports = {}` — `index.js` then throws `"Could not load the engine correctly."`. Verified by running a `worker_threads` test (`typeof module.exports === "object", keys: []`). Use the main thread, or spawn a **child process** running the CLI:
  `spawn(process.execPath, [require.resolve("stockfish/bin/stockfish-18-lite-single.js")])` — when the file is the entry module (`require.main === module`) it becomes a stdin/stdout UCI REPL (readline; `quit` exits). `npx stockfish` does the same for the full build.
- Each instance reserves 128 MB wasm memory; single-threaded; a search is CPU-bound on the event loop thread (ASYNCIFY yields, but expect the function to be busy). On a Vercel Node function this fits the memory default but adds ~100 ms cold init + module load.
- Bundling on Vercel/Next: `index.js` `require()`s the engine path dynamically, so Next's tracer will not pick the binaries up automatically. Add to `next.config.ts`:
  ```ts
  serverExternalPackages: ["stockfish"],
  outputFileTracingIncludes: { "/api/**": ["./node_modules/stockfish/bin/stockfish-18-lite-single.{js,wasm}"] },
  outputFileTracingExcludes: { "*": ["./node_modules/stockfish/bin/stockfish-18.wasm", "./node_modules/stockfish/bin/stockfish-18-single.wasm", "./node_modules/stockfish/bin/stockfish-18-asm.js", "./node_modules/stockfish/bin/stockfish.wasm"] },
  ```
  (keys verified in `config-shared.d.ts` lines 1588/1598/1603; adjust the route glob to the actual Eve route.) The 113 MB full builds must be excluded or the function bundle balloons (and the postinstall `stockfish.wasm` symlink points at the full build).
- Recommendation (matches FR-35 note and risk register): **compute candidates in the browser worker and pass them to Eve as tool input/context**; keep the Node engine only as an optional fallback. It avoids the tracing/size work, the 128 MB per-invocation memory, and duplicate NNUE downloads.

## 9. Gotchas checklist

1. `Threads` is `min 1 max 1` on single-threaded builds; don't send `setoption name Threads` (harmless, but pointless).
2. `Hash` default 16 MB; raising it increases the already-large memory footprint. Leave at 16.
3. Skill Level < 20 forces internal MultiPV ≥ 4 and randomises `bestmove` (§6). Skill Level 0 is the weakest legal value; requirements start at 1.
4. Send `ucinewgame` + `isready` at game start (verified accepted; clears TT so evals do not leak between games).
5. Do not reuse one worker for concurrent searches; queue them (wrapper above) or create a second worker (costs another 128 MB).
6. `quit` closes the worker (`self.close()`); after that `postMessage` is silently dropped — use `terminate()` + re-`init()`.
7. Postmessage payloads must be strings except the two special objects (`{progressPort}`); anything else is passed to `processCommand` and fails.
8. Load only in the AI-mode client component (`"use client"`), guarded by `typeof Worker !== "undefined"`; SSR must not touch it.
9. If the app is ever cross-origin-isolated later (COOP/COEP), the lite-single build keeps working; only then consider `stockfish-18-lite.js` for `Threads`.
10. The full builds' `EvalFile`/`EvalFileSmall` are embedded — there is no separate `.nnue` download for any flavour.

## 10. Unverified / open questions

- **Official Stockfish UCI wiki page** (`github.com/official-stockfish/Stockfish/wiki/UCI-&-Commands`) could not be fetched (JS-rendered / 404 on raw mirrors). Option ranges above were verified directly from the engine's `uci` output and the `sf_18` source (`engine.cpp`, `search.h`, `search.cpp`); the "score is side-to-move relative" rule was confirmed empirically (negative scores with Black to move) and via `uci.cpp:format_score`, not from prose docs.
- **Exact minimum Safari/iOS version**: the build uses `-msimd128`, so WASM SIMD is required; README claims iOS 16+/macOS 11+. Not tested on Safari here.
- ~~**Next.js dev/prod … serving `.wasm` from `/public` with `Content-Type: application/wasm`**~~ **RESOLVED for local dev and prod.** Verified empirically in this repo: both `next dev` and `next build && next start` (Next 16.3.4) return `Content-Type: application/wasm` for `/stockfish/stockfish-18-lite-single.wasm`, so `instantiateStreaming` works and the missing fallback is a non-issue. A live Chrome tab reached `uciok` in **103-108 ms (dev)** / **274-346 ms (prod, cold 7.3 MB fetch)** and answered `go depth 8` with `bestmove e2e4 ponder e7e6`, with `crossOriginIsolated === false` and no `SharedArrayBuffer`. The `headers()` cache rule of §3.3 was also verified to apply in dev and prod. **Still unverified: Vercel's CDN** - re-check with `curl -I` on the first preview deploy. Also newly confirmed: `new Worker(new URL(...))` under Turbopack appends a `#params=[...]` fragment carrying the chunk list, which collides head-on with the glue's hash-based wasm-path override - another concrete reason to keep the classic `/public` worker. See `docs/research/nextjs16-shadcn.md` → "Verified build smoke test" §4b and §6.
- **`ULTRA_LITE_NET` build**: upstream `build.js` supports it, but no artifact is in the npm package; size/strength unknown. Requires emscripten 3.1.7 to build.
- **Vercel function bundle limits** with the 7.3 MB wasm included (should be well under the 250 MB unzipped limit) — not measured.
- Full multi-threaded build (`stockfish-18.js`) was not executed in Node (needs `worker_threads` + SAB; the postinstall default symlink points at it). Only `lite-single` and `single` were executed.
- `go movetime` accuracy under ASYNCIFY in the browser on low-end mobiles (FR-38 < 3 s) — measured only on this Mac (depth 10, MultiPV 2: ~110 ms of search).

---

# 11. NFR-3 gap study: is there ANY npm Stockfish WASM under 2 MB gzipped?

*Added in a follow-up research pass. Everything in this section was verified by actually
downloading the registry tarball (`npm pack <pkg>@<version> --pack-destination …`), extracting it,
measuring with `gzip -9 -c <file> | wc -c` (and `zlib.brotliCompressSync` at quality 11), parsing the
wasm binary's import/memory/type/code sections with a hand-written Node parser, and — for the
shortlist — **running the engine** (Node, and a real Chromium page served over HTTP on a
non-cross-origin-isolated origin).*

**Answer: yes. Two builds clear 2 MB gzipped and support `Skill Level` + `MultiPV`.**
The recommended one (`stockfish@11.0.0`) is **669 KB gzipped / 533 KB brotli** and was verified
end-to-end in a browser with `crossOriginIsolated === false` and `typeof SharedArrayBuffer === "undefined"`.

## 11.1 Measured candidate table

Sizes are the bytes actually needed at runtime (glue `.js` + `.wasm` + external net where applicable).
"SAB?" = does the module require `SharedArrayBuffer` (i.e. COOP+COEP cross-origin isolation)?
Determined by parsing the wasm import/memory section: a `shared: true` **imported** memory ⇒ yes.

| Package @ version | Runtime files | Raw | gzip -9 | brotli q11 | SAB / COOP+COEP? | WASM SIMD? | Eval | `Skill Level` | `MultiPV` | License |
|---|---|---|---|---|---|---|---|---|---|---|
| **`stockfish@11.0.0`** (nmrugg) | `src/stockfish.js` + `src/stockfish.wasm` | 3.74 MB | **669 KB** | **533 KB** | **No** (`env.memory` imported, `shared:false`, min=max=1024 pages = 64 MB fixed) | **No** (0 v128 locals) | SF11 classical (HCE) | ✅ 0–20 | ✅ 1–500 | GPL-3.0 |
| `stockfish@10.0.2` (nmrugg) | `src/stockfish.js` + `src/stockfish.wasm` | 429 KB | **137 KB** | **110 KB** | **No** (same, 64 MB fixed) | No | SF10 classical | ✅ 0–20 | ✅ 1–500 | GPL-3.0 |
| `stockfish.js@10.0.2` (lichess-org / niklasf) | `stockfish.wasm.js` + `stockfish.wasm` | 655 KB | **192 KB** | **148 KB** | **No** (`env.memory`, `shared:false`, min=max=512 pages = 32 MB) | No | SF10 multi-variant (ddugovic) | ✅ 0–20 | ✅ 1–500 | GPL-3.0 |
| `stockfish.js@10.0.2` pure-JS fallback | `stockfish.js` (asm.js) | 1.58 MB | 328 KB | — | No | n/a | SF10 multi-variant | ✅ | ✅ | GPL-3.0 |
| `stockfish.js@9.0.0` | `stockfish.wasm.js` + `stockfish.wasm` | 664 KB | 190 KB | — | No | No | SF9 multi-variant | (not run) | (not run) | GPL-3.0 |
| **`@lichess-org/stockfish-web@0.5.0` `sf_19_smallnet`** | `sf_19_smallnet.js` + `.wasm` + external `nn-61e7af4bb97d.nnue` | 1.71 MB | **1.13 MB** | **1.05 MB** | **YES** (`a.a` imported, `shared:true`, min 1024 max 32768 pages) | Yes (20 fns w/ v128) | **SF19 NNUE (small net)** | ✅ 0–20 | ✅ 1–256 | AGPL-3.0-or-later |
| `@lichess-org/stockfish-web@0.5.0` `sf_19` (big net) | `.js` + `.wasm` + `nn-1a298aa575a0.nnue` | ~79 MB | ~79 MB | — | YES | Yes | SF19 NNUE big | ✅ | ✅ | AGPL-3.0 |
| `lila-stockfish-web@0.0.11` `sf16-7` | `sf16-7.js` + `.wasm` + `nn-ecb35f70ff2a.nnue` | 7.0 MB | 5.44 MB | — | YES | Yes | SF16 linrock | ✅ | ✅ | AGPL-3.0 |
| `lila-stockfish-web@0.0.11` `sf171-79` | `.js` + `.wasm` + `nn-1c0000000000` + `nn-37f18f62d772` | huge | > 2 MB | — | YES | Yes | SF17.1 dual-net | ✅ | ✅ | AGPL-3.0 |
| `stockfish.wasm@0.10.0` (niklasf) | `stockfish.js` + `.wasm` + `stockfish.worker.js` | 381 KB | 140 KB | — | **YES** (`a.a` shared, max 32768) | No | SF_classical | ✅ | ✅ | GPL-3.0 |
| `stockfish-mv.wasm@0.6.1` | same 3 files | 587 KB | 184 KB | — | **YES** | No | SF_classical multi-variant | ✅ | ✅ | GPL-3.0 |
| `stockfish@12.0.0` (nmrugg) | `src/stockfish.js` + `.wasm` (+ 21 MB net) | 21.5 MB | > 2 MB | — | **YES** (shared, min=max=16384 pages = **1 GB**) | — | SF12 NNUE | ✅ | ✅ | GPL-3.0 |
| `stockfish@14.1.0 / 15.0.0 / 16.0.0` | `.js` + `.wasm` + `.nnue` | 40–47 MB | ≫ 2 MB | — | (n/a) | Yes | NNUE, net is a **separate 40–47 MB file** | ✅ | ✅ | GPL-3.0 |
| `stockfish@17.1.0` | lite-single 7.3 MB wasm; full = 6 × 13 MB parts | 7.3–79 MB | ≫ 2 MB | — | lite-single: No | Yes | NNUE embedded | ✅ | ✅ | GPL-3.0 |
| **`stockfish@18.0.8` lite-single (currently installed)** | `stockfish-18-lite-single.js` + `.wasm` | 7.32 MB | **5.64 MB** | — | No | Yes | SF18 NNUE small net (embedded) | ✅ | ✅ | GPL-3.0 |
| `stockfish-nnue.wasm@1.0.0-alpha.…smolnet` | `stockfish.js` + `stockfish.wasm` | 12.9 MB | 7.16 MB | — | YES | Yes | SF14 NNUE | ✅ | ✅ | GPL-3.0 |
| `fairy-stockfish-nnue.wasm@1.1.12` | `stockfish.js` + `.wasm` (+ external nets) | 1.70 MB | 512 KB | — | **YES** | Yes | Fairy-SF14 | ✅ | ✅ | GPL-3.0 |
| `@se-oss/stockfish@1.0.1` | `stockfish-17.1-8e4d048.wasm` | 78.9 MB | 64.8 MB | — | YES | Yes | SF17.1 big net | ✅ | ✅ | (see pkg) |
| `chess-study-stockfish@0.1.0` | *(no engine bytes — it is a vendoring script for `stockfish@18` + a max-pages byte-patch)* | — | — | — | — | — | — | — | — | AGPL |

Notes on the table:
- **`stockfish-16.1-lite` does not exist on npm** (`E404`). Neither does any published **`ULTRA_LITE_NET`** artifact — `stockfish@18.0.8/bin/` contains exactly 5 flavours (`-18`, `-18-single`, `-18-lite`, `-18-lite-single`, `-18-asm`) and nothing smaller (`ls` verified). `stockfish@17.1.0` (183 MB unpacked, file list read from `https://unpkg.com/stockfish@17.1.0/?meta`) has the same 5 flavours plus 6-part split wasms.
- **Every small NNUE build on npm requires `SharedArrayBuffer`.** Verified individually: `stockfish.wasm@0.10.0`, `stockfish-mv.wasm@0.6.1`, `lila-stockfish-web` (`sf16-7`, `sf171-79`, `fsf14`), `@lichess-org/stockfish-web@0.5.0` (all five targets), `stockfish-nnue.wasm`, `fairy-stockfish-nnue.wasm`, `@se-oss/stockfish`, `stockfish@12.0.0` — all import a `shared:true` memory. The *only* non-shared builds under 2 MB gz are the pre-NNUE (SF9/10/11 classical) ones.
- **NNUE net sizes** (`curl -sIL https://tests.stockfishchess.org/api/nn/<name>.nnue`, then downloaded and re-measured): `nn-61e7af4bb97d` (sf_19 smallnet) 1,166,381 raw / **966,992 br / 975,309 gz**; `nn-37f18f62d772` (SF17.1 small) 3,519,630 raw / 2,876,624 gz; `nn-ecb35f70ff2a` (sf16-7) 6,531,398 raw / 5,269,118 gz; `nn-1a298aa575a0` (sf_19 big) ~79 MB. NNUE weights barely compress (~83 % of raw).
- **SIMD detection method**: parsed every function body's local declarations and counted `v128` (`0x7B`) locals. `stockfish@10/@11` and `stockfish.js@10` → **0** v128 locals (no SIMD; works on pre-SIMD Safari/older Android). `stockfish-18-lite-single.wasm` → 13 functions / 39 v128 locals; `sf16-7.wasm` → 20 / 72. So the classical builds are *more* portable than the SF18 build the project currently plans to ship.

## 11.2 Live verification of `stockfish@11.0.0`

**Browser** (Chromium, page served by `python3 -m http.server`, plain `http://127.0.0.1`, **no** COOP/COEP):

```
crossOriginIsolated=false | typeof SharedArrayBuffer=undefined
uciok after 108 ms
id name Stockfish 11 WASM by T. Romstad, M. Costalba, J. Kiiski, G. Linscott, D. Dugovic, F. Fichter, N. Fiekas, Chess.com, et al.
option name Threads type spin default 1 min 1 max 1
option name MultiPV type spin default 1 min 1 max 500
option name Skill Level type spin default 20 min 0 max 20
info depth 13 seldepth 23 multipv 1 score cp -22 nodes 560401 nps 890939 time 629 pv e7e6 d2d4 …
info depth 13 seldepth 15 multipv 2 score cp -48 …
info depth 13 seldepth 19 multipv 3 score cp -50 …
bestmove e7e5 ponder g1f3
TOTAL 748 ms
```

Test page used exactly this (nothing else — no wrapper, no polyfill):

```js
const w = new Worker('/engine/stockfish.js');   // stockfish.wasm sits next to it
w.onmessage = (e) => { /* e.data is a plain UCI string */ };
w.postMessage('uci');
w.postMessage('setoption name MultiPV value 3');
w.postMessage('setoption name Skill Level value 5');
w.postMessage('position startpos moves e2e4');
w.postMessage('go depth 13');
```

**Full UCI option list** (verbatim from `uci`, Node run):

```
option name Debug Log File type string default
option name Contempt type spin default 24 min -100 max 100
option name Analysis Contempt type combo default Both var Both var Off var White var Black
option name Threads type spin default 1 min 1 max 1
option name Hash type spin default 16 min 16 max 16
option name Clear Hash type button
option name Ponder type check default false
option name MultiPV type spin default 1 min 1 max 500
option name Skill Level type spin default 20 min 0 max 20
option name Move Overhead type spin default 30 min 0 max 5000
option name Minimum Thinking Time type spin default 20 min 0 max 5000
option name Slow Mover type spin default 84 min 10 max 1000
option name nodestime type spin default 0 min 0 max 10000
option name UCI_Chess960 type check default false
option name UCI_Variant type combo default chess var chess
option name UCI_AnalyseMode type check default false
option name Skill Level Maximum Error type spin default 200 min 0 max 5000
option name Skill Level Probability type spin default 128 min 1 max 1000
```

**Behaviour checks** (Node 24.14.1, this Mac):

| Check | Result |
|---|---|
| `MultiPV 4` at `go depth 14` from startpos | 4 distinct `multipv 1..4` lines (`e2e4 / g1f3 / d2d4 / c2c4`), 375 ms, **2.39 M nps** |
| Same in Chromium worker, depth 13, MultiPV 3 | 748 ms total, **891 k nps** (browser is ~2.5× slower than Node here) |
| `go movetime 1000` | `bestmove` at **1012 ms** — time control honoured |
| `go infinite` + `stop` after 400 ms | `bestmove` at **579 ms** (~180 ms to react to `stop`) |
| `Skill Level 20`, 4 repeats of `go depth 8` | always `e2e4` (deterministic) |
| `Skill Level 3`, 4 repeats | `h2h4 / d2d4 / e2e4` (randomised — weakening works) |
| `Skill Level 0`, 4 repeats | `e2e3 / d2d4 / e2e4` |
| `setoption name UCI_LimitStrength value true` | ❌ engine replies **`No such option: UCI_LimitStrength`** |
| `setoption name UCI_Elo value 1500` | ❌ **`No such option: UCI_Elo`** |

⚠️ **Breaking difference vs `stockfish@18.0.8`:** SF11 has **no `UCI_LimitStrength` / `UCI_Elo`**. Difficulty must be driven by
`Skill Level` (0–20) + `go depth` alone — plus, if finer granularity is wanted, the ddugovic/chess.com extras
`Skill Level Maximum Error` (0–5000 cp, default 200) and `Skill Level Probability` (1–1000, default 128),
which control how far from best and how often the engine deliberately errs. `Threads` and `Hash` are hard-pinned
to 1 and 16 MB (min == max), so sending them is a no-op.

## 11.3 How the JS finds its `.wasm` (verified from the shipped minified glue + two live browser runs)

`src/stockfish.js` ends with:

```js
if (isNode) {
  if (require.main === module) { /* readline UCI REPL */ }
  else module.exports = STOCKFISH;                       // STOCKFISH(wasmPath) -> Module
} else if (typeof onmessage !== "undefined" && typeof window === "undefined") {
  stockfish = self.location.hash ? STOCKFISH(self.location.hash.substr(1)) : STOCKFISH();
  onmessage = (e) => stockfish.postMessage(e.data, true);
  stockfish.onmessage = (line) => postMessage(line);     // plain strings out
}
```

and resolution is `wasmBinaryFile = Module.wasmBinaryFile || locateFile("stockfish.wasm")`, where in a
Worker `scriptDirectory = self.location.href` truncated at the last `/`. Therefore:

- `new Worker('/stockfish/stockfish.js')` → fetches **`/stockfish/stockfish.wasm`** (same directory). ✅ verified.
- `new Worker('/stockfish/stockfish.js#/any/other/path/sf11.wasm')` → fetches the hash path. ✅ verified
  (separate test page: worker booted to `uciok` with the wasm renamed and moved to `/wasmdir/sf11.wasm`).
- `instantiateStreaming` is used but wrapped in a `.catch` that falls back to `instantiateArrayBuffer`,
  so a wrong `Content-Type` degrades gracefully instead of failing. (Python's `http.server` did serve
  `Content-Type: application/wasm`.)
- Node: `require('.../src/stockfish.js')` exports `STOCKFISH`; call `STOCKFISH(absolutePathToWasm)`.
  ⚠️ On Node ≥ 18 you must `delete globalThis.fetch` first, otherwise the 2020-era Emscripten glue takes
  the `typeof fetch === "function"` branch and dies with `TypeError: Failed to parse URL from /abs/path/stockfish.wasm`.
  (A browser Worker is unaffected.) Verified on Node 24.14.1.

## 11.4 Recommendation

### (a) Ship `stockfish@11.0.0` — NFR-3 is met, no deviation needed

**Files to copy to `public/stockfish/` (2 files, 3.74 MB raw / 669 KB gz / 533 KB br):**

| Source | Destination |
|---|---|
| `node_modules/stockfish11/src/stockfish.js` | `public/stockfish/stockfish.js` |
| `node_modules/stockfish11/src/stockfish.wasm` | `public/stockfish/stockfish.wasm` |
| `node_modules/stockfish11/license.txt` (GPL-3.0) | `public/stockfish/license.txt` |

Install it side-by-side with the existing dependency using an npm alias — **verified working with pnpm 11.24.0**:

```bash
pnpm add "stockfish11@npm:stockfish@11.0.0"
# -> package.json: "stockfish11": "npm:stockfish@11.0.0"
# -> node_modules/stockfish11/src/{stockfish.js,stockfish.wasm,stockfish.asm.js}
```

…or simply `pnpm remove stockfish` and commit the two files into `public/stockfish/` (that also removes
~490 MB from `node_modules`, since `stockfish@18.0.8/bin` alone is 490 MB on disk).

Loading is a one-liner and needs **no** `next.config.ts` changes, no COOP/COEP, no `outputFileTracing*` entries:

```ts
// AI-mode client component only, guarded by typeof Worker !== "undefined"
const w = new Worker("/stockfish/stockfish.js");
w.onmessage = (e: MessageEvent<string>) => handleUciLine(e.data);  // plain strings, no wrapper object
w.postMessage("uci");
```

Keep everything else from §5 (UCI sequence), §7 (wrapper) and §7.1 (difficulty table) — the message
API is *simpler* than SF18's (no `{progressPort}` object, no queueing glue, no `stockfish-18-lite-single.js`
path juggling), and the difficulty table works unchanged **except** that the `UCI_Elo` fallback mentioned
in §8/§9 is unavailable.

Why this over the currently-planned SF18 lite-single:

| | `stockfish@11.0.0` | `stockfish@18.0.8` lite-single |
|---|---|---|
| Transfer (gz) | **669 KB** | 5.64 MB (8.4× more) |
| NFR-3 (< 2 MB gz) | ✅ met | ❌ 2.8× over |
| Boot to `uciok` | **108 ms** (Chromium, cold) | ~350 ms+ (§4.1) |
| WASM memory reserved | **64 MB** fixed | **128 MB** growable to 2 GB |
| Requires WASM SIMD | **No** | Yes (excludes older Safari/Android) |
| Requires SAB / COOP+COEP | No | No |
| `Skill Level` / `MultiPV` | ✅ / ✅ | ✅ / ✅ |
| `UCI_Elo` / `UCI_LimitStrength` | ❌ | ✅ |
| Eval | SF11 handcrafted | SF18 NNUE (stronger, better cp scores) |

The only real loss is absolute playing strength and evaluation quality. For a game whose hardest
setting is "Grandmaster = Skill Level 20, depth 18", SF11 at ~0.9 M nps in the browser is already far
beyond any human opponent, and FR-38's "< 3 s per move" is comfortably met (depth 13 + MultiPV 3 in
748 ms measured in-browser).

### (b) If NNUE-quality evaluation is judged essential later

`@lichess-org/stockfish-web@0.5.0` → `sf_19_smallnet.js` + `sf_19_smallnet.wasm` + `nn-61e7af4bb97d.nnue`
is **1.13 MB gzipped / 1.05 MB brotli total** and is real Stockfish 19 with `Skill Level 0–20`,
`MultiPV 1–256`, `UCI_Elo 1320–3190` and `Threads 1–1024` (verified by running it in Node, ESM,
`await Sf_19_Smallnet_Web({listen, onError})` then `sf.setNnueBuffer(new Uint8Array(net), 0)`;
`sf.getRecommendedNnue(0)` returns `"nn-61e7af4bb97d.nnue"`; depth 14 / MultiPV 3 / Threads 1 in **124 ms**).

**But it imports a `shared: true` memory**, so the page must be cross-origin isolated
(`Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`), which is
very likely to break the Clerk widgets, Convex websocket and any cross-origin HDRI/asset loads unless
every one of them ships `Cross-Origin-Resource-Policy`. Do not take this path without a dedicated
spike. It is also **AGPL-3.0-or-later**, a materially heavier licence obligation than GPL-3.0.

### (c) Not recommended: shipping SF18 lite-single lazily

The previous §2.1 conclusion ("nothing under 2 MB exists, raise NFR-3 to ≤ 6 MB") is **superseded** —
it was scoped to the `stockfish` package alone. §11.1 shows three sub-2 MB, no-SAB, `Skill Level` +
`MultiPV` capable builds on npm. Keep SF18 lite-single only as an *optional* "maximum strength"
download the user opts into.

### GPL-3.0 obligation (applies to (a) as well)

Serving the compiled `stockfish.js`/`stockfish.wasm` to browsers distributes a GPL-3.0 program.
Ship `license.txt` alongside them in `public/stockfish/` and put a visible link to the exact upstream
source (`https://github.com/nmrugg/stockfish.js` at the `v11.0.0` tag) in the app's about/credits page.

## 11.5 Unverified / open questions (section 11)

- **Elo estimates were not measured.** No claim here about SF11-classical vs SF18-NNUE strength in Elo;
  only nps/depth/latency were measured, on this Mac (Apple Silicon, Chromium). Low-end mobile numbers
  are unmeasured — but SF11 needs no SIMD and only 64 MB, so it should degrade better than SF18 lite-single.
- **`stockfish.js@9.0.0` was measured but not executed** (its 190 KB gz is no better than `stockfish@10.0.2`'s 137 KB).
- **`stockfish@11.0.0` was not run in a Node `worker_threads` Worker** (the SF18 glue refuses to
  initialise there — §8.1). Untested for SF11; if the Eve tool ever needs a server-side engine, test that
  first, or keep the client-computed-candidates plan from FR-35.
- **Safari / iOS was not tested.** The no-SIMD, no-SAB, 64 MB-fixed profile should be the widest-compatible
  option of everything surveyed, but this was verified only in Chromium.
- **`Cross-Origin-Embedder-Policy: credentialless`** (the softer isolation mode that would make option (b)
  survivable next to Clerk) — its Safari support was not verified in this pass.
- **`stockfish@17.1.0`'s file list** came from `unpkg.com/stockfish@17.1.0/?meta`, not from an extracted
  tarball (183 MB unpacked); jsDelivr's API refuses the package for exceeding its 150 MB limit.
- **`chess-study-stockfish@0.1.0`** was inspected (README + `src/*.mjs`) but its patch was not applied or
  run; it ships no engine bytes of its own — it only rewrites `stockfish-18-lite`'s imported-memory
  maximum from 32768 to 8192 pages. Irrelevant to the size question, potentially relevant if the
  threaded SF18 build is ever revisited.
- **Long-game stability / TT behaviour of SF11** across many `ucinewgame` cycles was not stress-tested.
