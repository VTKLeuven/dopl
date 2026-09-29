import { expect, test, type Page } from "@playwright/test";
import { uniq } from "./chat-helpers";

/**
 * Phase 5 acceptance (ROADMAP §Phase 5): capture speed, the to-do projection
 * updating cards in place, the nested tag tree, and converting a checkbox
 * line. Notes are Bram's own and private, so leftovers don't affect others.
 */

/** Opens the capture bar and types lines (a `[ ] ` line starts a checkbox). */
async function capture(page: Page, lines: string[]) {
  const editor = page
    .getByTestId("capture-composer")
    .filter({ visible: true })
    .getByRole("textbox");
  // A click before hydration does nothing; retry until the composer opens.
  await expect(async () => {
    if (!(await editor.isVisible()))
      await page.getByTestId("capture-bar").filter({ visible: true }).click();
    await expect(editor).toBeFocused({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  for (const [i, line] of lines.entries()) {
    if (i > 0) await page.keyboard.press("Enter");
    await page.keyboard.type(line);
  }
}

const saved = (page: Page) => expect(page.locator("html:not([data-saving])")).toBeAttached();

test("a captured note shows up in under 100 ms and is saved", async ({ page }) => {
  await page.goto("/vtk/notes");
  await expect(page.locator("html[data-realtime]")).toBeAttached();
  const text = `Captured ${uniq()}`;
  await capture(page, [text]);

  // Timed in the page: from the ⌘/Ctrl+Enter keydown to the card in the DOM.
  await page.evaluate((needle) => {
    const w = window as unknown as { __capture: { start?: number; end?: number } };
    w.__capture = {};
    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) w.__capture.start ??= performance.now();
      },
      { capture: true },
    );
    new MutationObserver((_, observer) => {
      const cards = document.querySelectorAll("[data-testid=note-card]");
      if ([...cards].some((c) => c.textContent?.includes(needle))) {
        w.__capture.end = performance.now();
        observer.disconnect();
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  }, text);
  await page.keyboard.press("ControlOrMeta+Enter");

  const card = page.getByTestId("note-card").filter({ hasText: text });
  await expect(card).toBeVisible();
  const ms = await page.evaluate(() => {
    const c = (window as unknown as { __capture: { start: number; end: number } }).__capture;
    return c.end - c.start;
  });
  expect(ms).toBeLessThan(100);

  await saved(page);
  await page.reload();
  await expect(card).toBeVisible();
});

test("a nested #tag shows up as a branch in the tag tree", async ({ page }) => {
  await page.goto("/vtk/notes");
  await expect(page.locator("html[data-realtime]")).toBeAttached();
  const root = `lab${uniq()}`;
  // Enter right after the tag starts a new line (the # popup must not take it).
  await capture(page, [`Cluster notes #${root}/proxmox`, "second line"]);
  await page.keyboard.press("ControlOrMeta+Enter");
  const card = page.getByTestId("note-card").filter({ hasText: "Cluster notes" }).first();
  await expect(card.locator("p", { hasText: "second line" })).toBeVisible();

  const parent = page.getByTestId("tag-tree").locator("[role=treeitem]", { hasText: root }).first();
  await expect(parent).toBeVisible();
  await expect(parent).toHaveAttribute("aria-expanded", "true");
  await expect(parent.locator("[role=treeitem]", { hasText: "proxmox" })).toBeVisible();

  // The branch filters the grid to notes under it.
  await parent.getByRole("button", { name: root, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`tag=${root}`));
  await expect(page.getByTestId("note-card")).toHaveCount(1);
});

test("checking a to-do in My to-dos updates the note card in place", async ({ page }) => {
  await page.goto("/vtk/home");
  await expect(page.locator("html[data-realtime]")).toBeAttached();
  const id = uniq();
  const todo = `Swap the UPS battery ${id}`;
  await capture(page, [`Rack ${id}`, `[ ] ${todo}`]);
  await page.keyboard.press("ControlOrMeta+Enter");
  await saved(page);

  // Home shows the note (Recent notes) and its to-do (My to-dos) side by side.
  const card = page.getByTestId("note-card").filter({ hasText: `Rack ${id}` });
  const onCard = card.getByRole("checkbox", { name: todo });
  await expect(onCard).not.toBeChecked();
  const cardNode = await card.elementHandle();
  const boxNode = await onCard.elementHandle();

  await page.getByTestId("home-todos").getByRole("checkbox", { name: todo }).click();
  await expect(onCard).toBeChecked();
  // Same DOM nodes: patched in place, not re-mounted.
  expect(await cardNode!.evaluate((el) => el.isConnected)).toBe(true);
  expect(await boxNode!.evaluate((el) => el.isConnected)).toBe(true);
  await saved(page);

  await page.goto("/vtk/notes/todos?status=done");
  await expect(page.getByTestId("todo-row").filter({ hasText: todo })).toBeVisible();
});

test("converting a checkbox line creates an item and strikes the line with its chip", async ({
  page,
}) => {
  await page.goto("/vtk/notes");
  await expect(page.locator("html[data-realtime]")).toBeAttached();
  const id = uniq();
  const line = `Label the patch panel ${id}`;
  await capture(page, [`Rack cleanup ${id}`, `[ ] ${line}`]);
  await page.keyboard.press("ControlOrMeta+Enter");
  await saved(page);

  const row = page
    .getByTestId("note-card")
    .filter({ hasText: `Rack cleanup ${id}` })
    .locator("li[data-type=taskItem]", { hasText: line });
  await row.hover();
  await row.getByRole("button", { name: "Convert this line to a work item" }).click();
  const dialog = page.getByTestId("convert-dialog");
  const project = dialog.getByTestId("convert-project");
  if (!(await project.textContent())?.includes("E2E sandbox")) {
    await project.click();
    await page.getByRole("option", { name: /E2E sandbox/ }).click();
  }
  await expect(project).toContainText("E2E sandbox");
  await dialog.getByRole("button", { name: "Create item" }).click();

  const chip = row.getByTestId("note-item-ref");
  await expect(chip).toHaveText(/^E2E-\d+$/);
  await expect(row.locator("s", { hasText: line })).toBeVisible();
  await saved(page);

  // The item links back to the note on its timeline.
  const identifier = (await chip.textContent())!;
  await page.goto(`/vtk/i/${identifier}`);
  await expect(page.locator("textarea").first()).toHaveValue(line);
  await expect(page.getByTestId("timeline-note-reference")).toContainText(line);
});

test("Q captures a note from any page", async ({ page }) => {
  await page.goto("/vtk/inbox");
  await expect(page.locator("html[data-realtime]")).toBeAttached();
  const text = `From the inbox ${uniq()}`;
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("q");
  const dialog = page.getByTestId("quick-capture");
  await expect(dialog.getByRole("textbox")).toBeFocused();
  await page.keyboard.type(text);
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(dialog).toBeHidden();
  await saved(page);

  await page.goto("/vtk/notes");
  await expect(page.getByTestId("note-card").filter({ hasText: text })).toBeVisible();
});
