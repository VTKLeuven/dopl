import { expect, test as setup } from "@playwright/test";

export const MEMBER = { email: "bram@dopl.test", password: "dopl-dev-password" };

setup("sign in as a seeded member and ensure the sandbox project", async ({ page }) => {
  // The first requests compile routes on a cold `next dev` (CI), and the
  // warm-up below compiles more; together they outlast the default 60 s.
  setup.setTimeout(240_000);
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

  // The guest (Gert Gast) is a member of the sandbox so intake tests can send
  // in-app requests there instead of into the seeded projects.
  await page.goto("/vtk/p/E2E/settings");
  const membersSection = page.locator("section").filter({ hasText: "Members" }).last();
  await expect(page.getByRole("button", { name: "Add member" })).toBeVisible();
  if (
    !(await membersSection
      .getByText("Gert Gast")
      .isVisible()
      .catch(() => false))
  ) {
    await page.getByRole("button", { name: "Add member" }).click();
    await page.getByPlaceholder("Add member").fill("Gert");
    await page.getByRole("option", { name: /Gert Gast/ }).click();
    await expect(membersSection.getByText("Gert Gast")).toBeVisible();
  }

  // `next dev` compiles a route on its first request, which can take longer
  // than the realtime checks allow (a refetch after a live event). Compile
  // the read routes those checks refetch; a made-up id is enough for that.
  const none = "00000000-0000-7000-8000-000000000000";
  for (const path of [
    "inbox?view=all",
    "inbox/counts",
    "channels",
    `channels/${none}/messages`,
    `threads/${none}`,
    "notes?filter=all",
    "notes/tags",
    "notes/todos?status=open",
    "notes/summary",
    "dashboards",
    "mail/mailboxes",
    "mail/threads?view=all",
    `mail/threads/${none}`,
    "agent",
    `agent/runs/${none}`,
    `analytics/query?q=${encodeURIComponent(JSON.stringify({ spec: { metric: "created", xAxis: "none", chartType: "NUMBER" } }))}`,
  ])
    await page.request.get(`/api/v1/vtk/${path}`, { timeout: 60_000 });

  await page.context().storageState({ path: "e2e/.auth/member.json" });
});
