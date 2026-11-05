import { expect, test } from "@playwright/test";

// The journeys that matter most: logging training, food and body data, staying safe
// offline, and getting your data back out.

test("log a workout from an empty start to its summary", async ({ page }) => {
  await page.goto("/workout");
  await page.getByRole("button", { name: "Start empty workout" }).click();
  await page.getByRole("button", { name: "Add exercise" }).click();
  await page.getByPlaceholder("Search exercises").fill("barbell bench");
  await page
    .getByRole("button", { name: /^Barbell Bench Press/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Done" }).first().click();

  await page.getByLabel("Weight").first().fill("60");
  await page.getByLabel("Reps").first().fill("8");
  await page.getByRole("button", { name: "Complete set 1" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Finish" }).click();
  await page
    .getByRole("dialog", { name: "Finish workout?" })
    .getByRole("button", { name: "Finish" })
    .click();
  await page.waitForURL(/\/history\/[0-9a-f-]{36}/);
  await expect(page.getByText("Barbell Bench Press").first()).toBeVisible();

  await page.goto("/history");
  await expect(page.getByText("Workout").first()).toBeVisible();
});

test("log food and see it in the day and the weekly report", async ({ page }) => {
  await page.goto("/nutrition");
  await page.getByPlaceholder("What did you eat?").fill("E2E oats");
  await page.getByLabel("Calories").fill("320");
  await page.getByLabel("Protein (g)").fill("12");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("E2E oats").first()).toBeVisible();
  await expect(page.getByText("1 of 7 days logged")).toBeVisible();
});

test("a food logged offline syncs once the connection is back", async ({ page, context }) => {
  await page.goto("/nutrition");
  await context.setOffline(true);
  await page.getByPlaceholder("What did you eat?").fill("E2E offline toast");
  await page.getByLabel("Calories").fill("200");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText(/Saved on this device/)).toBeVisible();
  await expect(page.getByText("1 change waiting to sync")).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText(/waiting to sync/)).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText("E2E offline toast").first()).toBeVisible();
  // Sent once, logged once.
  await page.reload();
  await expect(page.getByText("E2E offline toast", { exact: true })).toHaveCount(1);
});

test("daily check-in saves", async ({ page }) => {
  await page.goto("/recovery");
  await page.getByLabel("Sleep (hours)").fill("7.5");
  await page
    .getByRole("button", { name: /Save check-in|Save/ })
    .first()
    .click();
  await expect(page.getByText("Saved.")).toBeVisible();
});

test("log weight from Today, then edit and delete it", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Log weight" }).click();
  const sheet = page.getByRole("dialog", { name: "Log weight" });
  await sheet.getByLabel("Weight (kg)").fill("81.3");
  await sheet.getByLabel("Note (optional)").fill("e2e morning");
  await sheet.getByRole("button", { name: "Save weight" }).click();
  await expect(sheet).toBeHidden();

  // It persists across a reload and shows on the Body page.
  await page.goto("/physique");
  await page.reload();
  await expect(page.getByText("81.3 kg").first()).toBeVisible();
  await page.getByText(/All weigh-ins/).click();
  await expect(page.getByText(/e2e morning/)).toBeVisible();

  await page
    .getByRole("button", { name: /^Edit weigh-in/ })
    .first()
    .click();
  const edit = page.getByRole("dialog", { name: "Edit weigh-in" });
  await edit.getByLabel("Weight (kg)").fill("80.9");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(edit).toBeHidden();
  await expect(page.getByText("80.9 kg").first()).toBeVisible();

  await page
    .getByRole("button", { name: /^Delete weigh-in/ })
    .first()
    .click();
  await page
    .getByRole("dialog", { name: "Delete this weigh-in?" })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(page.getByText(/e2e morning/)).toHaveCount(0);
});

test("download your data and see it in account activity", async ({ page }) => {
  const res = await page.request.get("/profile/export?format=json");
  expect(res.status()).toBe(200);
  const data = await res.json();
  expect(Object.keys(data)).toEqual(expect.arrayContaining(["workouts"]));

  await page.goto("/profile");
  await expect(page.getByText("Downloaded your data (JSON)")).toBeVisible();
});

test("the plan calendar shows a finished workout on its day", async ({ page }) => {
  await page.goto("/plan");
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Weekly schedule" })).toBeVisible();
});

test("@phone the bottom bar reaches every section", async ({ page }) => {
  await page.goto("/");
  const bar = page.getByRole("navigation").last();
  for (const [name, path] of [
    ["Train", "/train"],
    ["Progress", "/progress"],
    ["Plan", "/plan"],
    ["Coach", "/coach"],
  ]) {
    await bar.getByRole("link", { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(bar.getByRole("link", { name, exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
  }
  // In dev mode the Next.js tools button covers the Today tab, so check its link instead of clicking.
  await expect(bar.getByRole("link", { name: "Today", exact: true })).toHaveAttribute("href", "/");
  await page.getByRole("link", { name: "Profile and settings" }).click();
  await expect(page).toHaveURL(/\/profile$/);
});
