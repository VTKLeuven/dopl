import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 6 (ROADMAP §Phase 6): the overview renders every chart, a dashboard
 * can be duplicated, extended with the builder and rearranged, and every
 * chart has designed loading, empty and error states. Metric values are
 * checked against hand-computed fixtures in Vitest.
 */

const QUERY = "**/api/v1/vtk/analytics/query?**";
const metricOf = (url: string) =>
  (JSON.parse(new URL(url).searchParams.get("q") ?? "{}") as { spec?: { metric?: string } }).spec
    ?.metric;

/** Next keeps the previous route mounted but hidden, so only visible widgets count. */
const widgets = (page: Page) => page.getByTestId("widget").filter({ visible: true });

const region = (page: Page, name: string) =>
  page.getByRole("region", { name, exact: true }).filter({ visible: true });

const settled = (page: Page) => expect(page.locator("html:not([data-saving])")).toBeAttached();

test("the overview renders every chart, and the period lives in the URL", async ({ page }) => {
  await page.goto("/vtk/analytics");
  await expect(widgets(page)).toHaveCount(13);
  // Every widget ends up as a chart, a number or an empty state, never an error.
  await expect(page.locator("[data-testid=widget] [aria-busy]")).toHaveCount(0, {
    timeout: 30_000,
  });
  await expect(page.getByTestId("widget-error")).toHaveCount(0);
  await expect(page.getByTestId("number-tile").first()).toBeVisible();
  await expect(page.locator("[data-testid=widget] svg.recharts-surface").first()).toBeVisible();

  await page.getByTestId("range-30d").click();
  await expect(page).toHaveURL(/range=30d/);
  await expect(page.getByTestId("range-30d")).toHaveAttribute("data-state", "on");
});

test("each chart has designed loading, empty and error states", async ({ page }) => {
  let mode: "slow" | "fail" | "empty" | "pass" = "slow";
  await page.route(QUERY, async (route) => {
    if (metricOf(route.request().url()) !== "flow" || mode === "pass") return route.fallback();
    if (mode === "fail") return route.fulfill({ status: 500, json: { error: "server_error" } });
    if (mode === "empty") {
      const res = await route.fetch();
      const body = (await res.json()) as {
        x: string[];
        values: Record<string, Record<string, number>>;
      };
      for (const x of body.x) body.values[x] = { created: 0, completed: 0 };
      return route.fulfill({ response: res, json: body });
    }
    await new Promise((r) => setTimeout(r, 1_500));
    return route.fallback();
  });

  const flow = region(page, "Created vs completed");
  await page.goto("/vtk/analytics");
  // Loading: a skeleton the chart's size.
  await expect(flow.locator("[aria-busy]")).toBeVisible();
  await expect(flow.locator("svg.recharts-surface")).toBeVisible({ timeout: 15_000 });

  mode = "fail";
  await page.goto("/vtk/analytics?range=365d");
  await expect(flow.getByTestId("widget-error")).toBeVisible({ timeout: 15_000 });
  mode = "pass";
  await flow.getByRole("button", { name: "Try again" }).click();
  await expect(flow.locator("svg.recharts-surface")).toBeVisible();

  mode = "empty";
  await page.goto("/vtk/analytics?range=30d");
  await expect(flow.getByTestId("widget-empty")).toBeVisible({ timeout: 15_000 });
});

test("duplicate the overview, add a chart with the builder, and rearrange it", async ({ page }) => {
  await page.goto("/vtk/analytics");
  await page.getByTestId("duplicate-dashboard").click();
  await expect(page).toHaveURL(/\/vtk\/analytics\/[0-9a-f-]{36}/);
  await expect(widgets(page)).toHaveCount(13);
  await expect(region(page, "Open items")).toBeVisible();

  // Builder: metric, x-axis and chart type, with a live preview.
  await page.getByTestId("add-chart").click();
  const builder = page.getByTestId("chart-builder");
  await builder.getByTestId("builder-metric").click();
  await page.getByRole("menuitemradio", { name: "Open items", exact: true }).click();
  await builder.getByTestId("builder-x").click();
  await page.getByRole("menuitemradio", { name: "Priority" }).click();
  await builder.getByTestId("builder-chart-DONUT").click();
  const preview = builder.getByTestId("builder-preview");
  await expect(preview.locator("svg.recharts-surface")).toBeVisible();
  await expect(preview.getByText("Urgent")).toBeVisible(); // the legend
  const title = `Open by priority ${Date.now().toString(36)}`;
  await builder.getByLabel("Title").fill(title);
  await builder.getByTestId("builder-save").click();
  await expect(builder).toBeHidden();
  const added = region(page, title);
  await expect(added).toBeVisible();
  await expect(widgets(page).last()).toHaveAccessibleName(title);
  await settled(page);

  // Rearrange: drag the new chart by its handle towards the top.
  const names = () =>
    widgets(page).evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  const handle = added.getByRole("button", { name: "Drag to reorder" });
  await added.hover();
  const from = (await handle.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  const first = widgets(page).first();
  await first.scrollIntoViewIfNeeded();
  const to = (await first.boundingBox())!;
  await page.mouse.move(to.x + 40, to.y + 40, { steps: 20 });
  await page.mouse.move(to.x + 30, to.y + 30, { steps: 5 });
  await page.mouse.up();
  await settled(page);
  // Where it lands depends on scrolling mid-drag; that it moved and stays moved is the point.
  await expect.poll(async () => (await names()).indexOf(title)).toBeLessThan(13);
  const order = await names();
  await page.reload();
  await expect(widgets(page)).toHaveCount(14);
  expect(await names()).toEqual(order);

  // Resize and remove through the chart's menu.
  await added.hover();
  await added.getByTestId("widget-menu").click();
  await page.getByRole("menuitem", { name: "Width" }).hover();
  await page.getByRole("menuitemradio", { name: "Full width" }).click();
  // The sortable wrapper around the card carries the grid span.
  await expect(added.locator("xpath=..")).toHaveClass(/md:col-span-12/);
  await settled(page);
  await added.hover();
  await added.getByTestId("widget-menu").click();
  await page.getByRole("menuitem", { name: "Remove chart" }).click();
  await expect(added).toBeHidden();
  await settled(page);
  await page.reload();
  await expect(widgets(page)).toHaveCount(13);
});

test("a project's analytics count only that project", async ({ page }) => {
  await page.goto("/vtk/p/INFRA/analytics");
  await expect(widgets(page)).toHaveCount(13);
  await expect(page.getByTestId("dashboard-project")).toHaveCount(0);
  const byAssignee = region(page, "Open by assignee");
  await expect(byAssignee.locator("svg.recharts-surface")).toBeVisible({ timeout: 30_000 });
});
