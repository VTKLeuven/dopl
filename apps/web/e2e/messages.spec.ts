import { expect, test } from "@playwright/test";
import { compose, openChannel, send, signInAs, uniq } from "./chat-helpers";

const SANDBOX = "E2E sandbox";

test("new channel: send, reply in a thread, react, and create a work item from a message", async ({
  page,
}) => {
  const name = `e2e-${uniq()}`;
  await page.goto("/vtk/messages");
  await page.getByTestId("compose").click();
  await page.getByRole("menuitem", { name: "New channel" }).click();
  await page.fill("#ch-name", name);
  await page.getByRole("button", { name: "Create channel" }).click();
  await expect(page.getByTestId("channel-name")).toHaveText(name);

  const text = `The VPN drops every hour ${uniq()}`;
  await send(page, [text]);
  const message = page.getByTestId("message-list").getByTestId("message").filter({ hasText: text });
  await expect(message).toBeVisible();

  // Thread
  await message.hover();
  await message.getByTestId("reply-in-thread").click();
  await expect(page.getByTestId("thread-panel")).toBeVisible();
  await send(page, ["On it"], "thread-composer");
  await expect(page.getByTestId("thread-panel").getByText("On it")).toBeVisible();
  await expect(message.getByTestId("thread-summary")).toHaveText(/1 reply/);

  // Reaction
  await message.hover();
  await message.getByRole("button", { name: "Add reaction" }).click();
  await page.getByRole("button", { name: "👍" }).click();
  await expect(message.getByRole("button", { name: /👍\s*1/ })).toBeVisible();

  // Create a work item from it
  await message.hover();
  await message.getByTestId("create-item-from-message").click();
  const dialog = page.getByTestId("create-item-dialog");
  await expect(dialog.getByLabel("Title")).toHaveValue(text);
  await dialog.getByRole("radio", { name: SANDBOX }).click();
  await dialog.getByRole("button", { name: "Create item" }).click();
  const chip = message.getByTestId("created-item");
  await expect(chip).toBeVisible();
  // The item's timeline links back to the message.
  await chip.click();
  await expect(page.getByTestId("timeline-reference")).toContainText(`#${name}`);
});

test("two people: live messages, typing indicator, unread dot", async ({ page, browser }) => {
  await openChannel(page, SANDBOX);
  const chloe = await signInAs(browser, "chloe@dopl.test");
  await openChannel(chloe.page, SANDBOX);

  // Typing shows up, and goes away within 5 s of stopping.
  const warmup = `typing ${uniq()}`;
  await compose(chloe.page, [warmup]);
  const typing = page.getByTestId("typing-indicator");
  await expect(typing).toContainText("Chloé is typing", { timeout: 3_000 });
  await expect(typing).toHaveText("", { timeout: 5_000 });

  // The first live message may still compile routes on a cold dev server
  // (CI), so it isn't timed; the next one is.
  await chloe.page.keyboard.press("Enter");
  await expect(page.getByTestId("message").filter({ hasText: warmup })).toBeVisible({
    timeout: 15_000,
  });

  // A message arrives live.
  const text = `live ${uniq()}`;
  await chloe.page.keyboard.type(text);
  await chloe.page.keyboard.press("Enter");
  await expect(page.getByTestId("message").filter({ hasText: text.trim() })).toBeVisible({
    timeout: 2_000,
  });

  // Elsewhere, the sidebar shows it's unread until the channel is opened.
  await page.goto("/vtk/home");
  await expect(page.locator("html[data-realtime]")).toBeAttached();
  await chloe.page.keyboard.type(`unread ${uniq()}`);
  await chloe.page.keyboard.press("Enter");
  await expect(page.getByTestId("messages-dot")).toBeVisible({ timeout: 3_000 });

  await chloe.context.close();
});

test("after 30 s offline, missed messages arrive without a reload", async ({
  page,
  browser,
  context,
}) => {
  test.setTimeout(120_000);
  await openChannel(page, SANDBOX);
  await page.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true));
  const chloe = await signInAs(browser, "chloe@dopl.test");
  await openChannel(chloe.page, SANDBOX);

  await context.setOffline(true);
  const text = `while you were away ${uniq()}`;
  await send(chloe.page, [text]);
  await page.waitForTimeout(30_000);
  await context.setOffline(false);

  await expect(page.getByTestId("message").filter({ hasText: text })).toBeVisible({
    timeout: 15_000,
  });
  expect(
    await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload),
  ).toBe(true);
  await chloe.context.close();
});
