import { expect, test, type Page } from "@playwright/test";

const uniq = () => Math.random().toString(36).slice(2, 7);

async function openInfraList(page: Page) {
  await page.goto("/vtk/p/INFRA/items");
  const list = page.getByRole("radio", { name: "List" });
  if ((await list.getAttribute("data-state")) !== "on") await list.click();
  await expect(page.getByTestId("item-row").first()).toBeVisible();
}

test("create an item with the keyboard and find it in the list", async ({ page }) => {
  await openInfraList(page);
  const title = `E2E create ${uniq()}`;
  await page.keyboard.press("c");
  await page.getByRole("textbox", { name: "Issue title" }).fill(title);
  await page.keyboard.press("Meta+Enter");
  await expect(page.getByText(/INFRA-\d+ created/)).toBeVisible();
  await expect(page.getByTestId("item-row").filter({ hasText: title })).toBeVisible();
});

test("paste several lines to create several items", async ({ page }) => {
  await openInfraList(page);
  const tag = uniq();
  await page.getByTestId("new-item").click();
  const input = page.getByRole("textbox", { name: "Issue title" });
  await input.focus();
  await page.evaluate((t) => {
    const el = document.activeElement as HTMLInputElement;
    const data = new DataTransfer();
    data.setData("text/plain", `- first ${t}\n- second ${t}\n- third ${t}`);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, tag);
  await expect(page.getByText("Pasted 3 lines")).toBeVisible();
  await page.getByRole("button", { name: "Create 3 items" }).click();
  await expect(page.getByText("3 items created")).toBeVisible();
  for (const w of ["first", "second", "third"]) {
    await expect(page.getByTestId("item-row").filter({ hasText: `${w} ${tag}` })).toBeVisible();
  }
});

test("change priority inline with the keyboard; it survives a reload", async ({ page }) => {
  await openInfraList(page);
  const title = `E2E priority ${uniq()}`;
  await page.keyboard.press("c");
  await page.getByRole("textbox", { name: "Issue title" }).fill(title);
  await page.keyboard.press("Meta+Enter");
  const row = page.getByTestId("item-row").filter({ hasText: title });
  await row.hover();
  await expect(row).toHaveAttribute("data-focused", "true");
  await page.keyboard.press("p");
  await page.getByRole("option", { name: "High" }).click();
  await expect(row.getByRole("button", { name: "Priority: High" })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("item-row").filter({ hasText: title }).getByRole("button", { name: "Priority: High" })).toBeVisible();
});

test("open peek, comment, and close with Escape", async ({ page }) => {
  await openInfraList(page);
  await page.getByTestId("item-row").first().click();
  const peek = page.getByTestId("peek");
  await expect(peek).toBeVisible();
  await expect(page).toHaveURL(/peek=INFRA-\d+/);
  const text = `Looks good from here ${uniq()}`;
  await peek.locator(".ProseMirror").last().click();
  await page.keyboard.type(text);
  await page.keyboard.press("Meta+Enter");
  await expect(peek.getByText(text)).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Escape");
  await expect(peek).toBeHidden();
});

test("delete an item and undo it", async ({ page }) => {
  await openInfraList(page);
  const title = `E2E delete ${uniq()}`;
  await page.keyboard.press("c");
  await page.getByRole("textbox", { name: "Issue title" }).fill(title);
  await page.keyboard.press("Meta+Enter");
  const row = page.getByTestId("item-row").filter({ hasText: title });
  await row.hover();
  await expect(row).toHaveAttribute("data-focused", "true");
  await page.keyboard.press("Meta+Backspace");
  await expect(row).toBeHidden();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByTestId("item-row").filter({ hasText: title })).toBeVisible();
});

test("done items are hidden by default and can be shown (D-053)", async ({ page }) => {
  await openInfraList(page);
  const chip = page.getByTestId("done-toggle");
  if ((await chip.textContent())?.includes("Showing done")) await chip.click();
  await expect(chip).toContainText("Done hidden");
  await expect(chip).toContainText(/Done hidden · \d+/);
  const hidden = Number((await chip.textContent())?.match(/(\d+)/)?.[1] ?? 0);
  expect(hidden).toBeGreaterThan(0);
  await chip.click();
  await expect(chip).toContainText("Showing done");
  // The list is virtualized: scroll to the end, where the Done group lives.
  const grid = page.getByRole("grid");
  for (let i = 0; i < 8; i++) await grid.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(page.locator('[data-testid=group-header][data-group="Done"]')).toBeVisible();
  await chip.click(); // restore the default
  await expect(chip).toContainText("Done hidden");
});

test("drag a card to another column on the board", async ({ page }) => {
  await page.goto("/vtk/p/INFRA/items");
  await page.getByRole("radio", { name: "Board" }).click();
  const board = page.getByTestId("board");
  await expect(board).toBeVisible();
  const todo = page.getByRole("region", { name: "Todo" });
  const inProgress = page.getByRole("region", { name: "In progress" });
  const card = todo.getByTestId("board-card").first();
  const id = (await card.locator("span").first().textContent())?.trim() ?? "";
  const target = inProgress.getByTestId("board-card").first();
  const from = await card.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("no boxes");
  await page.mouse.move(from.x + 40, from.y + 20);
  await page.mouse.down();
  await page.mouse.move(from.x + 60, from.y + 30, { steps: 5 });
  await page.mouse.move(to.x + 40, to.y + 10, { steps: 15 });
  await page.mouse.up();
  await expect(inProgress.getByTestId("board-card").filter({ hasText: id })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "In progress" }).getByTestId("board-card").filter({ hasText: id })).toBeVisible();
  await page.getByRole("radio", { name: "List" }).click();
});

test("attach a file to an item and download it", async ({ page }) => {
  await page.goto("/vtk/p/INFRA/items?peek=INFRA-3");
  const peek = page.getByTestId("peek");
  await expect(peek).toBeVisible();
  const name = `notes-${uniq()}.txt`;
  await peek.getByTestId("attachment-input").setInputFiles({ name, mimeType: "text/plain", buffer: Buffer.from("hello from e2e") });
  const link = peek.getByRole("link", { name: new RegExp(name) });
  await expect(link).toBeVisible();
  const href = await link.getAttribute("href");
  const res = await page.request.get(href ?? "");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-disposition"]).toContain("attachment");
  expect(await res.text()).toBe("hello from e2e");
});
