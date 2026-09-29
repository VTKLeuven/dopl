import { expect, test } from "@playwright/test";
import { instant } from "@next/playwright";

// Whatever layout the member last used for the project.
const content =
  "[data-testid=item-row], [data-testid=board-card], [data-testid=table-row], [data-testid=timeline-row]";

/**
 * Instant Navigations (D-005): the app shell must render the moment a link is
 * clicked; data streams in afterwards. `instant()` holds back everything that
 * isn't part of the prefetched shell while the callback runs.
 */
test("sidebar navigation to a project renders the shell instantly", async ({ page }) => {
  await page.goto("/vtk/home");
  await expect(page.getByTestId("home-greeting")).toBeVisible();
  await instant(page, async () => {
    await page.click('nav a[href="/vtk/p/INFRA/items"]');
    await page.waitForURL((url) => url.pathname === "/vtk/p/INFRA/items");
    // Shell: sidebar stays, the active item updates, the panel shows its skeleton.
    await expect(page.locator('nav a[href="/vtk/p/INFRA/items"]')).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.locator(content)).toHaveCount(0);
  });
  await expect(page.locator(content).first()).toBeVisible();
});

test("project to project navigation keeps the shell", async ({ page }) => {
  await page.goto("/vtk/p/INFRA/items");
  await expect(page.locator(content).first()).toBeVisible();
  await instant(page, async () => {
    await page.click('nav a[href="/vtk/p/NET/items"]');
    await page.waitForURL((url) => url.pathname === "/vtk/p/NET/items");
    await expect(page.locator('nav a[href="/vtk/p/NET/items"]')).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
  await expect(page.locator(content).first()).toContainText("NET-");
});
