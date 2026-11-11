import { expect, test } from "@playwright/test";

// No sign-in: a new visitor creates a profile, stays in it across reloads, edits it,
// removes it from the browser and opens it again with the profile key.

test.beforeEach(async ({ context }) => {
  // Use the real profile cookie, as a visitor would, instead of the fixed test user.
  await context.addCookies([
    { name: "reptr-e2e-user", value: "profile", domain: "localhost", path: "/" },
  ]);
});

test("create a profile, keep it across reloads, edit it, remove it and open it again", async ({
  page,
}) => {
  test.setTimeout(120_000);

  // Anyone without a profile lands on "Let's create your profile.", never a sign-in page.
  await page.goto("/");
  await expect(page).toHaveURL(/\/create-profile$/);
  await expect(page.getByRole("heading", { name: "Let’s create your profile." })).toBeVisible();
  await page.goto("/login");
  await expect(page).toHaveURL(/\/create-profile$/);

  // Empty fields get clear messages.
  await page.getByRole("button", { name: "Create Profile" }).click();
  await expect(page.getByText("Enter your name.")).toBeVisible();
  await expect(page.getByText("Choose a username.")).toBeVisible();

  // Bad usernames are explained as you type.
  const username = page.getByLabel("Username");
  await username.fill("sam lifts!");
  await username.blur();
  await expect(page.getByText(/Use only letters, numbers and underscores/)).toBeVisible();
  // Someone already has this one (in any case).
  await username.fill("Sam_Lifts");
  await expect(page.getByText("That username is taken. Pick another.")).toBeVisible();

  await page.getByLabel("Full name").fill("  Alex Rivera  ");
  await username.fill("  Alex_R  ");
  await expect(page.getByText("@alex_r is free.")).toBeVisible();
  await page.getByLabel("Email (optional)").fill("not-an-email");
  await page.getByLabel("Bio (optional)").fill("Squats on Sundays");
  await page.getByRole("button", { name: "Create Profile" }).click();
  await expect(page.getByText("Enter a valid email, or leave it blank.")).toBeVisible();
  await page.getByLabel("Email (optional)").fill("");
  await page.getByRole("button", { name: "Create Profile" }).click();

  // Success, with the profile key shown once.
  await expect(page.getByText("Profile created")).toBeVisible();
  await expect(page.getByText("@alex_r")).toBeVisible();
  const key = (await page.getByTestId("profile-key").textContent())!.trim();
  expect(key).toMatch(/^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/);

  // Then the usual setup, which can be skipped.
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page).toHaveURL(/\/$/);

  // A reload, or opening the app again, keeps the same profile: no new one is made.
  await page.reload();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/create-profile");
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Alex Rivera" })).toBeVisible();
  await expect(page.getByText("@alex_r").first()).toBeVisible();

  // Edit the profile. A taken username is refused; a free one is saved everywhere.
  await page.getByLabel("Username").fill("robin_r");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("That username is taken. Pick another.")).toBeVisible();
  await page.getByLabel("Full name").fill("Alex R");
  await page.getByLabel("Username").fill("alex_lifts");
  await page.getByLabel("Bio (optional)").fill("Deadlifts too");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("status").getByText("Saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Alex R" })).toBeVisible();
  await expect(page.getByText("@alex_lifts").first()).toBeVisible();
  await page.goto("/social/profile");
  await expect(page.getByText("@alex_lifts")).toBeVisible();
  await expect(page.getByText("Deadlifts too")).toBeVisible();

  // The app still works as before.
  await page.goto("/train");
  await expect(page).toHaveURL(/\/train$/);

  // Remove the profile from this browser, with a confirmation.
  await page.goto("/profile");
  await page.getByRole("button", { name: "Remove profile from this device" }).click();
  const dialog = page.getByRole("dialog", { name: "Remove your profile from this device?" });
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await page.getByRole("button", { name: "Remove profile from this device" }).click();
  await dialog.getByRole("button", { name: "Remove from this device" }).click();
  await expect(page).toHaveURL(/\/create-profile$/);
  await expect(page.getByRole("heading", { name: "Let’s create your profile." })).toBeVisible();

  // A wrong key is refused; the right one opens the same profile.
  await page.getByText("Already have a profile? Open it with your profile key").click();
  await page.getByLabel("Profile key").fill("AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-GGGG-HHHH");
  await page.getByRole("button", { name: "Open my profile" }).click();
  await expect(page.getByText(/didn't match a profile/)).toBeVisible();
  await page.getByLabel("Profile key").fill(key.toLowerCase());
  await page.getByRole("button", { name: "Open my profile" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Alex R" })).toBeVisible();
});
