import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // INTEGRATION: `pnpm lint` runs bare `eslint`, which walks the whole repo. These
    // paths are vendored or tool-generated and are not ours to lint or fix.
    ".eve/**", // eve dev-runtime snapshots of our own compiled agent
    ".output/**",
    "convex/_generated/**", // written by `convex dev`, never hand-edited (§A.1)
    "public/stockfish/**", // vendored stockfish@11.0.0 emscripten glue (GPL-3.0)
    "public/models/**",
    // Agent tooling that happens to live in the repo: bundled browser scripts we
    // neither wrote nor ship. They were the only source of `pnpm lint` warnings.
    ".agents/**",
    // Playwright's own HTML report and trace viewer: bundled third-party JS written
    // by `playwright test`, gitignored, and not ours to lint.
    "playwright-report/**",
    "test-results/**",
    "playwright/.cache/**",
    ".claude/**",
    ".codex/**",
  ]),
]);

export default eslintConfig;
