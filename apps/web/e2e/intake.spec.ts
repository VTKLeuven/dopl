import { createServer } from "node:http";
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

/**
 * Phase 3 flows: build and publish a form, submit it from an embed on another
 * origin, triage it, follow it from the confirmation email's status link, and
 * a guest's in-app request. Everything lands in the E2E sandbox project.
 *
 * The email test needs the worker (email.send) and Mailpit on :8025, like
 * `pnpm dev` + `pnpm db:up` provide locally and CI starts before the suite.
 */
const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
const uniq = () => Math.random().toString(36).slice(2, 8);

async function waitForSaved(page: Page) {
  await expect(page.locator("html:not([data-saving])")).toBeAttached();
}

/** Clicks until `then` shows up: a click can land before React has hydrated. */
async function clickUntil(target: Locator, then: Locator) {
  await expect(async () => {
    await target.click();
    await expect(then).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 20_000 });
}

async function anonymous(browser: Browser) {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  return ctx.newPage();
}

async function fillForm(
  page: Page | ReturnType<Page["frameLocator"]>,
  summary: string,
  email: string,
) {
  await page.locator("#pf-summary").fill(summary);
  await page.locator("#pf-details").fill("Steps: open it.\nIt breaks.");
  await page.locator("#pf-email").fill(email);
  await page.locator("#pf-name").fill("Erin External");
}

/** The status-page link from the confirmation email, as captured by Mailpit. */
async function statusLinkFor(email: string): Promise<string> {
  let link: string | null = null;
  await expect
    .poll(
      async () => {
        const res = await fetch(
          `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
        );
        if (!res.ok) return null;
        const list = (await res.json()) as { messages?: Array<{ ID: string }> };
        const id = list.messages?.[0]?.ID;
        if (!id) return null;
        const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as {
          Text: string;
        };
        link = /(https?:\/\/\S+\/s\/[\w-]+)/.exec(msg.Text)?.[1] ?? null;
        return link;
      },
      { timeout: 30_000, intervals: [500, 1000, 2000] },
    )
    .not.toBeNull();
  return link!;
}

async function openRequest(page: Page, title: string) {
  await page.goto("/vtk/p/E2E/intake");
  const row = page.getByTestId("intake-row").filter({ visible: true }).filter({ hasText: title });
  await clickUntil(row, page.getByTestId("intake-peek"));
  await expect(page.getByTestId("request-panel")).toBeVisible();
}

async function comment(page: Page, text: string, visibility: "internal" | "public") {
  await page.getByTestId(`comment-${visibility}`).click();
  const editor = page.getByTestId("intake-peek").locator(".ProseMirror").last();
  await editor.click();
  await page.keyboard.type(text);
  await page.keyboard.press("Meta+Enter");
  // The posted comment, not the text still in the editor.
  await expect(
    page.getByTestId("intake-peek").getByTestId("comment").filter({ hasText: text }),
  ).toHaveAttribute("data-visibility", visibility === "public" ? "PUBLIC" : "INTERNAL");
}

test.describe.serial("intake", () => {
  let slug = "";
  const formTitle = `E2E form ${uniq()}`;

  test("build and publish a form", async ({ page }) => {
    await page.goto("/vtk/p/E2E/intake/forms");
    await clickUntil(page.getByTestId("new-form"), page.locator("#form-title"));
    await page.locator("#form-title").fill(formTitle);
    await page.getByRole("button", { name: "Create form" }).click();
    await expect(page.getByTestId("form-fields")).toBeVisible();
    slug = await page.locator("#fb-slug").inputValue();
    expect(slug).toMatch(/^e2e-/);
    await page.getByTestId("form-publish").click();
    await expect(page.getByText("The form is live")).toBeVisible();
    await page.getByRole("button", { name: "Embed" }).click();
    await expect(page.getByTestId("snippet-script")).toContainText(`data-form="${slug}"`);
  });

  test("a form switched onto /feedback is listed there, opens from it and leads back", async ({
    page,
    browser,
  }) => {
    const setListed = async (on: boolean) => {
      const toggle = page.getByTestId("form-feedback-page");
      // A click before hydration is lost (and Save stays disabled): repeat it.
      await expect(async () => {
        if ((await toggle.getAttribute("aria-checked")) !== String(on)) await toggle.click();
        await expect(toggle).toHaveAttribute("aria-checked", String(on), { timeout: 1_500 });
      }).toPass({ timeout: 20_000 });
      await page.getByTestId("form-save").click();
      await expect(page.getByTestId("form-save")).toHaveText("Saved");
    };
    await page.goto("/vtk/p/E2E/intake/forms");
    await clickUntil(
      page.getByTestId("form-row").filter({ hasText: formTitle }),
      page.getByTestId("form-fields"),
    );
    await setListed(true);

    const visitor = await anonymous(browser);
    await visitor.goto("/feedback");
    const card = visitor.getByTestId("feedback-form").filter({ hasText: formTitle });
    await expect(card).toContainText("E2E sandbox");
    await card.click();
    await visitor.waitForURL(`**/f/${slug}`);
    await expect(visitor.getByTestId("public-form")).toBeVisible();
    await visitor.getByTestId("back-to-feedback").click();
    await visitor.waitForURL("**/feedback");

    // Switched off again (also keeps the dev database's page clean).
    await setListed(false);
    await visitor.reload();
    await expect(visitor.getByRole("heading", { name: "Feedback" })).toBeVisible();
    await expect(visitor.getByTestId("feedback-form").filter({ hasText: formTitle })).toHaveCount(
      0,
    );
    await visitor.context().close();
  });

  test("a submission from an embed on another origin reaches triage and gets a number on accept", async ({
    page,
    browser,
    baseURL,
  }) => {
    const summary = `Embedded ${uniq()}`;
    const host = await anonymous(browser);
    // A partner website on another origin (different host and port), served
    // from a real loopback server: Chrome only lets pages it knows are local
    // load scripts from localhost without a permission prompt.
    const server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(
        `<!doctype html><html><body><h1>Partner site</h1><script src="${baseURL}/embed.js" data-form="${slug}" async></script></body></html>`,
      );
    });
    await new Promise<void>((resolve) => server.listen(4599, "127.0.0.1", resolve));
    await host.goto("http://127.0.0.1:4599/");
    const frame = host.frameLocator("iframe");
    await clickUntil(host.getByRole("button", { name: "Feedback" }), host.locator("iframe"));
    await expect(frame.getByTestId("public-form")).toBeVisible();
    await fillForm(frame, summary, `embed-${uniq()}@example.test`);
    await host.waitForTimeout(2_100); // the minimum fill time
    await frame.getByRole("button", { name: "Send" }).click();
    await expect(frame.getByTestId("form-success")).toContainText(/Request #\d+/);
    await host.context().close();
    server.close();

    await openRequest(page, summary);
    await page.keyboard.press("y");
    await page.getByTestId("triage-accept-confirm").click();
    await waitForSaved(page);
    await page.getByTestId("intake-tab-accepted").click();
    const accepted = page.getByTestId("intake-row").filter({ hasText: summary });
    await expect(accepted.getByText(/^E2E-\d+$/)).toBeVisible();
  });

  test("the confirmation email opens the status page; only public replies show, and replies come back", async ({
    page,
    browser,
  }) => {
    const summary = `Status ${uniq()}`;
    const email = `status-${uniq()}@example.test`;
    const contact = await anonymous(browser);
    await contact.goto(`/f/${slug}`);
    await fillForm(contact, summary, email);
    await contact.waitForTimeout(2_100);
    await contact.getByRole("button", { name: "Send" }).click();
    await expect(contact.getByTestId("form-success")).toBeVisible();
    const link = await statusLinkFor(email);

    const secret = `Internal ${uniq()}`;
    const answer = `Public ${uniq()}`;
    await openRequest(page, summary);
    await comment(page, secret, "internal");
    await comment(page, answer, "public");

    await contact.goto(link);
    await expect(contact.getByTestId("request-status")).toHaveText("Received");
    await expect(contact.getByText(answer)).toBeVisible();
    await expect(contact.getByText(secret)).toHaveCount(0);
    const reply = `Thanks ${uniq()}`;
    await contact.getByLabel("Your reply").fill(reply);
    // Sending clears the box, so repeating the click after hydration is safe.
    await clickUntil(
      contact.getByRole("button", { name: "Send" }),
      contact.getByTestId("request-comment").filter({ hasText: reply }),
    );
    await contact.context().close();

    await openRequest(page, summary);
    const theirs = page.getByTestId("comment").filter({ hasText: reply });
    await expect(theirs).toBeVisible();
    await expect(theirs).toHaveAttribute("data-visibility", "PUBLIC");
  });

  test("a guest sends a request in the app and only sees public replies", async ({
    page,
    browser,
  }) => {
    const guest = await anonymous(browser);
    await guest.goto("/sign-in");
    await guest.fill("#email", "guest@example.test");
    await guest.fill("#password", "dopl-dev-password");
    await guest.getByRole("button", { name: "Sign in" }).click();
    await guest.waitForURL(/\/vtk\//);
    await guest.goto("/vtk/requests");
    await clickUntil(guest.getByTestId("new-request"), guest.locator("#req-title"));
    const title = `Guest asks ${uniq()}`;
    const picker = guest.locator("#req-project");
    if (await picker.isVisible()) await picker.selectOption({ label: "E2E sandbox" });
    await guest.locator("#req-title").fill(title);
    await guest.getByRole("button", { name: "Send request" }).click();
    await guest.waitForURL(/\/vtk\/requests\/[0-9a-f-]+$/);
    // Next keeps the list mounted (hidden) behind the request page.
    await expect(guest.getByTestId("request-thread").getByTestId("request-status")).toHaveText(
      "Received",
    );

    const note = `Guest-internal ${uniq()}`;
    const reply = `Hello guest ${uniq()}`;
    await openRequest(page, title);
    await comment(page, note, "internal");
    await comment(page, reply, "public");

    await guest.reload();
    await expect(guest.getByText(reply)).toBeVisible();
    await expect(guest.getByText(note)).toHaveCount(0);
    await guest.context().close();
  });
});
