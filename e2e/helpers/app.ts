// e2e/helpers/app.ts
// Selectors and small flows shared by the authenticated spec. Everything here is
// pinned to markup that already exists in `src/` — roles, ARIA labels, the board's
// own `data-square` attributes and the handful of `data-testid` hooks the chat adds.
//
// Redesign note (UI_REDESIGN §5/§6): the game screen no longer has a "Board view"
// button group or an always-visible "Move history" region. The view toggle, Flip,
// Take back and Resign live in the labelled `role="toolbar"` action bar under the
// board, and the move list is the "Moves" tab of the right sidebar.
import { expect, type Locator, type Page } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";

export const E2E_EMAIL = process.env.E2E_CLERK_USER_EMAIL;
export const E2E_USERNAME = process.env.E2E_CLERK_USER_USERNAME;
export const E2E_PASSWORD = process.env.E2E_CLERK_USER_PASSWORD;
/** Either a sign-in-token email, or a username + password pair, unlocks the suite. */
export const hasClerkTestUser =
  Boolean(E2E_EMAIL) || (Boolean(E2E_USERNAME) && Boolean(E2E_PASSWORD));

/**
 * Signs the E2E user in. Preferred path: `clerk.signIn({ page, emailAddress })`, which
 * looks the user up on the Backend API, mints a 5-minute sign-in token and signs in with
 * the `ticket` strategy (verified in @clerk/testing 2.2.33 dist/playwright/index.mjs).
 * That bypasses first/second factors — including the instance's device-trust step,
 * which turns a plain password sign-in into `needs_client_trust` on a fresh browser and
 * never creates a session. Password stays as the fallback for instances without it.
 *
 * `clerk.signIn` installs the Testing Token on the context itself and waits for
 * `window.Clerk.loaded`, so the only requirement is that we are already on a page that
 * mounts `<ClerkProvider/>` and is not gated by `src/proxy.ts` — `/` is both.
 */
export async function signIn(page: Page): Promise<void> {
  await page.goto("/");
  if (E2E_EMAIL) {
    await clerk.signIn({ page, emailAddress: E2E_EMAIL });
    return;
  }
  await clerk.signIn({
    page,
    signInParams: {
      strategy: "password",
      identifier: E2E_USERNAME as string,
      password: E2E_PASSWORD as string,
    },
  });
}

/** The Clerk username, which `players.ensurePlayer` uses as the profile handle. */
export async function clerkUsername(page: Page): Promise<string> {
  await clerk.loaded({ page });
  const username = await page.evaluate(() => window.Clerk?.user?.username ?? null);
  expect(
    username,
    "the E2E Clerk user needs a username — the app derives the profile handle from it",
  ).not.toBeNull();
  return username as string;
}

/* ------------------------------------------------------------------ board */

/** The action bar under the board (`<ActionBar label="Game actions"/>`, §5.1). */
export function actionBar(page: Page): Locator {
  return page.getByRole("toolbar", { name: "Game actions" });
}

/** The 2D board's `role="grid"`. Scoped so `[data-square]` can never collide with a
 *  `MiniBoard`, which paints the same attribute onto its SVG cells. */
export function board2d(page: Page): Locator {
  return page.getByRole("grid", { name: /chess board/i });
}

export function square(page: Page, id: string): Locator {
  return board2d(page).locator(`[data-square="${id}"]`);
}

/** Click from-square then to-square on the 2D board. */
export async function playMove(page: Page, from: string, to: string): Promise<void> {
  await square(page, from).click();
  await square(page, to).click();
}

/* ------------------------------------------------------- sidebar / moves */

/** The "Moves" tab panel. Base UI puts `hidden` on an unselected panel, so this
 *  only resolves once {@link openMovesTab} has selected it. */
export function moveHistory(page: Page): Locator {
  return page.getByRole("tabpanel", { name: "Moves" });
}

/** The "Chat" tab panel — the rebuild of the old commentary panel (§5.1). */
export function chatPanel(page: Page): Locator {
  return page.getByRole("tabpanel", { name: "Chat" });
}

async function openTab(page: Page, name: "Chat" | "Moves" | "Info"): Promise<void> {
  const tab = page.getByRole("tab", { name, exact: true });
  await expect(tab).toBeVisible();
  if ((await tab.getAttribute("aria-selected")) !== "true") await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
}

/** Chat leads in AI games, so the move list has to be asked for by name. */
export async function openMovesTab(page: Page): Promise<void> {
  await openTab(page, "Moves");
  await expect(moveHistory(page)).toBeVisible();
}

export async function openChatTab(page: Page): Promise<void> {
  await openTab(page, "Chat");
  await expect(chatPanel(page)).toBeVisible();
}

/**
 * Every SAN currently in the move list, in play order.
 *
 * Deliberately tab-INDEPENDENT: `MoveList` renders `role="list"` with an explicit
 * `aria-label`, both of which stay in the DOM while the panel is hidden, and
 * `textContent` does not need the element to be visible. That keeps "the move list
 * survived a 2D/3D round trip" an assertion about state, not about which tab is open.
 * The `aria-label^="Move "` filter excludes the hover-revealed "Rewind to move N"
 * buttons that sit in the same cells.
 */
export async function sanMoves(page: Page): Promise<string[]> {
  return page
    .locator('[role="list"][aria-label="Moves"] button[aria-label^="Move "]')
    .allTextContents();
}

/**
 * `<StatPill role="status">Move 3 · Ada to move</StatPill>` in the player row (§5.1).
 *
 * Before the first move the same pill reads "Your move — pick a piece" instead of
 * counting, so that phrase is part of what identifies it.
 */
export function turnIndicator(page: Page): Locator {
  return page.getByRole("status").filter({ hasText: /to move|Your move|Game over/ });
}

/**
 * The "<name> to move" half of the status pill, without the "Move N ·" counter —
 * so a phrase captured after one move can be compared with one captured after the
 * next. (At ply 0 there is no such half: the pill carries the first-move nudge.)
 */
export function turnPhrase(text: string | null): string {
  const match = (text ?? "").match(/([^·]*?to move)\s*$/);
  return (match?.[1] ?? text ?? "").trim();
}

export async function turnPhraseNow(page: Page): Promise<string> {
  return turnPhrase(await turnIndicator(page).textContent());
}

/**
 * FR-14's 2D/3D switch, now a single toggle in the action bar that is NAMED FOR THE
 * VIEW IT SWITCHES TO — so "2D" is only on screen while the 3D board is showing.
 * The board is allowed to settle first: `boardView` comes from the persisted ui-store,
 * and reading the toggle before it rehydrates can read the pre-hydration default.
 */
export async function setBoardView(page: Page, view: "2D" | "3D"): Promise<void> {
  await expect(actionBar(page)).toBeVisible();
  await expect(
    board2d(page).or(page.getByRole("application", { name: /3D chess board/i })),
  ).toBeVisible({ timeout: 60_000 });

  const toggle = actionBar(page).getByRole("button", { name: view, exact: true });
  if ((await toggle.count()) > 0) await toggle.click();

  if (view === "2D") {
    await expect(square(page, "e1")).toBeVisible();
  } else {
    await expect(page.getByRole("application", { name: /3D chess board/i })).toBeVisible();
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 45_000 });
  }
}

/* ------------------------------------------------------------------- game */

export async function gotoPlay(page: Page): Promise<void> {
  await page.goto("/play");
  await expect(page.getByRole("heading", { level: 1, name: "Play" })).toBeVisible();
  // `games.myActiveGame` is a live subscription. The lobby keeps every seat disabled
  // until its first value lands, then either shows the resume banner or re-enables
  // the seats — wait for one of those two, not for a fixed delay.
  const start = page.getByRole("button", { name: "Start the game" });
  const resume = page.getByRole("link", { name: "Resume game" });
  await expect(start).toBeVisible();
  await expect
    .poll(
      async () => {
        if ((await resume.count()) > 0) return true;
        const ariaDisabled = await start.getAttribute("aria-disabled");
        return ariaDisabled !== "true" && !(await start.isDisabled());
      },
      { timeout: 30_000, message: "the lobby never settled its active-game check" },
    )
    .toBe(true);
  await page.waitForFunction(() => document.readyState === "complete");
}

/** Ends whatever game the test user is in, so the next `create*Game` is allowed. */
export async function abandonActiveGame(page: Page): Promise<void> {
  await gotoPlay(page);
  const resume = page.getByRole("link", { name: "Resume game" });
  if ((await resume.count()) === 0) return;
  await resume.click();
  await expect(page).toHaveURL(/\/game\//);
  await resign(page);
  await gotoPlay(page);
  await expect(page.getByRole("link", { name: "Resume game" })).toHaveCount(0);
}

/**
 * Resign through the action bar and dismiss the end-of-game card.
 *
 * The trigger is `aria-disabled` (not `disabled`) until the game is resignable, and
 * carries `pointer-events: none` while it is — so waiting for it to be *enabled* is
 * what stops the click from hanging on an unclickable element.
 */
export async function resign(page: Page): Promise<void> {
  const trigger = actionBar(page).getByRole("button", { name: "Resign the game" });
  await expect(trigger).toBeEnabled({ timeout: 30_000 });
  await trigger.click();

  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Resign", exact: true }).click();

  // FR-45 / §5.4: the end-of-game card opens as soon as the mutation lands. It is
  // modal, so the rest of the page goes `aria-hidden` — assert on the dialog.
  const result = page.getByRole("dialog");
  await expect(result).toBeVisible();
  // Close it, so a caller that stays on this page can keep driving the screen.
  await result.getByRole("button", { name: "Review game" }).click();
  await expect(result).toBeHidden();
}

/**
 * Next's dev overlay (`<nextjs-portal>`) hosts the dev-tools button, which a fresh
 * browser profile pins to the bottom-left corner — exactly over the game screen's
 * action bar at 1280×720, where it swallowed clicks on "3D". It does not exist in a
 * production build, so hiding its host element changes nothing the suite asserts on;
 * console errors are still collected by the console-sweep test.
 */
export async function hideNextDevOverlay(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // A constructed stylesheet, not a <style> node: React hydrates the <html> root
    // and removes foreign nodes it finds there, but adopted stylesheets are not in
    // the DOM tree and survive hydration and client-side navigation alike.
    const sheet = new CSSStyleSheet();
    sheet.replaceSync("nextjs-portal{display:none!important}");
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  });
}
