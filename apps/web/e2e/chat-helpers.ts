import { expect, test, type Browser, type Page } from "@playwright/test";

export const uniq = () => Math.random().toString(36).slice(2, 7);

/** A second person in their own browser context (the default one is Bram). */
export async function signInAs(browser: Browser, email: string) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto("/sign-in");
  await page.fill("#email", email);
  await page.fill("#password", "dopl-dev-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/vtk\/home/);
  return { context, page };
}

/** Opens a conversation from the Messages sidebar by its name. */
export async function openChannel(page: Page, name: string) {
  await page.goto("/vtk/messages");
  await page.getByTestId("channel-link").filter({ hasText: name }).first().click();
  await expect(page.getByTestId("channel-name")).toHaveText(name);
  await expect(page.getByTestId("composer")).toBeVisible();
  await expect(page.locator("html[data-realtime]")).toBeAttached();
}

/** Types into a composer; `@Name` segments pick the person from the suggestion list. */
export async function compose(
  page: Page,
  parts: Array<string | { mention: string }>,
  testId = "composer",
) {
  const editor = page.getByTestId(testId).locator(".ProseMirror");
  await editor.click();
  for (const part of parts) {
    if (typeof part === "string") await page.keyboard.type(part);
    else {
      await page.keyboard.type(`@${part.mention}`);
      await page
        .getByRole("option", { name: new RegExp(part.mention) })
        .first()
        .waitFor();
      await page.keyboard.press("Enter");
    }
  }
}

export async function send(
  page: Page,
  parts: Array<string | { mention: string }>,
  testId = "composer",
) {
  await compose(page, parts, testId);
  await page.keyboard.press("Enter");
}

/**
 * Sends what's in the composer and resolves once the server has committed it
 * (the send action's response), so a live-delivery check starts from the
 * commit rather than from the keypress (D-126).
 */
export async function sendAndCommit(page: Page, text: string) {
  const committed = page.waitForResponse(
    (r) => r.request().method() === "POST" && Boolean(r.request().postData()?.includes(text)),
  );
  await page.keyboard.press("Enter");
  expect((await committed).ok()).toBe(true);
}

/**
 * Waits for something another person caused to show up live, and records how
 * long it took after the commit as a test annotation. It asserts arrival, not
 * a latency budget: `next dev` on a shared CI runner can't hold the 1 s
 * acceptance bar reliably (D-126).
 */
export async function expectLive(check: () => Promise<void>, label: string) {
  const start = Date.now();
  await check();
  test
    .info()
    .annotations.push({ type: "live latency", description: `${label}: ${Date.now() - start} ms` });
}
