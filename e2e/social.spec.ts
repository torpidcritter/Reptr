import { expect, type BrowserContext, type Page, test } from "@playwright/test";
import { otherUserId } from "./env";

// Two people find each other, follow (with a request, since one is private), share a
// workout, like and comment on it, and then one blocks the other.

const actAs = (id: string) => ({
  name: "reptr-e2e-user",
  value: id,
  domain: "localhost",
  path: "/",
});

async function setUpProfile(page: Page, handle: string, visibility: "Public" | "Private") {
  await page.goto("/social/profile");
  await page.getByLabel("Handle").fill(handle);
  await page.getByText(visibility, { exact: true }).click();
  await page.getByRole("button", { name: "Create profile" }).click();
  await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
}

test("two people follow each other, share, like, comment and block", async ({
  page: sam,
  browser,
}) => {
  test.setTimeout(120_000);
  let robinContext: BrowserContext | undefined;
  try {
    robinContext = await browser.newContext();
    await robinContext.addCookies([actAs(otherUserId)]);
    const robin = await robinContext.newPage();

    // Social is opt-in: until a profile exists, nobody can find you.
    await sam.goto("/social");
    await expect(sam.getByRole("link", { name: "Set up your profile" })).toBeVisible();

    await setUpProfile(sam, "sam_lifts", "Public");
    await setUpProfile(robin, "robin_r", "Private");

    // Robin is private, so Sam has to ask.
    await sam.goto("/social/search?q=robin");
    await sam.getByRole("button", { name: "Ask to follow @robin_r" }).click();
    await expect(sam.getByRole("button", { name: /Requested/ })).toBeVisible();

    await robin.goto("/social/requests");
    await robin.getByRole("button", { name: "Accept @sam_lifts" }).click();
    await expect(robin.getByRole("button", { name: "Accept @sam_lifts" })).toBeHidden();

    // Robin shares a finished workout with followers.
    await robin.goto("/history");
    await robin.getByText("Robin private session").first().click();
    await robin.waitForURL(/\/history\/[0-9a-f-]{36}$/);
    await robin.getByRole("button", { name: "Share" }).click();
    await robin.getByLabel("Caption (optional)").fill("Easy day");
    await robin.getByLabel("Who can see it").selectOption("followers");
    await robin
      .getByRole("dialog", { name: "Share workout" })
      .getByRole("button", { name: "Share" })
      .click();
    await expect(robin.getByRole("button", { name: "Shared" })).toBeVisible();

    // Sam sees it in the feed, without Robin's private numbers, and likes and comments.
    await sam.goto("/social");
    await expect(sam.getByText("Robin private session")).toBeVisible();
    await expect(sam.getByText("Easy day")).toBeVisible();
    await expect(sam.getByText("111.1")).toHaveCount(0);
    await sam.getByRole("button", { name: "Like" }).click();
    await expect(sam.getByRole("button", { name: "Unlike" })).toBeVisible();
    await sam.getByRole("link", { name: /comments/ }).click();
    await sam.waitForURL(/\/social\/post\//);
    const postUrl = sam.url();
    await sam.getByPlaceholder("Add a comment").fill("Nice work");
    await sam.getByRole("button", { name: "Comment", exact: true }).click();
    // The box empties once the server has saved it.
    await expect(sam.getByPlaceholder("Add a comment")).toHaveValue("");
    await expect(sam.getByRole("listitem").getByText("Nice work")).toBeVisible();

    await robin.goto(postUrl);
    await expect(robin.getByText("Nice work")).toBeVisible();

    // Robin blocks Sam: they disappear from each other, and the follow ends.
    await robin.goto("/u/sam_lifts");
    await robin.getByRole("button", { name: "More options" }).click();
    await robin
      .getByRole("dialog", { name: "@sam_lifts" })
      .getByRole("button", { name: "Block" })
      .click();
    await robin
      .getByRole("dialog", { name: "Block @sam_lifts?" })
      .getByRole("button", { name: "Block" })
      .click();
    await robin.waitForURL(/\/social/);

    await sam.goto("/u/robin_r");
    await expect(sam.getByText("This page could not be found.")).toBeVisible();
    await sam.goto("/social");
    await expect(sam.getByText("Robin private session")).toHaveCount(0);
    await sam.goto(postUrl);
    await expect(sam.getByText("Nice work")).toHaveCount(0);
  } finally {
    await robinContext?.close();
  }
});
