import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { appendMessage } from "@dopl/shared/testing/fake-gmail";
import { signInAs, uniq } from "./chat-helpers";

/**
 * Personal mailboxes (D-138) against the fake Gmail: Dries, who reads no
 * shared mailbox, connects his own. Mail to the team's address (a group he's
 * on) stays out of it, and nobody else sees what's in it.
 */
const ROOT = path.resolve(import.meta.dirname, "../../..");
const DRIES = "dries@dopl.test";

function fakeDir(): string | null {
  if (process.env.GMAIL_FAKE_DIR) return path.resolve(ROOT, process.env.GMAIL_FAKE_DIR);
  try {
    const env = readFileSync(path.join(ROOT, ".env"), "utf8");
    const rel = /^GMAIL_FAKE_DIR=(.+)$/m.exec(env)?.[1]?.trim();
    return rel ? path.resolve(ROOT, rel) : null;
  } catch {
    return null;
  }
}
const DIR = fakeDir();
test.skip(!DIR, "needs GMAIL_FAKE_DIR (the fake Gmail) in .env");

const row = (page: Page, text: string) =>
  page.getByTestId("thread-row").filter({ hasText: text }).filter({ visible: true });

test("your own mailbox: only you see it, and the team's mail stays shared", async ({
  browser,
  page,
}) => {
  const { context, page: dries } = await signInAs(browser, DRIES);
  await dries.goto("/vtk/settings/mailbox");
  // Connected on an earlier local run already: the status page shows instead.
  const connect = dries.getByTestId("connect-personal-mailbox");
  await expect(connect.or(dries.getByTestId("mailbox-page"))).toBeVisible();
  if (await connect.isVisible()) await connect.click();
  await expect(dries.getByTestId("mailbox-status")).toHaveAttribute("data-status", "ACTIVE", {
    timeout: 30_000,
  });

  // Gmail delivers both: one for him, and one to it@vtk.be through the group.
  const own = `Lunch on Friday ${uniq()}`;
  const team = `Printer out of toner ${uniq()}`;
  await appendMessage(DIR as string, DRIES, {
    from: "friend@example.test",
    to: DRIES,
    subject: own,
    text: "Same place?",
  });
  await appendMessage(DIR as string, DRIES, {
    from: "prof@example.test",
    to: "it@vtk.be",
    subject: team,
    text: "Room 3 again.",
  });

  await dries.goto("/vtk/mail?view=all");
  await expect(dries.locator("html[data-realtime]")).toBeAttached();
  await expect(row(dries, own)).toBeVisible({ timeout: 15_000 });
  await row(dries, own).click();
  await expect(dries.getByTestId("thread-personal")).toBeVisible();
  // The group's mail is the shared mailbox's to track, not his.
  await expect(row(dries, team)).toHaveCount(0);

  // Bram reads the shared mailbox; Dries's own mail never shows up for him.
  await page.goto("/vtk/mail?view=all");
  await expect(page.getByTestId("thread-list")).toBeVisible();
  await expect(row(page, own)).toHaveCount(0);
  await context.close();
});
