import { expect, type Browser, type Page, test } from "@playwright/test";
import { kimUserId, leeUserId } from "./env";

// Leaderboards, groups, challenges, notifications and the report queue, with two people
// (Kim, who has a finished workout, and Lee) and the default user as moderator.

async function as(browser: Browser, id: string) {
  const context = await browser.newContext();
  await context.addCookies([{ name: "reptr-e2e-user", value: id, domain: "localhost", path: "/" }]);
  return { context, page: await context.newPage() };
}

async function setUpProfile(page: Page, handle: string) {
  await page.goto("/social/profile");
  // The handle is the username from the person's profile.
  await expect(page.getByText(`@${handle}`)).toBeVisible();
  await page.getByText("Public", { exact: true }).click();
  await expect(page.getByLabel(/Show me on leaderboards/)).toBeChecked();
  await page.getByRole("button", { name: "Create profile" }).click();
  await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
}

test("groups, a group challenge, leaderboards, notifications and moderation", async ({
  browser,
  page: moderator,
}) => {
  test.setTimeout(150_000);
  const kim = await as(browser, kimUserId);
  const lee = await as(browser, leeUserId);
  try {
    await setUpProfile(kim.page, "kim_k");
    await setUpProfile(lee.page, "lee_l");

    // Kim's saved workout puts her on the board; the score comes from the server.
    await kim.page.goto("/leaderboards?scope=global&cat=workouts&period=week");
    const standings = kim.page.getByRole("list", { name: "Standings" });
    await expect(standings.getByRole("listitem")).toHaveCount(1);
    await expect(standings.getByText("@kim_k")).toBeVisible();
    await kim.page.getByRole("link", { name: "Volume" }).click();
    await expect(standings.getByText("960 kg")).toBeVisible();

    // A private group, joined with its invite code.
    await kim.page.goto("/groups/new");
    await kim.page.getByLabel("Name").fill("Lunch lifters");
    await kim.page.getByRole("button", { name: "Create group" }).click();
    await kim.page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);
    const groupUrl = kim.page.url();
    const code = (await kim.page.locator("code").textContent())!.trim();

    await lee.page.goto("/groups");
    await lee.page.getByLabel("Have an invite code?").fill(code);
    await lee.page.getByRole("button", { name: "Join", exact: true }).click();
    await lee.page.waitForURL(groupUrl);
    await expect(lee.page.getByText("@kim_k")).toBeVisible();
    await expect(lee.page.locator("code")).toHaveCount(0);

    // Kim hears about it.
    await kim.page.goto("/");
    await expect(kim.page.getByRole("link", { name: /Notifications, \d+ unread/ })).toBeVisible();
    await kim.page.goto("/notifications");
    await expect(kim.page.getByText("@lee_l joined Lunch lifters")).toBeVisible();

    // A group challenge, with standings from saved workouts.
    await kim.page.goto(groupUrl);
    await kim.page.getByRole("link", { name: "Start a group challenge" }).click();
    await kim.page.getByLabel("Title").fill("Lunch week");
    await kim.page.getByLabel(/^Target/).fill("3");
    await expect(kim.page.getByLabel("Who can join")).toHaveValue("group");
    await kim.page.getByRole("button", { name: "Create challenge" }).click();
    await kim.page.waitForURL(/\/challenges\/[0-9a-f-]{36}$/);
    const challengeUrl = kim.page.url();
    await expect(kim.page.getByText("1 workout", { exact: true })).toBeVisible();

    await lee.page.goto(challengeUrl);
    await lee.page.getByRole("button", { name: "Join challenge" }).click();
    const board = lee.page.getByRole("list", { name: "Standings" });
    await expect(board.getByRole("listitem")).toHaveCount(2);
    await expect(board.getByRole("listitem").first()).toContainText("@kim_k");

    await lee.page.goto("/challenges");
    await expect(lee.page.getByText("Lunch week")).toBeVisible();
    // This month's seasonal challenge is open to everyone.
    await expect(lee.page.getByText(/consistency/)).toBeVisible();

    // Kim reports Lee; the moderator keeps Lee off the boards and the report closes.
    await kim.page.goto("/u/lee_l");
    await kim.page.getByRole("button", { name: "More options" }).click();
    await kim.page
      .getByRole("dialog", { name: "@lee_l" })
      .getByRole("button", { name: "Report" })
      .click();
    await kim.page.getByLabel("What's wrong?").selectOption("cheating");
    await kim.page.getByRole("button", { name: "Send report" }).click();
    await expect(
      kim.page.getByText("Thanks. It will be reviewed.", { exact: false }),
    ).toBeVisible();

    await moderator.goto("/admin/reports");
    await expect(moderator.getByRole("link", { name: "@lee_l" })).toBeVisible();
    await moderator.getByRole("button", { name: "Keep off boards" }).click();
    await moderator
      .getByRole("dialog", { name: "Keep off boards?" })
      .getByRole("button", { name: "Keep off boards" })
      .click();
    await expect(moderator.getByText("All clear")).toBeVisible();

    // The sanctions list lifts it again without another report.
    const sanctions = moderator.getByRole("list", { name: "Sanctions" });
    await expect(sanctions.getByText("off boards")).toBeVisible();
    await sanctions.getByRole("button", { name: "Put back on boards" }).click();
    await moderator
      .getByRole("dialog", { name: "Put back on boards for @lee_l?" })
      .getByRole("button", { name: "Put back on boards" })
      .click();
    await expect(moderator.getByText("Nobody.")).toBeVisible();

    // Beta metrics: counts for the moderator.
    await moderator.getByRole("link", { name: "Beta metrics" }).click();
    await expect(moderator.getByRole("heading", { name: "Coming back" })).toBeVisible();
    await expect(moderator.getByText("Trained in the last 7 days")).toBeVisible();

    // Nobody else can open the queue or the metrics.
    const res = await lee.page.goto("/admin/reports");
    await expect(lee.page.getByText("This page could not be found.")).toBeVisible();
    expect(res).not.toBeNull();
    await lee.page.goto("/admin/metrics");
    await expect(lee.page.getByText("This page could not be found.")).toBeVisible();
  } finally {
    await kim.context.close();
    await lee.context.close();
  }
});
