import { expect, test as setup } from "@playwright/test";

export const MEMBER = { email: "bram@dopl.test", password: "dopl-dev-password" };

setup("sign in as a seeded member and ensure the sandbox project", async ({ page }) => {
  await page.goto("/sign-in");
  await page.fill("#email", MEMBER.email);
  await page.fill("#password", MEMBER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/vtk\/home/);

  // Tests write into their own sandbox project so the seeded projects stay clean.
  await page.goto("/vtk/p/E2E/items");
  const exists = await page
    .getByTestId("new-item")
    .waitFor({ timeout: 8_000 })
    .then(() => true)
    .catch(() => false);
  if (!exists) {
    await page.goto("/vtk/projects?new=true");
    await page.fill("#p-name", "E2E sandbox");
    await page.fill("#p-ident", "E2E");
    await page.getByRole("button", { name: "Create project" }).click();
    await page.waitForURL(/\/p\/E2E\/items/);
  }
  // Start from an empty sandbox so leftovers from earlier runs (tests don't
  // clean up after themselves) can't push new items out of view.
  await page.goto("/vtk/p/E2E/items");
  const list = page.getByRole("radio", { name: "List" });
  if ((await list.getAttribute("data-state")) !== "on") await list.click();
  if (
    await page
      .getByTestId("item-row")
      .first()
      .isVisible({ timeout: 3_000 })
      .catch(() => false)
  ) {
    await page.locator("main").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("Meta+a");
    await expect(page.getByTestId("selection-bar")).toBeVisible();
    await page.keyboard.press("Meta+Backspace");
    await expect(page.getByTestId("item-row")).toHaveCount(0, { timeout: 15_000 });
    await expect(page.locator("html:not([data-saving])")).toBeAttached({ timeout: 15_000 });
  }

  await page.context().storageState({ path: "e2e/.auth/member.json" });
});
