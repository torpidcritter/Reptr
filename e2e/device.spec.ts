import { expect, test, type Page } from "@playwright/test";
import { otherUserId } from "./env";

// What a device keeps: one account's workout never shows up for another account on the
// same browser, and sets logged on a phone after the workout was finished on another
// device are kept and can be saved, never dropped.

const actAs = (id: string) => ({
  name: "reptr-e2e-user",
  value: id,
  domain: "localhost",
  path: "/",
});

async function startWithExercise(page: Page, search: string, name: RegExp) {
  await page.goto("/workout");
  await page.getByRole("button", { name: "Start empty workout" }).click();
  await page.getByRole("button", { name: "Add exercise" }).click();
  await page.getByPlaceholder("Search exercises").fill(search);
  await page.getByRole("button", { name }).first().click();
  await page.getByRole("button", { name: "Done" }).first().click();
}

async function logSet(page: Page, n: number, weight: string, reps: string) {
  await page
    .getByLabel("Weight")
    .nth(n - 1)
    .fill(weight);
  await page
    .getByLabel("Reps")
    .nth(n - 1)
    .fill(reps);
  await page.getByRole("button", { name: `Complete set ${n}` }).click();
}

test("another account on the same browser never sees this account's workout", async ({
  page,
  context,
}) => {
  await startWithExercise(page, "barbell curl", /^Barbell Curl/);
  await logSet(page, 1, "30", "10");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  // Someone else signs in on this browser.
  await context.addCookies([actAs(otherUserId)]);
  await page.goto("/workout");
  await expect(page.getByRole("button", { name: "Start empty workout" })).toBeVisible();
  await expect(page.getByText("Barbell Curl")).toHaveCount(0);

  // The first account gets its workout back, untouched.
  await context.clearCookies({ name: "reptr-e2e-user" });
  await page.goto("/workout");
  await expect(page.getByLabel("Weight").first()).toHaveValue("30");

  await page.getByRole("button", { name: "Discard workout" }).click();
  await page
    .getByRole("dialog", { name: "Discard this workout?" })
    .getByRole("button", { name: "Discard" })
    .click();
});

test("sets logged offline after the workout was finished elsewhere are kept and saved", async ({
  page,
  browser,
}) => {
  // The phone starts the workout and logs a set.
  await startWithExercise(page, "goblet squat", /^Goblet Squat/);
  await logSet(page, 1, "24", "8");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  // The laptop (its own browser storage) picks the same workout up.
  const laptopContext = await browser.newContext();
  const laptop = await laptopContext.newPage();
  await laptop.goto("/workout");
  await expect(laptop.getByLabel("Weight").first()).toHaveValue("24");

  // The phone loses signal and logs another set...
  await page.context().setOffline(true);
  await page.getByRole("button", { name: "Add set" }).first().click();
  await logSet(page, 2, "26", "6");
  await expect(page.getByText("Offline, saved on this device")).toBeVisible();

  // ...while the laptop finishes the workout.
  await laptop.getByRole("button", { name: "Finish" }).click();
  await laptop
    .getByRole("dialog", { name: "Finish workout?" })
    .getByRole("button", { name: "Finish" })
    .click();
  await laptop.waitForURL(/\/history\/[0-9a-f-]{36}/);
  await laptopContext.close();

  // Back online, the phone keeps the set and says so instead of dropping it.
  await page.context().setOffline(false);
  const alert = page.getByRole("alert").filter({ hasText: "Some sets weren't saved" });
  await expect(alert).toBeVisible({ timeout: 30_000 });
  await expect(alert).toContainText("1 set");
  await alert.getByRole("button", { name: "Save them as a separate workout" }).click();
  await expect(alert).toHaveCount(0, { timeout: 30_000 });

  await page.goto("/history");
  await expect(page.getByText(/\(this device\)/).first()).toBeVisible();
});
