import { expect, test, type Page } from "@playwright/test";

/**
 * Home's widgets (D-141): the default layout, customizing it (add, configure,
 * move, remove, undo, drag), keeping it across reloads and tabs, and the reset.
 * Every test starts and ends on the default layout, which other specs expect.
 */

const widget = (page: Page, type: string) => page.getByTestId(`widget-${type}`);
const zone = (page: Page, z: "top" | "main" | "side") => page.getByTestId(`zone-${z}`);

async function openHome(page: Page) {
  await page.goto("/vtk/home");
  await expect(page.locator("html[data-realtime]")).toBeAttached();
}

async function customize(page: Page) {
  // A click that lands before Home hydrates does nothing; try again until it does.
  await expect(async () => {
    const button = page.getByTestId("home-customize");
    if (await button.isVisible()) await button.click();
    await expect(page.getByTestId("home-edit")).toBeVisible({ timeout: 1_000 });
  }).toPass();
}

/** Back to the default layout (also cleans up after a failed run). */
async function resetHome(page: Page) {
  await openHome(page);
  if (!(await page.getByTestId("home-edit").isVisible())) await customize(page);
  const reset = page.getByTestId("home-reset");
  if (await reset.isEnabled()) {
    await reset.click();
    await expect(reset).toBeDisabled();
  }
  await page.getByTestId("home-done").click();
  await expect(page.locator("html:not([data-saving])")).toBeAttached();
}

async function widgetMenu(page: Page, type: string) {
  await widget(page, type).getByTestId("widget-menu").click();
}

test.beforeEach(async ({ page }) => resetHome(page));
test.afterEach(async ({ page }) => resetHome(page));

test("the default Home puts notes first and today's work on the side", async ({ page }) => {
  await openHome(page);
  await expect(widget(page, "pinnedNotes")).toBeVisible();
  await expect(widget(page, "recentNotes")).toBeVisible();
  await expect(widget(page, "today")).toBeVisible();
  await expect(widget(page, "todos")).toBeVisible();
  await expect(widget(page, "inbox")).toBeVisible();
  // The week calendar is no longer on the default Home.
  await expect(widget(page, "week")).toHaveCount(0);

  await customize(page);
  await expect(zone(page, "main").locator("[data-widget-id]")).toHaveCount(2);
  await expect(zone(page, "side").getByTestId("widget-today")).toBeVisible();
  await expect(page.getByTestId("home-reset")).toBeDisabled();
});

test("customizing: add, configure, move, remove with undo, and it all persists", async ({
  page,
}) => {
  await openHome(page);
  await customize(page);

  // A one-off widget goes straight in, at the end of its default zone.
  await page.getByTestId("home-add-widget").click();
  const dialog = page.getByTestId("add-widget-dialog");
  await expect(dialog.getByTestId("catalog-todos")).toBeDisabled();
  await dialog.getByTestId("catalog-week").click();
  await expect(zone(page, "top").getByTestId("widget-week")).toBeVisible();

  // A widget that needs a choice asks for it first.
  await page.getByTestId("home-add-widget").click();
  await dialog.getByTestId("catalog-taggedNotes").click();
  await expect(dialog.getByTestId("add-widget-confirm")).toBeDisabled();
  await dialog.getByRole("option").filter({ hasText: "network" }).first().click();
  await dialog.getByTestId("add-widget-confirm").click();
  await expect(zone(page, "main").getByTestId("widget-taggedNotes")).toContainText("#network");

  // Settings: recent notes shows four cards at most.
  await widgetMenu(page, "recentNotes");
  await page.getByRole("menuitem", { name: "Settings…" }).click();
  await page.getByTestId("widget-settings").getByTestId("count-4").click();
  await page.getByTestId("widget-settings-save").click();

  // Move from the menu: the inbox to the main column.
  await widgetMenu(page, "inbox");
  await page.getByRole("menuitem", { name: "Move to" }).click();
  await page.getByTestId("move-to-main").click();
  await expect(zone(page, "main").getByTestId("widget-inbox")).toBeVisible();

  // Remove, then undo from the toast.
  await widgetMenu(page, "todos");
  await page.getByRole("menuitem", { name: "Remove" }).click();
  await expect(widget(page, "todos")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(zone(page, "side").getByTestId("widget-todos")).toBeVisible();

  await page.getByTestId("home-done").click();
  await expect(page.locator("html:not([data-saving])")).toBeAttached();

  // A reload keeps it all.
  await openHome(page);
  await expect(widget(page, "week")).toBeVisible();
  await expect(widget(page, "taggedNotes")).toContainText("#network");
  await expect(widget(page, "recentNotes").getByTestId("note-card")).not.toHaveCount(0);
  expect(await widget(page, "recentNotes").getByTestId("note-card").count()).toBeLessThanOrEqual(4);
  await customize(page);
  await expect(zone(page, "main").getByTestId("widget-inbox")).toBeVisible();
  await expect(page.getByTestId("home-reset")).toBeEnabled();
});

test("dragging a widget by its handle moves it to another column", async ({ page }) => {
  await openHome(page);
  await customize(page);
  const handle = widget(page, "today").getByTestId("widget-handle");
  const target = widget(page, "pinnedNotes");
  const from = await handle.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("no layout boxes");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  // Small steps first: the pointer sensor starts dragging after 4 px.
  await page.mouse.move(from.x + 10, from.y + 10, { steps: 4 });
  await page.mouse.move(to.x + to.width / 2, to.y + 12, { steps: 20 });
  await page.mouse.up();
  await expect(zone(page, "main").locator("[data-widget-id]").first()).toHaveAttribute(
    "data-testid",
    "widget-today",
  );
  await expect(page.locator("html:not([data-saving])")).toBeAttached();
  await openHome(page);
  await customize(page);
  await expect(zone(page, "main").locator("[data-widget-id]").first()).toHaveAttribute(
    "data-testid",
    "widget-today",
  );
});

test("a change in one tab shows up in the other without a reload", async ({ page, context }) => {
  await openHome(page);
  const other = await context.newPage();
  await openHome(other);
  await expect(widget(other, "week")).toHaveCount(0);

  await customize(page);
  await page.getByTestId("home-add-widget").click();
  await page.getByTestId("add-widget-dialog").getByTestId("catalog-week").click();
  await expect(widget(page, "week")).toBeVisible();

  await expect(widget(other, "week")).toBeVisible();
  await other.close();
});
