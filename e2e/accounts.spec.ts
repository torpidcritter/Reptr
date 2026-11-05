import { expect, test } from "@playwright/test";
import { freshUserId, otherUserId } from "./env";

// A brand-new account starts clean, and one person never sees another's data.

const actAs = (id: string) => ({
  name: "reptr-e2e-user",
  value: id,
  domain: "localhost",
  path: "/",
});

test("a new account goes through onboarding and starts empty", async ({ page, context }) => {
  await context.addCookies([actAs(freshUserId)]);
  await page.goto("/");
  await page.waitForURL(/\/onboarding$/);

  await page.getByLabel("Your name").fill("Alex");
  await page.getByLabel("Height (cm)").fill("175");
  await page.getByLabel("Weight (kg)").fill("70.5");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Build muscle").click();
  await page.getByRole("button", { name: "Continue" }).click();
  for (const d of ["Mo", "Th"]) await page.getByText(d, { exact: true }).click();
  await page.getByRole("button", { name: "Start using Reptr" }).click();
  await page.waitForURL(/\/$/);

  // Their weight is their first weigh-in, and there's no sample training anywhere.
  await expect(page.getByText("70.5 kg").first()).toBeVisible();
  await page.goto("/history");
  await expect(page.getByText("Completed workouts will appear here")).toBeVisible();
});

test("people only ever see their own data", async ({ page, context }) => {
  // The default test user can't see the other person's workout or weight.
  await page.goto("/history");
  await expect(page.getByRole("heading", { name: "Workout history" })).toBeVisible();
  await expect(page.getByText("Robin private session")).toHaveCount(0);
  await page.goto("/physique");
  await expect(page.getByText("111.1")).toHaveCount(0);

  // As that person, it's there.
  await context.addCookies([actAs(otherUserId)]);
  await page.goto("/history");
  await expect(page.getByText("Robin private session")).toBeVisible();
});
