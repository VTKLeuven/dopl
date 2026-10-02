import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { appendMessage, readStore } from "@dopl/shared/testing/fake-gmail";
import { uniq } from "./chat-helpers";

/**
 * Phase 7 acceptance (ROADMAP §Phase 7) against the fake Gmail: the worker
 * syncs `it@vtk.be` (seeded, Bram is a member) from GMAIL_FAKE_DIR, and a spec
 * "receives" mail by appending to that store, which the worker picks up the
 * way it would a Pub/Sub push.
 */
const ROOT = path.resolve(import.meta.dirname, "../../..");
const MAILBOX = "it@vtk.be";

function fakeDir(): string | null {
  // The environment wins over .env, as it does for the app and the worker.
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

const receive = (input: Parameters<typeof appendMessage>[2]) =>
  appendMessage(DIR as string, MAILBOX, input);

async function openMail(page: Page, query = "") {
  await page.goto(`/vtk/mail${query}`);
  await expect(page.locator("html[data-realtime]")).toBeAttached();
}

const row = (page: Page, text: string) =>
  page.getByTestId("thread-row").filter({ hasText: text }).filter({ visible: true });

test("a new email shows up within 10 seconds, without a reload", async ({ page }) => {
  await openMail(page, "?view=all");
  const subject = `Projector in room 3 ${uniq()}`;
  await receive({
    from: "prof@example.test",
    fromName: "Prof. Peeters",
    subject,
    text: "It shows no signal.",
  });
  await expect(row(page, subject)).toBeVisible({ timeout: 10_000 });
});

test("HTML with scripts and handlers renders inert in a sandboxed frame", async ({ page }) => {
  const dialogs: string[] = [];
  page.on("dialog", (d) => {
    dialogs.push(d.message());
    void d.dismiss();
  });
  const subject = `Weird mail ${uniq()}`;
  await receive({
    from: "attacker@example.test",
    subject,
    html: `<p>Totally normal <b>mail</b></p>
      <script>alert("script ran"); window.parent.document.title = "pwned";</script>
      <img src="x" onerror="alert('onerror ran')">
      <a href="javascript:alert('link ran')">click me</a>
      <img src="https://tracker.example.test/pixel.gif">`,
    text: "Totally normal mail",
  });
  await openMail(page, "?view=all");
  await row(page, subject).click();
  const frame = page.getByTestId("email-frame").filter({ visible: true });
  await expect(frame).toBeVisible();

  // Layer two: no scripts, no same-origin access.
  const sandbox = (await frame.getAttribute("sandbox")) ?? "";
  expect(sandbox).not.toContain("allow-scripts");
  expect(sandbox).not.toContain("allow-same-origin");
  // Layer one: the stored HTML has no scripts or handlers left.
  const inner = page.frameLocator("[data-testid=email-frame] >> visible=true");
  await expect(inner.getByText("Totally normal")).toBeVisible();
  await expect(inner.locator("script")).toHaveCount(0);
  await expect(inner.locator("[onerror]")).toHaveCount(0);
  await expect(inner.locator('a[href^="javascript"]')).toHaveCount(0);
  await expect(page.getByText("Remote images are hidden").filter({ visible: true })).toBeVisible();
  // Click the link that used to be javascript: nothing may run.
  await inner.getByText("click me").click();
  await page.waitForTimeout(500);
  expect(dialogs).toEqual([]);
  await expect(page).not.toHaveTitle("pwned");
});

test("assign to me and solve move a thread between views", async ({ page }) => {
  const subject = `Laptop won't boot ${uniq()}`;
  await receive({ from: "student@example.test", subject, text: "Black screen." });
  await openMail(page, "?view=unassigned");
  await row(page, subject).click();

  const reader = page.getByTestId("thread-reader").filter({ visible: true });
  await reader.getByTestId("thread-assignee").click();
  await page.getByRole("option", { name: /Bram Janssens/ }).click();
  await expect(reader.getByTestId("thread-assignee")).toContainText("Bram Janssens");
  await expect(page.locator("html:not([data-saving])")).toBeAttached();

  await page.getByTestId("mail-view-mine").click();
  await expect(row(page, subject)).toBeVisible();
  await row(page, subject).click();
  await reader.getByTestId("thread-solve").click();
  await expect(reader.getByTestId("thread-reopen")).toBeVisible();
  await expect(page.locator("html:not([data-saving])")).toBeAttached();

  await page.getByTestId("mail-view-open").click();
  await expect(row(page, subject)).toHaveCount(0);
  await page.getByTestId("mail-view-solved").click();
  await expect(row(page, subject)).toBeVisible();
});

test("arrow keys move through the list; Backspace ignores a thread, with undo", async ({
  page,
}) => {
  const tag = uniq();
  const subjects = ["First", "Second", "Third"].map((n) => `${n} report ${tag}`);
  // Newest first in the list, so the order is the one above.
  for (const [i, subject] of subjects.entries())
    await receive({
      from: "reports@example.test",
      subject,
      text: "An aggregate report.",
      date: new Date(Date.now() - i * 60_000),
    });
  await openMail(page, `?view=open&q=${tag}`);
  const rows = page.getByTestId("thread-row").filter({ visible: true });
  await expect(rows).toHaveCount(3, { timeout: 10_000 });
  const open = page.getByTestId("thread-subject").filter({ visible: true });

  await page.keyboard.press("ArrowDown");
  await expect(open).toHaveText(subjects[0] as string);
  await page.keyboard.press("ArrowDown");
  await expect(open).toHaveText(subjects[1] as string);
  await expect(rows.nth(1)).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("ArrowUp");
  await expect(open).toHaveText(subjects[0] as string);

  // Backspace takes the open thread out of the list; the reader moves on.
  await page.keyboard.press("Backspace");
  await expect(rows).toHaveCount(2);
  await expect(row(page, subjects[0] as string)).toHaveCount(0);
  await expect(open).toHaveText(subjects[1] as string);

  // Undo brings it back, and opens it again.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(open).toHaveText(subjects[0] as string);
  await expect(rows).toHaveCount(3);

  // In a text field Backspace edits the text, nothing else.
  const search = page.getByTestId("mail-search").filter({ visible: true });
  await search.focus();
  await page.keyboard.press("End");
  await page.keyboard.press("Backspace");
  await expect(search).toHaveValue(tag.slice(0, -1));
  await expect(rows).toHaveCount(3);
});

test("promote to a work item; a follow-up reply appears on the item's timeline", async ({
  page,
}) => {
  const subject = `Wi-Fi in the aula ${uniq()}`;
  const first = await receive({
    from: "event@example.test",
    fromName: "Event team",
    subject,
    text: "The guest Wi-Fi drops during talks.",
  });
  await openMail(page, "?view=all");
  await row(page, subject).click();
  const reader = page.getByTestId("thread-reader").filter({ visible: true });
  await reader.getByTestId("thread-promote").click();
  const dialog = page.getByTestId("promote-dialog");
  await dialog.getByTestId("promote-project").click();
  await page.getByRole("option", { name: /E2E sandbox/ }).click();
  await dialog.getByTestId("promote-submit").click();

  // Lands on the new item, with the email on its timeline.
  await expect(page).toHaveURL(/\/vtk\/i\/E2E-\d+/);
  await expect(page.locator("html[data-realtime]")).toBeAttached();
  await expect(page.getByTestId("timeline-email-reference")).toContainText(subject);
  await expect(
    page.getByTestId("timeline-email").filter({ hasText: "drops during talks" }),
  ).toBeVisible();

  // The sender writes back: it shows up on the item without a reload.
  await receive({
    from: "event@example.test",
    fromName: "Event team",
    subject: `Re: ${subject}`,
    text: "It happened again at 14:00.",
    threadId: first.threadId,
    inReplyTo: first.messageId,
  });
  await expect(
    page.getByTestId("timeline-email").filter({ hasText: "again at 14:00" }),
  ).toBeVisible({
    timeout: 15_000,
  });
});

test("an internal note stays inside; a reply goes out through the mailbox", async ({ page }) => {
  const subject = `Password reset ${uniq()}`;
  await receive({ from: "member@example.test", subject, text: "I forgot my password." });
  await openMail(page, "?view=all");
  await row(page, subject).click();
  const reader = page.getByTestId("thread-reader").filter({ visible: true });

  await reader.getByTestId("composer-note").click();
  await reader.getByTestId("thread-composer").locator(".ProseMirror").click();
  await page.keyboard.type("Check the account is not locked first.");
  await reader.getByTestId("note-submit").click();
  await expect(
    reader.getByTestId("email-comment").filter({ hasText: "not locked first" }),
  ).toBeVisible();

  const answer = `Here's a reset link ${uniq()}`;
  const outbound = reader.locator("[data-testid=email-message][data-direction=OUTBOUND]");
  const before = await outbound.count();
  await reader.getByTestId("composer-reply").click();
  await reader.getByTestId("thread-composer").locator(".ProseMirror").click();
  await page.keyboard.type(answer);
  await reader.getByTestId("reply-submit").click();
  await expect(outbound).toHaveCount(before + 1);

  // The worker sent it through the (fake) Gmail, in the same thread.
  await expect
    .poll(
      async () => {
        const store = await readStore(DIR as string, MAILBOX);
        return Object.values(store.messages).some(
          (m) =>
            (m.labelIds ?? []).includes("SENT") &&
            m.payload?.headers?.some((h) => h.name === "Subject" && h.value === `Re: ${subject}`),
        );
      },
      { timeout: 15_000 },
    )
    .toBe(true);
});

test("the views column folds and stays folded; the composer opens folded", async ({ page }) => {
  const subject = `Beamer cable ${uniq()}`;
  await receive({ from: "board@example.test", subject, text: "Which cable for the aula?" });
  await openMail(page, "?view=all");
  const sidebar = page.getByTestId("mail-sidebar");
  await expect(sidebar).not.toHaveAttribute("data-folded");
  await sidebar.getByTestId("sidebar-toggle").click();
  await expect(sidebar).toHaveAttribute("data-folded", "true");
  // Folded, the views still work, as icons.
  await page.getByTestId("mail-view-open").click();
  await expect(page).not.toHaveURL(/view=all/);
  // The server renders it folded after a reload; [ unfolds it again (once
  // the page has hydrated, which can be after the realtime stream connects).
  await openMail(page);
  await expect(sidebar).toHaveAttribute("data-folded", "true");
  await expect(async () => {
    await page.keyboard.press("[");
    await expect(sidebar).not.toHaveAttribute("data-folded", { timeout: 1_000 });
  }).toPass();

  await openMail(page, "?view=all");
  await row(page, subject).click();
  const composer = page
    .getByTestId("thread-reader")
    .filter({ visible: true })
    .getByTestId("thread-composer");
  await expect(composer).toHaveAttribute("data-state", "closed");
  await expect(composer.locator(".ProseMirror")).toHaveCount(0);
  await composer.getByTestId("composer-note").click();
  await expect(composer).toHaveAttribute("data-state", "open");
  await page.keyboard.type("Draft that survives folding");
  await composer.getByTestId("composer-collapse").click();
  await expect(composer).toHaveAttribute("data-state", "closed");
  await composer.getByTestId("composer-note").click();
  await expect(composer.locator(".ProseMirror")).toContainText("Draft that survives folding");
});
