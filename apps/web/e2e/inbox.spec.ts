import { expect, test } from "@playwright/test";
import { openChannel, send, signInAs, uniq } from "./chat-helpers";

const SANDBOX = "E2E sandbox";

test("a mention shows up in the Inbox live, with its badge, and can be triaged with the keyboard", async ({
  page,
  browser,
}) => {
  await page.goto("/vtk/inbox");
  await expect(
    page.getByTestId("inbox-list").or(page.getByText("No notifications yet")),
  ).toBeVisible();
  await expect(page.locator("html[data-realtime=open]")).toBeAttached();

  const chloe = await signInAs(browser, "chloe@dopl.test");
  await openChannel(chloe.page, SANDBOX);
  // The first live notification may still compile routes on a cold dev
  // server (CI), so it isn't timed; the next one is (D-106).
  const warmup = `warm ${uniq()}`;
  await send(chloe.page, [{ mention: "Bram" }, ` ${warmup}`]);
  await expect(page.getByTestId("inbox-row").filter({ hasText: warmup })).toBeVisible({
    timeout: 15_000,
  });

  const tag = `ping ${uniq()}`;
  await send(chloe.page, [{ mention: "Bram" }, ` ${tag}`]);
  await expect(chloe.page.getByTestId("message").filter({ hasText: tag })).toBeVisible();

  // Realtime: no reload on Bram's side.
  const row = page.getByTestId("inbox-row").filter({ hasText: tag });
  await expect(row).toBeVisible({ timeout: 3_000 });
  await expect(row).toHaveAttribute("data-unread", "true");
  await expect(page.getByTestId("inbox-badge")).toBeVisible();
  await expect(page).toHaveTitle(/^\(\d+\) /);

  // Open it: the reader shows the message, and it's read.
  await row.click();
  await expect(page.getByTestId("thread-preview").getByText(tag)).toBeVisible();
  await expect(row).not.toHaveAttribute("data-unread", "true");
  // U marks it unread again, E archives it.
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("u");
  await expect(row).toHaveAttribute("data-unread", "true");
  await page.keyboard.press("e");
  await expect(row).toBeHidden();
  await expect(page.locator("html:not([data-saving])")).toBeAttached();
  await page.goto("/vtk/inbox?view=archived");
  await expect(page.getByTestId("inbox-row").filter({ hasText: tag })).toBeVisible();

  await chloe.context.close();
});

test("unread counts stay in sync across tabs", async ({ page, context, browser }) => {
  await page.goto("/vtk/inbox");
  await expect(page.locator("html[data-realtime=open]")).toBeAttached();
  const other = await context.newPage();
  await other.goto("/vtk/home");
  await expect(other.locator("html[data-realtime]")).toBeAttached();

  const chloe = await signInAs(browser, "chloe@dopl.test");
  const tag = `tabs ${uniq()}`;
  await openChannel(chloe.page, SANDBOX);
  await send(chloe.page, [{ mention: "Bram" }, ` ${tag}`]);

  // Both tabs of the same browser hear it (one shared stream, relayed).
  await expect(page.getByTestId("inbox-row").filter({ hasText: tag })).toBeVisible({
    timeout: 3_000,
  });
  await expect(page.getByTestId("inbox-badge")).toBeVisible();
  await expect(other.getByTestId("inbox-badge")).toBeVisible({ timeout: 3_000 });

  await page.getByTestId("inbox-mark-all").click();
  await expect(page.getByTestId("inbox-badge")).toBeHidden();
  await expect(other.getByTestId("inbox-badge")).toBeHidden({ timeout: 3_000 });

  await other.close();
  await chloe.context.close();
});

test("notification preferences are saved per type", async ({ page }) => {
  await page.goto("/vtk/settings/notifications");
  const row = page.getByTestId("pref-THREAD_REPLY");
  const email = row.getByRole("switch", { name: /by email/ });
  const before = await email.getAttribute("data-state");
  await email.click();
  await expect(email).not.toHaveAttribute("data-state", before ?? "");
  await expect(page.locator("html:not([data-saving])")).toBeAttached();
  await page.reload();
  await expect(
    page.getByTestId("pref-THREAD_REPLY").getByRole("switch", { name: /by email/ }),
  ).not.toHaveAttribute("data-state", before ?? "");
  // Put it back for the next run.
  await page
    .getByTestId("pref-THREAD_REPLY")
    .getByRole("switch", { name: /by email/ })
    .click();
});
