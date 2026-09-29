import { expect, test as setup } from "@playwright/test";

export const MEMBER = { email: "bram@dopl.test", password: "dopl-dev-password" };

setup("sign in as a seeded member", async ({ page }) => {
  await page.goto("/sign-in");
  await page.fill("#email", MEMBER.email);
  await page.fill("#password", MEMBER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/vtk\/home/);
  await page.context().storageState({ path: "e2e/.auth/member.json" });
});
