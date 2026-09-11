// e2e/global-setup.ts
// Runs once, before any worker starts, and ONLY when `playwright.config.ts` found the
// E2E_CLERK_USER_* credentials (see `hasClerkTestUser` there).
//
// `clerkSetup()` (verified against @clerk/testing 2.2.33, dist/playwright/index.mjs):
//   - loads `.env.local` then `.env` through dotenv unless `dotenv: false`,
//   - reads NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY (or VITE_/CLERK_/REACT_APP_/EXPO_PUBLIC_)
//     and CLERK_SECRET_KEY,
//   - calls `testingTokens.createTestingToken()` on the Backend API,
//   - and exports the result as `process.env.CLERK_TESTING_TOKEN` + `CLERK_FAPI`.
//
// Playwright forks its workers after global setup, so both variables are inherited by
// every test, which is how `setupClerkTestingToken` / `clerk.signIn` find them.
//
// The Backend API refuses to mint a testing token for a production instance, so this
// only ever works against a Clerk *development* instance.
import { clerkSetup } from "@clerk/testing/playwright";

export default async function globalSetup(): Promise<void> {
  await clerkSetup();
}
