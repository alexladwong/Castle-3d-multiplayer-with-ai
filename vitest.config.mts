import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Convex function tests run against `convex-test`, a JS mock of the backend, in the
// edge-runtime VM (the closest match to the Convex V8 isolate). `convex-test` ships
// untranspiled ESM that Vite must process, hence the inline entry.
// https://docs.convex.dev/functions/testing
export default defineConfig({
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    // P0's src/lib/__tests__ and P5's src/lib/engine/__tests__ both carry
    // `// @vitest-environment node` on line 1, so the edge-runtime default above
    // does not apply to them.
    // `agent/**` holds the eve tool tests: `defineTool` returns a plain object, so they
    // run in the node environment without an eve runtime (they carry the same
    // `// @vitest-environment node` header). Those files sit LOOSE in the agent root, not
    // in a `__tests__/` directory — eve validates every entry under `agent/tools/` as a
    // tool name, so `agent/tools/__tests__/` is a hard discovery error that stops
    // `next dev` booting. See the header of agent/analyse-position.test.ts.
    // `.tsx` is here for U0's ui-kit component tests, which render through
    // `react-dom/server` (there is no @testing-library / jsdom in this repo).
    include: [
      "convex/**/*.test.ts",
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "agent/**/*.test.ts",
    ],
  },
  // `@/…` is a tsconfig path; vitest does not read tsconfig, so it needs the alias.
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
