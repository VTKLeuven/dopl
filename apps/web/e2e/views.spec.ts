import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 2 flows: filters, saved views, table, calendar, timeline, palette,
 * bulk undo, shortcuts and realtime. Everything happens in the E2E sandbox and
 * each test puts the layout back to List and clears filters when it's done.
 */
/** Waits until no change is still being written (see UnsavedChangesGuard). */
async function waitForSaved(page: Page) {
  await expect(page.locator("html:not([data-saving])")).toBeAttached();
}

const uniq = () => Math.random().toString(36).slice(2, 7);

async function openSandbox(page: Page, layout = "List") {
  await page.goto("/vtk/p/E2E/items");
  await expect(page.getByTestId("new-item")).toBeVisible();
  const clear = page.getByTestId("filter-bar").getByRole("button", { name: "Clear" });
  if (await clear.isVisible()) await clear.click();
  const radio = page.getByRole("radio", { name: layout });
  if ((await radio.getAttribute("data-state")) !== "on") await radio.click();
}

async function createItem(page: Page, title: string) {
  await page.keyboard.press("c");
  await page.getByRole("textbox", { name: "Issue title" }).fill(title);
  await page.keyboard.press("Meta+Enter");
  await expect(page.getByText(/E2E-\d+ created/)).toBeVisible();
}

/** Next keeps the previous route mounted but hidden; act on what's on screen. */
function visible(page: Page, testId: string) {
  return page.getByTestId(testId).filter({ visible: true });
}

async function backToList(page: Page) {
  await page.getByRole("radio", { name: "List" }).click();
  await page.waitForTimeout(900); // debounced preference save
}

test("filter with a quick filter and a rule; it lives in the URL", async ({ page }) => {
  await openSandbox(page);
  const title = `E2E urgent ${uniq()}`;
  await createItem(page, title);
  const row = page.getByTestId("item-row").filter({ hasText: title });
  await row.hover();
  await page.keyboard.press("p");
  await page.getByRole("option", { name: "Urgent" }).click();

  await page.getByTestId("filter-button").click();
  await page.getByRole("button", { name: "High priority" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("filter-bar")).toContainText("Priority");
  await expect(row).toBeVisible();
  await expect(page).toHaveURL(/[?&]f=/);
  // Every visible row matches, once the filtered list has replaced the old one.
  await expect
    .poll(async () => {
      const labels = await page
        .getByTestId("item-row")
        .locator('button[aria-label^="Priority:"]')
        .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
      return labels.every((p) => p === "Priority: Urgent" || p === "Priority: High");
    })
    .toBe(true);

  await page.reload();
  await expect(page.getByTestId("filter-bar")).toContainText("Priority");
  await page.getByTestId("filter-bar").getByRole("button", { name: "Clear" }).click();
  await expect(page.getByTestId("filter-bar")).toHaveCount(0);
});

test("save filters as a view, change it, reset it, delete it", async ({ page }) => {
  await openSandbox(page);
  await page.getByTestId("filter-button").click();
  await page.getByRole("button", { name: "Unassigned" }).click();
  await page.keyboard.press("Escape");
  await page.getByTestId("save-view").click();
  const name = `E2E view ${uniq()}`;
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Save view" }).last().click();
  await page.waitForURL(/\/p\/E2E\/views\//);
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText(name);

  await visible(page, "done-toggle").click();
  await expect(visible(page, "view-reset")).toBeVisible();
  await visible(page, "view-reset").click();
  await expect(page.getByTestId("view-save").filter({ visible: true })).toHaveCount(0);

  await visible(page, "view-favorite").click();
  await expect(page.getByTestId("sidebar-favorites")).toContainText(name);

  await visible(page, "view-menu").click();
  await page.getByRole("menuitem", { name: "Delete view" }).click();
  await page.waitForURL(/\/p\/E2E\/views$/);
  await expect(page.getByTestId("views-list").or(page.getByText("No views yet"))).toBeVisible();
  await expect(page.getByText(name).filter({ visible: true })).toHaveCount(0);
  // The pre-view filter stays on the items page; clear it.
  await openSandbox(page);
});

test("edit a cell in the table view", async ({ page }) => {
  await openSandbox(page);
  const title = `E2E table ${uniq()}`;
  await createItem(page, title);
  await page.getByRole("radio", { name: "Table" }).click();
  const row = page.getByTestId("table-row").filter({ hasText: title });
  await expect(row).toBeVisible();
  await row.locator("[data-col=priority] button").click();
  await page.getByRole("option", { name: "Medium" }).click();
  await expect(row.locator("[data-col=priority]")).toContainText("Medium");
  await page.waitForTimeout(900); // the layout preference saves after a short debounce
  await waitForSaved(page);
  await page.reload();
  await expect(
    page.getByTestId("table-row").filter({ hasText: title }).locator("[data-col=priority]"),
  ).toContainText("Medium");
  await backToList(page);
});

test("schedule an item by dragging it from the tray onto the calendar", async ({ page }) => {
  await openSandbox(page);
  const title = `E2E cal ${uniq()}`;
  await createItem(page, title);
  await page.getByRole("radio", { name: "Calendar" }).click();
  const chip = page.getByTestId("calendar-tray").getByTestId("calendar-chip").filter({
    hasText: title,
  });
  await chip.scrollIntoViewIfNeeded();
  await expect(chip).toBeVisible();
  // An empty day, so the chip can't end up behind "+N more".
  const day = page
    .getByTestId("calendar-day")
    .filter({ hasNot: page.getByTestId("calendar-chip") })
    .nth(8);
  const date = await day.getAttribute("data-date");
  const from = await chip.boundingBox();
  const to = await day.boundingBox();
  if (!from || !to) throw new Error("no boxes");
  await page.mouse.move(from.x + 30, from.y + 10);
  await page.mouse.down();
  await page.mouse.move(from.x + 50, from.y + 20, { steps: 4 });
  await page.mouse.move(to.x + 40, to.y + 50, { steps: 12 });
  await page.mouse.up();
  await expect(
    page.locator(`[data-testid=calendar-day][data-date="${date}"]`).getByText(title),
  ).toBeVisible();
  await backToList(page);
});

test("the timeline shows scheduled items and today", async ({ page }) => {
  await openSandbox(page);
  await page.getByRole("radio", { name: "Timeline" }).click();
  await expect(page.getByTestId("timeline")).toBeVisible();
  await expect(page.getByTestId("today-line")).toBeVisible();
  await expect(page.getByTestId("timeline-row").first()).toBeVisible();
  await backToList(page);
});

test("change priority from the command palette", async ({ page }) => {
  await openSandbox(page);
  const title = `E2E palette ${uniq()}`;
  await createItem(page, title);
  const row = page.getByTestId("item-row").filter({ hasText: title });
  const identifier = (await row.innerText()).match(/E2E-\d+/)?.[0] ?? "";
  await page.keyboard.press("Meta+k");
  await page.keyboard.type(identifier);
  await expect(page.getByTestId("palette-item").first()).toContainText(identifier);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.type("priority");
  await expect(page.getByRole("option", { name: /Change priority/ })).toBeVisible();
  await page.keyboard.press("Enter");
  await page.keyboard.type("low");
  await expect(page.getByRole("option", { name: "Low", exact: true })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(row.locator('button[aria-label="Priority: Low"]')).toBeVisible();
});

test("bulk-change two items and undo it", async ({ page }) => {
  await openSandbox(page);
  const tag = uniq();
  await createItem(page, `E2E bulk a ${tag}`);
  await createItem(page, `E2E bulk b ${tag}`);
  const rows = page.getByTestId("item-row").filter({ hasText: `E2E bulk` }).filter({
    hasText: tag,
  });
  await expect(rows).toHaveCount(2);
  for (const i of [0, 1]) {
    await rows.nth(i).hover();
    await page.keyboard.press("x");
  }
  const bar = page.getByTestId("selection-bar");
  await expect(bar).toContainText("2 selected");
  await bar.getByRole("button", { name: /^Priority/ }).click();
  await page.getByRole("option", { name: "Urgent" }).click();
  await expect(rows.locator('button[aria-label="Priority: Urgent"]')).toHaveCount(2);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(rows.locator('button[aria-label="Priority: No priority"]')).toHaveCount(2);
  await page.keyboard.press("Escape");
});

test("? shows the shortcuts and g p goes to projects", async ({ page }) => {
  await openSandbox(page);
  await page.keyboard.press("?");
  await expect(page.getByTestId("shortcuts-overlay")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("g");
  await page.keyboard.press("p");
  await page.waitForURL(/\/vtk\/projects$/);
});

test("changes from another tab appear without a reload", async ({ page, context }) => {
  await openSandbox(page);
  const other = await context.newPage();
  await other.goto("/vtk/p/E2E/items");
  await expect(other.getByTestId("new-item")).toBeVisible();
  // The first tab holds the stream and relays to this one.
  await expect(page.locator("html[data-realtime=open]")).toBeAttached();
  await expect(other.locator("html[data-realtime]")).toBeAttached();
  const title = `E2E realtime ${uniq()}`;
  await createItem(page, title);
  await expect(other.getByTestId("item-row").filter({ hasText: title })).toBeVisible();
  await other.close();
});
