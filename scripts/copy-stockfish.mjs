// scripts/copy-stockfish.mjs
//
// Refreshes public/stockfish/ from the two installed engine packages:
//
//   sf18  <- stockfish@18.0.8            (devDependency "stockfish")
//           bin/stockfish-18-lite-single.{js,wasm} — the DEFAULT engine
//   sf11  <- stockfish@11.0.0            (devDependency "stockfish11", npm alias)
//           src/stockfish.{js,wasm}      — the automatic no-SIMD fallback
//
// Both packages are devDependencies: nothing imports them at runtime, the browser
// only ever loads the copies under public/. The output files are COMMITTED, so this
// is NOT a postinstall hook — run it by hand (`pnpm copy:stockfish`) when upgrading
// an engine, and bump the target directory name at the same time (the
// `/stockfish/:path*` cache header in next.config.ts is `immutable`, so the path is
// the cache key).
//
// Layout source: docs/research/stockfish.md §3.1 (SF18) and §11.4 (SF11). The `.wasm`
// is resolved by each glue as a SIBLING of its `.js`, so the basenames must not change.
import { copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** @type {{ label: string; pkg: string; dir: string; files: [string, string][] }[]} */
const BUILDS = [
  {
    label: "stockfish@18.0.8 lite-single",
    pkg: "stockfish",
    dir: "sf18",
    files: [
      ["bin/stockfish-18-lite-single.js", "stockfish-18-lite-single.js"],
      ["bin/stockfish-18-lite-single.wasm", "stockfish-18-lite-single.wasm"],
      ["Copying.txt", "LICENSE-GPL-3.0.txt"], // GPLv3 compliance
    ],
  },
  {
    label: "stockfish@11.0.0 (no-SIMD fallback)",
    pkg: "stockfish11",
    dir: "sf11",
    files: [
      ["src/stockfish.js", "stockfish.js"],
      ["src/stockfish.wasm", "stockfish.wasm"],
      ["license.txt", "LICENSE-GPL-3.0.txt"], // GPLv3 compliance
    ],
  },
];

let copied = 0;
for (const build of BUILDS) {
  const from = join(root, "node_modules", build.pkg);
  if (!existsSync(from)) {
    console.warn(`[stockfish] ${build.pkg} not installed, skipping ${build.dir}`);
    continue;
  }
  const to = join(root, "public", "stockfish", build.dir);
  await mkdir(to, { recursive: true });
  for (const [source, target] of build.files) {
    await copyFile(join(from, source), join(to, target));
  }
  copied += 1;
  console.log(`[stockfish] ${build.label} -> public/stockfish/${build.dir}`);
}

if (copied === 0) {
  console.warn("[stockfish] nothing copied — run `pnpm install` first");
}
