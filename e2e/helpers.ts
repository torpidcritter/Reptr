import { expect, type Page } from "@playwright/test";

/**
 * Discards the workout open on this page and waits until the server has it too. The
 * device sends changes a moment later, so a test that ends right after the click can
 * leave the workout active for the next test.
 */
export async function discardWorkout(page: Page) {
  await page.getByRole("button", { name: "Discard workout" }).click();
  await page
    .getByRole("dialog", { name: "Discard this workout?" })
    .getByRole("button", { name: "Discard" })
    .click();
  await page.waitForURL(/\/train/);
  await page.goto("/workout");
  await expect(page.getByRole("button", { name: "Start empty workout" })).toBeVisible({
    timeout: 15_000,
  });
}
