import { expect, test } from "@playwright/test";
import { hideNextDevOverlay } from "./helpers/app";

test("matchmaking chat sends from the sidebar and preserves drafts in fullscreen", async ({ page }) => {
  await hideNextDevOverlay(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dev/game?scenario=online-draw-offer");
  await expect(page.getByRole("tab", { name: "Chat", exact: true })).toHaveAttribute("aria-selected", "true");
  const composer = page.getByLabel("Message your opponent");
  await composer.fill("Good luck!");
  await composer.press("Enter");
  await expect(page.getByLabel("Conversation with adrienne").getByText("Good luck!", { exact: true })).toBeVisible();
  await expect(composer).toHaveValue("");

  await composer.fill("A draft to keep");
  await page.evaluate(() => { document.documentElement.requestFullscreen = async () => {}; });
  await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
  await page.getByRole("button", { name: "Chat", exact: true }).click();
  await expect(composer).toHaveValue("A draft to keep");
  await composer.fill("Good game!");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByLabel("Conversation with adrienne").getByText("Good game!", { exact: true })).toBeVisible();
  await expect(composer).toHaveValue("");
  await page.getByRole("button", { name: "Exit fullscreen", exact: true }).click();
  await page.getByRole("tab", { name: "Info", exact: true }).click();
  await expect(page.getByRole("button", { name: "Copy game moves", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download game (.pgn)", exact: true })).toBeVisible();
});

test("matchmaking chat is usable in the phone game panel", async ({ page }) => {
  await hideNextDevOverlay(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dev/game?scenario=online-draw-offer");
  await page.getByRole("button", { name: /Open the game panel/ }).click();
  const panel = page.getByRole("dialog", { name: "Game panel", exact: true });
  const composer = panel.getByLabel("Message your opponent");
  await composer.fill("Hello from mobile");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(panel.getByLabel("Conversation with adrienne").getByText("Hello from mobile", { exact: true })).toBeVisible();
});
