// e2e/tutor.spec.ts
// The tutor panel of docs/PRO_TUTOR.md §3, through the PUBLIC dev harness — no
// Clerk, no Convex, no model. `/dev/game?scenario=tutor-pro` fakes the feature
// through `TutorAccessProvider` and feeds the panel a scripted conversation, so
// this file can run anywhere `pnpm e2e` runs.
import { expect, test, type Page } from "@playwright/test";
import { hideNextDevOverlay } from "./helpers/app";
import { watchConsole } from "./helpers/console";

/** The harnesses answer `notFound()` outside development. */
const IS_LOCAL = /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:|\/|$)/.test(
  process.env.E2E_BASE_URL || "http://localhost:3000",
);
const DEV_ONLY = "the /dev harnesses are notFound() outside development";

/** The panel, wherever it currently lives (column, overlay or sheet). */
function panel(page: Page) {
  return page.getByRole("region", { name: "Tutor" });
}

/**
 * The 2D board's annotation layer. Scoped to `[data-annotations="2d"]` rather than
 * to the `role="grid"`: the layer is a SIBLING of the squares grid (it sits between
 * the grid and the pieces), and nothing else in the app paints that attribute.
 */
function annotations2d(page: Page) {
  return page.locator('[data-annotations="2d"] [data-annotation]');
}

test.describe("the tutor panel", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!IS_LOCAL, DEV_ONLY);
    await hideNextDevOverlay(page);
    // The column layout of §3 needs 1280; Desktop Chrome's default is exactly that.
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("Pro: the panel, its Pro chip, a tutor answer and its annotation chips", async ({
    page,
  }) => {
    const console_ = watchConsole(page);
    await page.goto("/dev/game?scenario=tutor-pro");

    const tutor = panel(page);
    await expect(tutor).toBeVisible();
    await expect(tutor.getByRole("heading", { name: "Tutor" })).toBeVisible();
    // §3.1: the brass Pro chip, which only a member with the feature sees.
    await expect(tutor.getByText("Pro", { exact: true })).toBeVisible();

    // §3.3: the conversation is a log, and the tutor has spoken in it.
    const log = tutor.getByRole("log", { name: "Tutor conversation" });
    await expect(log).toBeVisible();
    const bubbles = log.locator('[data-testid="tutor-message"]');
    await expect(bubbles.first()).toBeVisible();
    await expect(log).toContainText("knight on f6");

    // §3.3: one chip per drawing, each naming its tone in words as well as colour.
    const chips = log.locator('[data-annotation-chip="drawn"]');
    await expect(chips.first()).toBeVisible();
    expect(await chips.count()).toBeGreaterThanOrEqual(1);
    await expect(log.getByRole("button", { name: /Squares e4, f7 · threat/ })).toBeVisible();

    // The newest answer's drawing is on the board by default, so the header offers
    // the way to take it off again (§3.1).
    await expect(tutor.getByRole("button", { name: "Clear board notes" })).toBeVisible();

    // §3.4: which position the answer is about, above the composer.
    await expect(tutor.getByText(/^(Live position ·|Reviewing) move \d+$/)).toBeVisible();
    // §3.3: the composer's own visible label and its four suggestions.
    await expect(tutor.getByLabel("Ask the tutor")).toBeVisible();
    for (const suggestion of [
      "Why does Nxe4 work?",
      "What if my opponent avoids that line?",
      "What changed after Nc3?",
      "What's the plan for Black here?",
    ]) {
      await expect(tutor.getByRole("button", { name: suggestion, exact: true })).toBeVisible();
    }

    expect(console_.errors()).toEqual([]);
  });

  test("Pro: the drawing reaches the 2D board", async ({ page }) => {
    await page.goto("/dev/game?scenario=tutor-pro");
    await expect(panel(page)).toBeVisible();

    // The harness may open on either board; the action bar names the view it
    // switches TO, so "2D" is present exactly when the board is currently 3D.
    const toTwoD = page
      .getByRole("toolbar", { name: "Game actions" })
      .getByRole("button", { name: "2D", exact: true });
    if (await toTwoD.isVisible()) await toTwoD.click();

    await expect(page.getByRole("grid", { name: /chess board/i })).toBeVisible();
    // §4: both boards render `useTutorStore.annotations`; the 2D layer marks its
    // shapes with `data-annotation` so a test can see them.
    await expect(annotations2d(page).first()).toBeAttached();
    expect(await annotations2d(page).count()).toBeGreaterThan(0);
  });

  test("suggestions submit immediately and change after asking and reviewing", async ({ page }) => {
    await page.goto("/dev/game?scenario=tutor-pro");
    const tutor = panel(page);
    const question = "Why does Nxe4 work?";
    await tutor.getByLabel("Ask the tutor").fill("An unfinished draft");
    await tutor.getByRole("button", { name: question, exact: true }).click();
    await expect(tutor.getByRole("log").getByText(question, { exact: true })).toHaveCount(1);
    await expect(tutor.getByLabel("Ask the tutor")).toHaveValue("");
    await expect(tutor.getByRole("button", { name: question, exact: true })).toHaveCount(0);
    await expect(tutor.getByRole("log").getByText("An unfinished draft", { exact: true })).toHaveCount(0);

    await page.getByRole("tab", { name: "Moves", exact: true }).click();
    await page.getByRole("button", { name: "First move", exact: true }).click();
    await expect(tutor.getByRole("button", { name: "How should I start this game?", exact: true })).toBeVisible();
    await expect(tutor.getByRole("button", { name: "Clear board notes" })).toBeVisible();
  });

  test("an invalidated drawing stays cleared through fullscreen remounts", async ({ page }) => {
    await page.goto("/dev/game?scenario=tutor-pro");
    await expect(panel(page).getByRole("button", { name: "Clear board notes" })).toBeVisible();
    await page.getByRole("button", { name: "Take back", exact: true }).click();
    await expect(panel(page).getByRole("button", { name: "Clear board notes" })).toHaveCount(0);
    await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
    await page.getByRole("button", { name: "Exit fullscreen", exact: true }).click();
    await page.getByRole("button", { name: "Tutor", exact: true }).click();
    await expect(panel(page).getByRole("button", { name: "Clear board notes" })).toHaveCount(0);
  });

  test("fullscreen canvas follows the viewport on entry, resize and exit", async ({ page }) => {
    await page.goto("/dev/game?scenario=tutor-pro");
    const threeD = page.getByRole("toolbar", { name: "Game actions" }).getByRole("button", { name: "3D", exact: true });
    if (await threeD.isVisible()) await threeD.click();
    await expect(page.locator("canvas")).toBeVisible();
    // Cover browsers that provide only the app's focus layout, too.
    await page.evaluate(() => { document.documentElement.requestFullscreen = async () => { throw new Error("unsupported"); }; });
    await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
    for (const viewport of [{ width: 800, height: 600 }, { width: 390, height: 844 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(viewport);
      await expect.poll(async () => {
        const box = await page.locator("canvas").boundingBox();
        return box && Math.abs(box.width - viewport.width) <= 1 && Math.abs(box.height - viewport.height) <= 1;
      }).toBe(true);
    }
    await page.getByRole("button", { name: "Exit fullscreen", exact: true }).click();
    await expect(page.locator('[data-slot="game-frame"]')).toHaveAttribute("data-layout", "default");
    await expect.poll(async () => {
      const box = await page.locator("canvas").boundingBox();
      return box && box.width > 0 && box.x + box.width <= 1440 && box.y + box.height <= 900;
    }).toBe(true);
  });

  test("fullscreen floats both chats on opposite sides without trapping the tutor", async ({ page }) => {
    await page.goto("/dev/game?scenario=tutor-pro");
    await page.evaluate(() => { document.documentElement.requestFullscreen = async () => {}; });
    await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
    await page.getByRole("button", { name: "Tutor", exact: true }).click();
    await page.getByRole("button", { name: "Chat", exact: true }).click();
    const tutor = page.getByRole("dialog", { name: "Tutor", exact: true });
    const chat = page.getByRole("dialog", { name: "Game panel", exact: true });
    await expect(tutor).toBeVisible();
    await expect(chat).toBeVisible();
    await expect(tutor).toHaveAttribute("aria-modal", "false");
    const left = (await tutor.boundingBox())!;
    const right = (await chat.boundingBox())!;
    expect(left.x).toBe(12);
    expect(right.x + right.width).toBe(1428);
    expect(left.y).toBe(right.y);
    expect(left.height).toBe(right.height);
    expect(left.x + left.width).toBeLessThan(right.x);
    await tutor.getByLabel("Ask the tutor").focus();
    await page.keyboard.press("Tab");
    expect(await tutor.evaluate((element) => element.contains(document.activeElement))).toBe(false);
    await tutor.getByLabel("Ask the tutor").fill("Keep this draft");
    await tutor.getByRole("button", { name: "Hide tutor" }).click();
    await expect(chat).toBeVisible();
    await page.getByRole("button", { name: "Tutor", exact: true }).click();
    await expect(tutor.getByLabel("Ask the tutor")).toHaveValue("Keep this draft");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Chat", exact: true }).click();
    if (!(await chat.isVisible())) await page.getByRole("button", { name: "Chat", exact: true }).click();
    await expect(chat).toBeVisible();
    await expect(tutor).toBeHidden();
    await page.getByRole("button", { name: "Tutor", exact: true }).click();
    await expect(tutor).toBeVisible();
    await expect(chat).toHaveCount(0);
    expect((await tutor.boundingBox())!.width).toBe(366);
  });

  test("Pro: a chip is a toggle, and the header clears the board", async ({ page }) => {
    await page.goto("/dev/game?scenario=tutor-pro");
    const tutor = panel(page);
    const chip = tutor.getByRole("button", { name: /Squares e4, f7 · threat/ });
    await expect(chip).toBeVisible();

    // The newest answer is active by default, so its chips read as pressed.
    await expect(chip).toHaveAttribute("aria-pressed", "false");
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "false");

    // "Clear board notes" appears only while something is on the board.
    await chip.click();
    const clear = tutor.getByRole("button", { name: "Clear board notes" });
    await expect(clear).toBeVisible();
    await clear.click();
    await expect(clear).toBeHidden();
  });

  test("locked: the teaser, the Go Pro link and no conversation", async ({ page }) => {
    await page.goto("/dev/game?scenario=tutor-locked");

    const tutor = panel(page);
    await expect(tutor).toBeVisible();
    await expect(tutor.getByRole("heading", { name: "Tutor" })).toBeVisible();
    // §3.2: no Pro chip, no fake conversation, no composer.
    await expect(tutor.getByText("Pro", { exact: true })).toBeHidden();
    await expect(tutor.getByRole("log")).toBeHidden();
    await expect(tutor.getByLabel("Ask the tutor")).toBeHidden();

    await expect(
      tutor.getByText(
        "Ask about any position, in any game. The tutor explains the idea and draws it on the board.",
      ),
    ).toBeVisible();
    const cta = tutor.getByRole("link", { name: "Go Pro" });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", "/pro");
    await expect(tutor.getByText("Monthly. Cancel any time.")).toBeVisible();
  });

  test("the collapse control hides the column and the rail brings it back", async ({ page }) => {
    await page.goto("/dev/game?scenario=tutor-pro");
    const tutor = panel(page);
    await expect(tutor).toBeVisible();

    await tutor.getByRole("button", { name: "Hide tutor" }).click();
    await expect(tutor).toBeHidden();

    // §3: collapsed, the column is a 44px rail that says what it opens.
    const rail = page.locator('[data-slot="tutor-tab"]');
    await expect(rail).toBeVisible();
    const box = await rail.boundingBox();
    expect(box?.width).toBe(44);

    await rail.click();
    await expect(tutor).toBeVisible();
  });

  test("the sidebar still has exactly three tabs", async ({ page }) => {
    await page.goto("/dev/game?scenario=tutor-pro");
    await expect(panel(page)).toBeVisible();

    // §3: "the tutor is never a fourth tab".
    await expect(page.getByRole("tab")).toHaveCount(3);
    for (const name of ["Chat", "Moves", "Info"]) {
      await expect(page.getByRole("tab", { name, exact: true })).toBeVisible();
    }
  });

  /**
   * §3's 1024-1279 band, which had no test at all — which is why a focus trap that
   * leaked the moment the composer was empty (its state the whole time a member is
   * reading an answer) shipped green. Both of §3's named behaviours for this width
   * are asserted here: "Escape closes" and "focus trapped while open".
   */
  test("at 1024 the tutor is an overlay: Tab stays inside it and Escape closes it", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto("/dev/game?scenario=tutor-pro");

    // Collapsed by default at this width: it opens OVER the board, so it is asked for.
    const tab = page.locator('[data-slot="tutor-tab"]');
    await expect(tab).toBeVisible();
    await expect(panel(page)).toBeHidden();

    await tab.click();
    const overlay = page.getByRole("dialog", { name: "Tutor" });
    await expect(overlay).toBeVisible();
    await expect(panel(page)).toBeVisible();

    // (a) The trap, with the composer EMPTY — the state that broke it. The Send
    // button is rendered `disabled tabindex="0"`, so a trap that trusts `tabindex`
    // alone computes it as the last stop, never sees focus reach it, and lets Tab
    // walk out onto the action bar behind the layer.
    await overlay.getByLabel("Ask the tutor").focus();
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press("Tab");
      expect(
        await page.evaluate(() => {
          const layer = document.querySelector('[role="dialog"][aria-label="Tutor"]');
          return layer !== null && layer.contains(document.activeElement);
        }),
      ).toBe(true);
    }

    // (b) Escape closes, from the composer — where the global shortcut handler
    // refuses to act because the target is a textarea — and focus comes back.
    await overlay.getByLabel("Ask the tutor").focus();
    await page.keyboard.press("Escape");
    await expect(panel(page)).toBeHidden();
    await expect(tab).toBeFocused();
  });

  test("on a phone the tutor is a button on the bar and a sheet", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dev/game?scenario=tutor-pro");

    const bar = page.getByRole("toolbar", { name: "Game actions" });
    await expect(bar).toBeVisible();
    // §3: five buttons, with the tutor in Fullscreen's place — Fullscreen moves
    // into "More" so no caption has to truncate.
    await expect(bar.getByRole("button")).toHaveCount(5);
    // The sheet keeps its content mounted (so a conversation survives closing it),
    // so "closed" is "off screen", not "absent".
    await expect(panel(page)).not.toBeInViewport();

    await bar.getByRole("button", { name: "Tutor" }).click();
    await expect(panel(page)).toBeVisible();
  });
});
