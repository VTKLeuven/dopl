import { expect, test, type Page } from "@playwright/test";

/**
 * The AI teammate (Phase 8) end to end: a mention starts a run in the worker,
 * the fake Hermes (HERMES_FAKE_PORT) calls Dopl's MCP tools, commands run on
 * the fake executor, approvals are decided in the UI, and the answer lands as
 * Dopl's comment. Needs the worker running with the dev fakes (see .env.example).
 */

const uniq = () => Math.random().toString(36).slice(2, 7);

async function openItem(page: Page, title: string) {
  await page.goto("/vtk/p/E2E/items");
  const list = page.getByRole("radio", { name: "List" });
  if ((await list.getAttribute("data-state")) !== "on") await list.click();
  await expect(page.getByTestId("new-item")).toBeVisible();
  await page.keyboard.press("c");
  await page.getByRole("textbox", { name: "Issue title" }).fill(title);
  await page.keyboard.press("Meta+Enter");
  const row = page.getByTestId("item-row").filter({ hasText: title });
  await expect(row).toBeVisible();
  await row.click();
  const peek = page.getByTestId("peek");
  await expect(peek).toBeVisible();
  return peek;
}

/** Writes "@Dopl <text>" in the comment composer and posts it. */
async function askDopl(page: Page, peek: ReturnType<Page["getByTestId"]>, text: string) {
  await peek.locator(".ProseMirror").last().click();
  await page.keyboard.type("@Dop");
  await expect(page.getByRole("option", { name: /Dopl/ }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await page.keyboard.type(` ${text}`);
  await page.keyboard.press("Meta+Enter");
}

test("mention Dopl: an allowlisted command runs at once and the answer is posted", async ({
  page,
}) => {
  const peek = await openItem(page, `E2E agent uptime ${uniq()}`);
  await askDopl(page, peek, "run `uptime` on lab-01");
  const run = peek.getByTestId("agent-run");
  await expect(run).toBeVisible({ timeout: 15_000 });
  await expect(run).toHaveAttribute("data-status", "COMPLETED", { timeout: 45_000 });
  // The command step with its output, and Dopl's reply as a comment.
  await expect(run.getByTestId("step-command")).toContainText("uptime");
  await expect(peek.getByTestId("comment").filter({ hasText: "on lab-01 (exit 0)" })).toBeVisible({
    timeout: 15_000,
  });
});

test("a production command waits for approval, which runs it after a second confirmation", async ({
  page,
}) => {
  const peek = await openItem(page, `E2E agent approval ${uniq()}`);
  await askDopl(page, peek, "run `docker compose restart web` on app-01");
  const run = peek.getByTestId("agent-run");
  await expect(run).toHaveAttribute("data-status", "WAITING_FOR_APPROVAL", { timeout: 45_000 });
  const card = run.getByTestId("approval-card");
  await expect(card.getByTestId("approval-command")).toHaveText("docker compose restart web");
  await expect(card).toContainText("Production");

  // It shows on the agent page too, with the sidebar badge.
  await card.getByTestId("approve").click();
  await page.getByTestId("approve-production").click();
  await expect(run).toHaveAttribute("data-status", "COMPLETED", { timeout: 45_000 });
  await expect(card).toHaveAttribute("data-status", "APPROVED");
  await expect(
    peek.getByTestId("comment").filter({ hasText: "[fake executor on app-01]" }),
  ).toBeVisible({ timeout: 15_000 });
});

test("a denied command tells Dopl who said no; a DENY rule refuses outright", async ({ page }) => {
  const peek = await openItem(page, `E2E agent deny ${uniq()}`);
  await askDopl(page, peek, "run `docker compose down` on app-01 and `shutdown now` on lab-01");
  const run = peek.getByTestId("agent-run");
  await expect(run).toHaveAttribute("data-status", "WAITING_FOR_APPROVAL", { timeout: 45_000 });
  await run.getByTestId("deny").click();
  await page.getByPlaceholder(/Why not/).fill("not now");
  await run.getByTestId("deny-confirm").click();
  await expect(run).toHaveAttribute("data-status", "COMPLETED", { timeout: 45_000 });
  const reply = peek.getByTestId("comment").filter({ hasText: "DENIED by" });
  await expect(reply).toContainText("DENIED by Bram");
  await expect(reply).toContainText("not now");
  await expect(reply).toContainText("DENY rule");
});

test("the agent page lists runs and links to their details", async ({ page }) => {
  await page.goto("/vtk/agent");
  await expect(page.getByTestId("agent-runs")).toBeVisible();
  const first = page.getByTestId("agent-run").first();
  await first.getByRole("link", { name: "Open run" }).click();
  await expect(page).toHaveURL(/\/vtk\/agent\/runs\//);
  await expect(page.getByText("What Dopl was told")).toBeVisible();
});
