import { expect, test } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test("an uninvited address can't sign in and gets a generic error", async ({ page }) => {
  await page.goto("/sign-in");
  await page.fill("#email", "stranger@example.test");
  await page.fill("#password", "whatever-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("We couldn't sign you in")).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in/);
});

test("protected pages redirect to sign-in with a return path", async ({ page }) => {
  await page.goto("/vtk/p/INFRA/items");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fvtk%2Fp%2FINFRA%2Fitems/);
});
