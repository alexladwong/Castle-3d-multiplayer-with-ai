// e2e/auth.spec.ts
// The flows behind `src/proxy.ts`. Skipped in full unless E2E_CLERK_USER_EMAIL (or
// E2E_CLERK_USER_USERNAME + E2E_CLERK_USER_PASSWORD) is set, so `pnpm e2e` stays
// runnable with no credentials.
//
// Serial: the app allows one active game per player (`already-in-game`), so these
// tests share a resource and each one hands the account back clean.
//
// Retargeted at the UI_REDESIGN §5/§6 markup: /play sets both games up INLINE on the
// mode cards (no dialogs), and the game screen keeps its verbs in one labelled action
// bar with the move list behind the sidebar's "Moves" tab.
import { expect, test } from "@playwright/test";
import {
  abandonActiveGame,
  actionBar,
  chatPanel,
  clerkUsername,
  hasClerkTestUser,
  moveHistory,
  openChatTab,
  openMovesTab,
  playMove,
  resign,
  sanMoves,
  setBoardView,
  signIn,
  square,
  turnIndicator,
  turnPhraseNow,
  hideNextDevOverlay,
} from "./helpers/app";

const PLAYER_TWO = "E2E Rival";

test.describe.configure({ mode: "serial" });

test.describe("authenticated flows", () => {
  test.skip(
    !hasClerkTestUser,
    "Set E2E_CLERK_USER_EMAIL (or E2E_CLERK_USER_USERNAME and E2E_CLERK_USER_PASSWORD) to run these.",
  );

  test.beforeEach(async ({ page }) => {
    await hideNextDevOverlay(page);
    await signIn(page);
  });

  test("a local 2-player game plays, switches view and takes a move back", async ({ page }) => {
    await abandonActiveGame(page);

    // --- create ------------------------------------------------------------
    // §6: the "Pass and play" card carries its own Player 2 field — no dialog.
    await page.getByLabel("Player 2 name").fill(PLAYER_TWO);
    await page.getByRole("button", { name: "Start the game" }).click();

    await expect(page).toHaveURL(/\/game\/[a-z0-9]+$/i);
    // §5.1: the move list is a tab, and it leads in a non-AI game — but ask for it
    // by name rather than relying on that default.
    await openMovesTab(page);
    await expect(moveHistory(page)).toBeVisible();

    // --- 1. e4 on the 2D board --------------------------------------------
    await setBoardView(page, "2D");
    // §5.1: with nothing played yet the pill teaches instead of counting — the
    // first thing a new player needs is what to do, not that it is move 1.
    await expect(turnIndicator(page)).toContainText("Your move — pick a piece");

    await playMove(page, "e2", "e4");

    // `games.makeMove` is a server round trip; wait for the subscription to deliver
    // the move before reading the list synchronously.
    await expect.poll(() => sanMoves(page)).toEqual(["e4"]);
    // The cell is a real control in the list — `MoveList` names it "Move 1, e4".
    await expect(moveHistory(page).getByRole("button", { name: "Move 1, e4" })).toBeVisible();
    // The board itself moved the piece, not just the list: e4 now announces a pawn.
    await expect(square(page, "e4")).toHaveAttribute("aria-label", /white pawn/i);

    // The status pill names whoever is to move; in a local game that is the other
    // seat's name, so it must have changed.
    await expect(turnIndicator(page)).toContainText(`${PLAYER_TWO} to move`);
    // …and the counter half is separable from the name half.
    expect(await turnPhraseNow(page)).toBe(`${PLAYER_TWO} to move`);

    // --- 3D and back, with the game state intact (FR-14) -------------------
    await setBoardView(page, "3D");
    expect(await sanMoves(page)).toEqual(["e4"]);
    await setBoardView(page, "2D");
    expect(await sanMoves(page)).toEqual(["e4"]);
    await expect(turnIndicator(page)).toContainText(`${PLAYER_TWO} to move`);

    // --- take back one half-move (FR-43) -----------------------------------
    const undo = actionBar(page).getByRole("button", { name: "Undo move" });
    await expect(undo).toBeEnabled();
    await undo.click();
    await expect(moveHistory(page).getByText("No moves yet.")).toBeVisible();
    await expect.poll(() => sanMoves(page)).toEqual([]);
    // An empty board again, so the first-move nudge comes back.
    await expect(turnIndicator(page)).toContainText("Your move — pick a piece");

    await resign(page);
  });

  test("an AI game at Beginner gets a reply and a commentary entry", async ({ page }) => {
    await abandonActiveGame(page);

    // --- create ------------------------------------------------------------
    // §6: the personas are chips on the "Play the AI" card. Pip is Beginner, so the
    // submit button ("Play Pip") confirms the selection.
    await page
      .getByRole("group", { name: "Opponent" })
      .getByRole("button", { name: "Pip", exact: true })
      .click();
    const start = page.getByRole("button", { name: "Play Pip" });
    await expect(start).toBeVisible();
    await start.click();

    await expect(page).toHaveURL(/\/game\/[a-z0-9]+$/i);
    await setBoardView(page, "2D");

    // The colour chips default to White, so the player opens — and before the first
    // move the pill says so in the nudge, not in a move counter.
    await expect(turnIndicator(page)).toContainText("Your move — pick a piece");
    // In AI games the board stays locked until the engine worker is ready (Stockfish 18
    // is a 5.6 MB first download), so wait for the squares to enable before moving.
    await expect(square(page, "e2")).toBeEnabled({ timeout: 90_000 });

    await playMove(page, "e2", "e4");
    await expect.poll(() => sanMoves(page), { timeout: 30_000 }).toEqual(["e4"]);

    // --- the AI answers ----------------------------------------------------
    // Stockfish loads in a worker, the agent (or the engine fallback) picks a move,
    // and `games.makeAiMove` writes it plus a commentary row.
    await expect
      .poll(async () => (await sanMoves(page)).length, {
        timeout: 45_000,
        intervals: [500],
        message: "the AI never replied",
      })
      .toBeGreaterThanOrEqual(2);

    // §5.1: commentary is a chat bubble in the Chat tab, not a side panel.
    await openChatTab(page);
    const chat = chatPanel(page);
    await expect(chat.getByText(/will say something once the game is under way/)).toBeHidden();
    await expect(chat.getByTestId("chat-ai-message").first()).toBeVisible({ timeout: 45_000 });

    await resign(page);
  });

  test("settings survive a reload", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();

    const presets = page.getByRole("group", { name: "Room preset" });
    await expect(presets).toBeVisible();
    const presetButtons = presets.getByRole("button");
    const presetCount = await presetButtons.count();
    expect(presetCount).toBeGreaterThan(1);

    // Pick whichever preset is not the current one, so the test is repeatable.
    let targetIndex = -1;
    for (let i = 0; i < presetCount; i += 1) {
      if ((await presetButtons.nth(i).getAttribute("aria-pressed")) !== "true") {
        targetIndex = i;
        break;
      }
    }
    expect(targetIndex, "every room preset reported itself as selected").toBeGreaterThan(-1);
    await presetButtons.nth(targetIndex).click();
    await expect(presetButtons.nth(targetIndex)).toHaveAttribute("aria-pressed", "true");

    const flip = page.getByRole("switch", { name: "Flip the board between turns" });
    const wasChecked = await flip.getAttribute("aria-checked");
    await flip.click();
    const nowChecked = wasChecked === "true" ? "false" : "true";
    await expect(flip).toHaveAttribute("aria-checked", nowChecked);

    // `players.updateSettings` is debounced by 400 ms (use-settings-sync.ts).
    await page.waitForTimeout(2_000);
    await page.reload();

    await expect(presets).toBeVisible();
    await expect(presets.getByRole("button").nth(targetIndex)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByRole("switch", { name: "Flip the board between turns" })).toHaveAttribute(
      "aria-checked",
      nowChecked,
    );
  });

  test("the profile page renders for the signed-in player", async ({ page }) => {
    const username = await clerkUsername(page);

    await page.goto(`/profile/${encodeURIComponent(username)}`);

    await expect(page.getByRole("heading", { level: 1, name: username })).toBeVisible();
    await expect(page.getByText("Playing since")).toBeVisible();
    // The stat tiles are a <dl>; scope to its <dt>s, because the sparkline's pool
    // buttons carry the same "vs Humans" / "vs AI" text.
    for (const stat of ["Overall", "vs Humans", "vs AI", "Record"]) {
      await expect(page.getByRole("term").filter({ hasText: new RegExp(`^${stat}$`) })).toBeVisible();
    }
  });
});
