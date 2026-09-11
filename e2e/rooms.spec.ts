import { expect, test } from "@playwright/test";
import { ROOMS, ROOM_ORDER } from "../src/lib/rooms";
import { hideNextDevOverlay } from "./helpers/app";

const IS_LOCAL = /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:|\/|$)/.test(
  process.env.E2E_BASE_URL || "http://localhost:3000",
);

for (const id of ROOM_ORDER) {
  test(`2D keeps ${id}'s squares, pieces, highlights, and surrounding room`, async ({ page }) => {
    test.skip(!IS_LOCAL, "Room inspection links are development-only");
    await hideNextDevOverlay(page);
    await page.goto(`/dev/game?scenario=tutor-pro&view=2d&room=${id}`);
    const board = page.locator(`[data-board-room="${id}"]`);
    await expect(board).toBeVisible();
    await expect(page.locator(`[data-room-atmosphere="${id}"]`)).toBeVisible();
    const room = ROOMS[id];
    const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
    await expect(board.locator('[data-square="a8"]')).toHaveCSS("background-color", rgb(room.board.lightSquare));
    await expect(board.locator('[data-square="a1"]')).toHaveCSS("background-color", rgb(room.board.darkSquare));
    const fills = await board.locator('[data-piece] svg g').evaluateAll((nodes) =>
      [...new Set(nodes.map((node) => getComputedStyle(node).fill))],
    );
    expect(fills).toEqual(expect.arrayContaining([rgb(room.pieces.white.color), rgb(room.pieces.black.color)]));
    expect(await board.evaluate((node) => getComputedStyle(node).getPropertyValue("--board-select").trim())).toBe(room.highlight.select);
    await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
    await expect(board).toBeVisible();
    await expect(page.locator(`[data-room-atmosphere="${id}"]`)).toBeVisible();
    expect(await board.getAttribute("data-board-room")).toBe(id);
  });
}

test("room settings stay beside the board on desktop and fit the mobile screen", async ({ page }) => {
  test.skip(!IS_LOCAL, "The game harness is development-only");
  await hideNextDevOverlay(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dev/game?scenario=tutor-pro&view=2d");
  await page.getByRole("button", { name: "Room", exact: true }).click();
  const panel = page.getByTestId("room-settings-panel");
  await expect(panel).toHaveCSS("width", "448px");
  await expect(panel).toHaveCSS("height", "876px");
  await expect(page.locator('[data-slot="drawer-overlay"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Close board and room settings" }).click();
  await expect(panel).toBeHidden();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "More game actions" }).click();
  await page.getByRole("button", { name: "Room", exact: true }).click();
  await expect(panel).toHaveCSS("width", "390px");
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  expect(box?.height).toBeLessThan(844);
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
});
