// playwright.config.ts
// End-to-end configuration. Two modes:
//
//   pnpm e2e        -> e2e/public.spec.ts only, no Clerk credentials needed.
//   pnpm e2e:auth   -> everything, including e2e/auth.spec.ts.
//
// `E2E_BASE_URL` points the suite at an already-running server (a preview URL, or a
// `pnpm dev` you started yourself). With it unset the config starts `pnpm dev` and
// reuses one that is already listening on the port.
import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Playwright transpiles this file to CommonJS before requiring it, so `__dirname` is
// the portable way to anchor paths here — `import.meta.url` is a syntax error.
const rootDir = __dirname;

// The E2E_* variables live alongside the Clerk keys in `.env.local`, and Playwright
// does not read dotenv files on its own. `process.loadEnvFile` is Node's own loader
// (>= 20.12; this repo requires >= 24) so it costs no dependency, and — like
// `--env-file` — it leaves variables already present in the real environment alone.
for (const file of [".env.local", ".env"]) {
  const full = path.join(rootDir, file);
  if (existsSync(full)) process.loadEnvFile(full);
}

// TRUTHINESS, not `??`/`=== undefined`: `.env.example` ships `E2E_BASE_URL=` and
// `process.loadEnvFile` turns a bare `KEY=` line into the empty STRING, which a nullish
// check happily accepts — that left `use.baseURL` empty AND suppressed `webServer`, so
// every relative `page.goto("/")` threw on an invalid URL. The Clerk credentials below
// are guarded the same way for the same reason.
const baseURL = process.env.E2E_BASE_URL || "http://localhost:3000";

/** Only a base URL we did not start ourselves is treated as "already running". */
const startsOwnServer = !process.env.E2E_BASE_URL;

/**
 * The Clerk Testing Token is fetched once in `e2e/global-setup.ts`, but only when there
 * is a test user to sign in as. Without these two the auth spec skips itself, and
 * running `clerkSetup()` would fail the whole run on a missing `CLERK_SECRET_KEY`.
 */
const hasClerkTestUser =
  Boolean(process.env.E2E_CLERK_USER_EMAIL) ||
  (Boolean(process.env.E2E_CLERK_USER_USERNAME) && Boolean(process.env.E2E_CLERK_USER_PASSWORD));

export default defineConfig({
  testDir: path.join(rootDir, "e2e"),
  // The app allows one active game per player, so the authenticated specs share a
  // resource and must not race each other.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: hasClerkTestUser ? path.join(rootDir, "e2e", "global-setup.ts") : undefined,
  use: {
    baseURL,
    trace: "on-first-retry",
    video: "off",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: startsOwnServer
    ? {
        command: "pnpm dev",
        url: baseURL,
        reuseExistingServer: true,
        // A cold Next 16 dev boot plus the first compile of `/` is slow.
        timeout: 240_000,
        stdout: "pipe",
        stderr: "pipe",
      }
    : undefined,
});
