import { expect, test } from "@playwright/test";

// Building a routine with the filtered exercise picker, starting it, and settings that stick.

test("build a routine with picker filters, reopen it and start it", async ({ page }) => {
  await page.goto("/routines/new");
  await page.getByPlaceholder("e.g. Push day").fill("E2E Chest day");
  await page.getByRole("button", { name: "Add exercises" }).click();

  await page.getByLabel("Muscle").selectOption("chest");
  await page.getByLabel("Equipment").selectOption("barbell");
  await expect(page.getByRole("button", { name: /^Barbell Bench Press/ }).first()).toBeVisible();
  // A filter combination with nothing in it says so instead of showing a blank list.
  await page.getByPlaceholder("Search exercises").fill("zzz no such lift");
  await expect(page.getByText("No exercises match")).toBeVisible();
  await page.getByPlaceholder("Search exercises").fill("bench");
  await page
    .getByRole("button", { name: /^Barbell Bench Press/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Done" }).first().click();

  await page.getByRole("button", { name: "Save routine" }).click();
  await page.waitForURL(/\/routines$/);
  await page.reload();
  await expect(page.getByText("E2E Chest day")).toBeVisible();

  await page.getByRole("link", { name: "Edit E2E Chest day" }).click();
  await expect(page.getByText("Barbell Bench Press").first()).toBeVisible();

  await page.goto("/routines");
  const card = page.locator("div", { hasText: "E2E Chest day" }).last();
  await card.getByRole("link", { name: "Start" }).click();
  await expect(page.getByText("Barbell Bench Press").first()).toBeVisible();
  await page.getByRole("button", { name: "Discard workout" }).click();
  await page
    .getByRole("dialog", { name: "Discard this workout?" })
    .getByRole("button", { name: "Discard" })
    .click();
});

test("settings keep training days and turn on optional modules", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Log food" })).toHaveCount(0);

  await page.goto("/profile");
  const days = page.getByRole("group", { name: "Training days" });
  await days.getByText("Mo", { exact: true }).click();
  await days.getByText("We", { exact: true }).click();
  await page.getByLabel(/^Nutrition/).check();
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  // Saving again with nothing changed must not wipe the days.
  await page.reload();
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Mo", exact: true })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "We", exact: true })).toBeChecked();

  await page.goto("/");
  await expect(page.getByRole("link", { name: "Log food" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Check in" })).toHaveCount(0);
});
