import { expect, test, type Page } from "@playwright/test";

// Fixing a finished workout, and keeping the workout to one tab at a time so two tabs
// never overwrite each other's sets.

async function startWithExercise(page: Page, search: string, name: RegExp) {
  await page.goto("/workout");
  await page.getByRole("button", { name: "Start empty workout" }).click();
  await page.getByRole("button", { name: "Add exercise" }).click();
  await page.getByPlaceholder("Search exercises").fill(search);
  await page.getByRole("button", { name }).first().click();
  await page.getByRole("button", { name: "Done" }).first().click();
}

test("a finished workout can be corrected and the fix shows in its summary", async ({ page }) => {
  await startWithExercise(page, "dumbbell curl", /^Dumbbell Curl/);
  await page.getByLabel("Weight").first().fill("14");
  await page.getByLabel("Reps").first().fill("10");
  await page.getByRole("button", { name: "Complete set 1" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Finish" }).click();
  await page
    .getByRole("dialog", { name: "Finish workout?" })
    .getByRole("button", { name: "Finish" })
    .click();
  await page.waitForURL(/\/history\/[0-9a-f-]{36}$/);
  await expect(page.getByText(/14 kg × 10 reps/)).toBeVisible();

  await page.getByRole("link", { name: "Correct" }).click();
  await page.waitForURL(/\/edit$/);
  await page.getByLabel("Set 1 weight (kg)").fill("16");
  await page.getByLabel("Set 1 reps").fill("9");
  await page.getByRole("button", { name: "Save correction" }).click();
  await page.waitForURL(/\/history\/[0-9a-f-]{36}$/);
  await expect(page.getByText(/16 kg × 9 reps/)).toBeVisible();
  await expect(page.getByText(/14 kg × 10 reps/)).toHaveCount(0);
});

test("only one tab logs the workout, and another tab can take over", async ({ page }) => {
  await startWithExercise(page, "dumbbell row", /^Dumbbell Row/);
  await page.getByLabel("Weight").first().fill("30");

  // A second tab of the same browser sees the workout is open elsewhere.
  const second = await page.context().newPage();
  await second.goto("/workout");
  await expect(second.getByText("Reptr is open in another tab")).toBeVisible();
  await expect(second.getByLabel("Weight")).toHaveCount(0);

  // Taking over moves the logger to the second tab; the first stops editing.
  await second.getByRole("button", { name: "Continue here" }).click();
  await expect(second.getByLabel("Weight").first()).toBeVisible();
  await expect(page.getByText("Reptr is open in another tab")).toBeVisible();

  await second.getByRole("button", { name: "Discard workout" }).click();
  await second
    .getByRole("dialog", { name: "Discard this workout?" })
    .getByRole("button", { name: "Discard" })
    .click();
  await second.waitForURL(/\/train/);
  // Closing the tab hands the lead back. The first tab picks up whatever the closed tab
  // hadn't sent yet (here, the discard), sends it, and is ready for a new workout.
  await second.close();
  await expect(page.getByRole("button", { name: "Start empty workout" })).toBeVisible({
    timeout: 15_000,
  });
});
