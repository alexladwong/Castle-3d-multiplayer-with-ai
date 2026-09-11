// e2e/pro.spec.ts
// Castle Pro, from both sides (docs/PRO_TUTOR.md §8).
//
//   1. `/pro` as a signed-out visitor sees it — no credentials, so `pnpm e2e` runs it
//      anywhere.
//   2. The whole paid walk as the throwaway member: a locked panel, checkout through
//      Clerk's own pricing table and Stripe Elements, back to the game, and one real
//      tutor turn against the live model. Skipped without E2E_CLERK_USER_*.
//
// The page objects come from `@clerk/testing/playwright/unstable`, whose API was read
// off node_modules/@clerk/testing/dist/types/playwright/unstable/ before use: the
// module exports `createPageObjects` (and `createAppPageObject`) — there is no
// `createPricingTablePageObject` export; the pricing-table and checkout objects are
// fields on what `createPageObjects` returns. Its billing period is `"monthly"` /
// `"annually"`, not "month".
import { expect, test, type Page } from "@playwright/test";
import { createPageObjects } from "@clerk/testing/playwright/unstable";
import {
  abandonActiveGame,
  actionBar,
  hasClerkTestUser,
  hideNextDevOverlay,
  playMove,
  resign,
  sanMoves,
  setBoardView,
  signIn,
} from "./helpers/app";

test.describe("/pro", () => {
  test.beforeEach(async ({ page }) => {
    await hideNextDevOverlay(page);
  });

  test("sells the tutor and mounts Clerk's pricing table", async ({ page }) => {
    await page.goto("/pro");

    await expect(page).toHaveTitle("Castle Pro");
    await expect(page.getByRole("heading", { level: 1, name: "A coach in the room." })).toBeVisible();
    await expect(
      page.getByText(
        "Ask about any position, in any game. The tutor explains the idea and draws it on the board.",
      ),
    ).toBeVisible();

    // §1's three points, verbatim.
    for (const point of [
      "Why a move was a mistake, in one paragraph",
      "The plan from here, with the squares that matter marked",
      "The threats, before they land",
    ]) {
      await expect(page.getByRole("heading", { name: point })).toBeVisible();
    }

    // The drawings are the product: each point carries a board with an annotation on
    // it, and every annotation's tone is named in words beside it.
    await expect(page.locator('[data-annotation="square"]')).toHaveCount(3);
    await expect(page.locator('[data-annotation="arrow"]')).toHaveCount(2);
    await expect(page.getByText("Square f7, arrow g5→f7 · threat")).toBeVisible();

    // Clerk's PricingTable root, inside the page's own well. `.cl-rootBox` is what
    // clerk-js mounts every component into; waiting for the plan card proves the
    // component actually rendered rather than just reserving space.
    const well = page.locator('[data-slot="pricing-well"]');
    await expect(well).toBeVisible();
    await expect(well.locator(".cl-pricingTable, .cl-rootBox").first()).toBeVisible({
      timeout: 30_000,
    });
    // The price comes from Clerk, never from this repo.
    await expect(well).toContainText(/\$\s?9/, { timeout: 30_000 });
  });

  test("answers the questions a visitor has before paying", async ({ page }) => {
    await page.goto("/pro");

    // `<details>` maps to role="group"; the first one is open on load, the rest are
    // closed, so this also proves the disclosure works with no JavaScript of ours.
    const cancel = page.getByRole("group").filter({ hasText: "How do I cancel?" });
    await expect(cancel).toHaveCount(1);
    await cancel.getByText("How do I cancel?").click();
    await expect(cancel).toContainText("under Billing");

    // §7 asks for the browser-engine line by name.
    const engine = page.getByRole("group").filter({ hasText: "Where does the analysis come from?" });
    await engine.getByText("Where does the analysis come from?").click();
    await expect(engine).toContainText("engine runs in your browser");
  });

  test("has no horizontal overflow on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/pro");
    await expect(page.getByRole("heading", { level: 1, name: "A coach in the room." })).toBeVisible();
    await page.waitForLoadState("networkidle");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

/* ------------------------------------------------------------ authenticated */

/** The panel, wherever it currently lives (column, overlay or sheet). */
function tutorPanel(page: Page) {
  return page.getByRole("region", { name: "Tutor" });
}

/** The 2D board's annotation layer — a sibling of the squares grid, not a child. */
function annotations2d(page: Page) {
  return page.locator('[data-annotations="2d"] [data-annotation]');
}

test.describe.configure({ mode: "serial" });

test.describe("Castle Pro, as a member", () => {
  test.skip(
    !hasClerkTestUser,
    "Set E2E_CLERK_USER_EMAIL (or E2E_CLERK_USER_USERNAME and E2E_CLERK_USER_PASSWORD) to run these.",
  );

  // The checkout drawer, the session reload and a real model turn are all slow, and
  // they are one story: one test, with room for it.
  test.setTimeout(5 * 60_000);

  test("locked panel -> subscribe -> the tutor answers and marks the board", async ({
    page,
  }, testInfo) => {
    await hideNextDevOverlay(page);
    // §3: from 1280 the tutor is a docked column, which is the state worth walking.
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);

    // --- a game to ask about ------------------------------------------------
    await abandonActiveGame(page);
    await page.getByLabel("Player 2 name").fill("E2E Rival");
    await page.getByRole("button", { name: "Start the game" }).click();
    await expect(page).toHaveURL(/\/game\/[a-z0-9]+$/i);
    const gameUrl = page.url();

    // 2D from the start: the 3D board draws its annotations into a canvas, where no
    // assertion can see them, and `playMove` needs the grid anyway.
    await setBoardView(page, "2D");
    await playMove(page, "e2", "e4");
    await playMove(page, "e7", "e5");
    // Both moves are server round trips, and the panel sends the ply it can SEE. Ask
    // before the second one lands and the tutor truthfully answers about the position
    // one ply back — so wait for the move list, not just for the clicks.
    await expect.poll(() => sanMoves(page)).toEqual(["e4", "e5"]);

    const panel = tutorPanel(page);
    await expect(panel).toBeVisible();

    // --- is this account already a member? ----------------------------------
    // The composer only exists in the unlocked panel, so its presence IS the answer
    // to `has({ feature: "tutor" })` — no need to ask Clerk twice.
    const composer = panel.getByLabel("Ask the tutor");
    await expect(panel.getByRole("link", { name: "Go Pro" }).or(composer)).toBeVisible();
    const alreadyPro = (await composer.count()) > 0;
    // What this run actually did, in the report: whether it walked checkout or found
    // the account already subscribed. Without it a green run says nothing about which.
    testInfo.annotations.push({
      type: "checkout",
      description: alreadyPro ? "skipped — the account already has the tutor" : "walked",
    });

    if (!alreadyPro) {
      // §3.2: the locked panel says what Pro buys and offers exactly one way in.
      const goPro = panel.getByRole("link", { name: "Go Pro" });
      await expect(goPro).toHaveAttribute("href", "/pro");
      await expect(panel.getByText("Monthly. Cancel any time.")).toBeVisible();
      // Clicking it (rather than navigating) is what stores the game id under
      // `castle:tutor:return`, which the welcome state reads back below.
      await goPro.click();
      await expect(page).toHaveURL(/\/pro$/);

      const { pricingTable, checkout } = createPageObjects({
        page,
        baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
      });
      await pricingTable.waitForMounted();

      // A subscription taken by an earlier run of this file survives; the badge is
      // Clerk's own answer, so it is the one to trust before paying twice.
      const active = page.locator(".cl-pricingTableCard__pro .cl-badge", { hasText: "Active" });
      if ((await active.count()) === 0) {
        await pricingTable.startCheckout({ planSlug: "pro", period: "monthly" });
        await checkout.waitForMounted();
        // The card fields live inside Stripe's own iframe — Castle never sees them.
        await checkout.waitForStripeElements();
        await checkout.fillTestCard();
        await checkout.clickPayOrSubscribe();
      }
      await pricingTable.waitToBeActive({ planSlug: "pro" });

      // §2: `newSubscriptionRedirectUrl` lands on the welcome state, which reloads the
      // session once — without that the token still says "free" and `has` stays false.
      if (!page.url().includes("welcome=1")) await page.goto("/pro?welcome=1");
      await expect(page.getByRole("heading", { name: "You are in." })).toBeVisible({
        timeout: 60_000,
      });

      // The way back is the game the locked panel came from, not the lobby.
      const back = page.getByRole("link", { name: "Back to the game" });
      await expect(back).toBeVisible();
      await back.click();
      await expect(page).toHaveURL(gameUrl);
    }

    // --- the tutor is open for business -------------------------------------
    await setBoardView(page, "2D");
    await expect(panel).toBeVisible();
    await expect(panel.getByText("Pro", { exact: true })).toBeVisible();
    await expect(composer).toBeVisible();

    // --- one real turn ------------------------------------------------------
    const answered = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/tutor" &&
        response.request().method() === "POST",
      { timeout: 60_000 },
    );
    await composer.fill("What's the plan here?");
    await composer.press("Enter");

    const response = await answered;
    // 401 = not signed in, 402 = not Pro, 429 = out of turns, 503 = no gateway
    // credential. Any of those is a bug in the app, not in this test.
    expect(response.status(), await response.text().catch(() => "")).toBe(200);

    const log = panel.getByRole("log", { name: "Tutor conversation" });
    const bubble = log.locator('[data-testid="tutor-message"]').last();
    await expect(bubble).toBeVisible({ timeout: 60_000 });
    await expect
      .poll(async () => ((await bubble.textContent()) ?? "").trim().length, {
        timeout: 60_000,
        message: "the tutor never said anything",
      })
      .toBeGreaterThan(20);

    // §4: what it said, it drew — on the very board the member is playing on.
    await expect
      .poll(() => annotations2d(page).count(), {
        timeout: 60_000,
        message: "the tutor answered but marked nothing on the board",
      })
      .toBeGreaterThan(0);
    // Never colour alone (§4): every drawing has a chip that names its tone.
    const chips = log.locator('[data-annotation-chip="drawn"]');
    await expect(chips.first()).toBeVisible();

    // The answer is the artefact worth keeping: a model turn cannot be asserted word
    // for word, so the report carries what was actually said and drawn.
    await testInfo.attach("tutor-answer.txt", {
      body: [
        (await bubble.textContent()) ?? "",
        "",
        `drawings: ${(await chips.allTextContents()).join(" | ")}`,
      ].join("\n"),
      contentType: "text/plain",
    });

    // Hand the account back without an active game, the way the auth spec does.
    await expect(actionBar(page)).toBeVisible();
    await resign(page);
  });
});
