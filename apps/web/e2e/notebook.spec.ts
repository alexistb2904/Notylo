import { expect, test } from "@playwright/test";

test("creates and reopens a local notebook", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: /nouveau cahier/i })
    .first()
    .click();
  await page.getByLabel("Nom").fill("Maths E2E");
  await page.getByRole("button", { name: /créer le cahier/i }).click();
  await expect(page.getByRole("heading", { name: "Maths E2E" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Maths E2E" })).toBeVisible();
});

test("creates a notebook from the mobile dialog", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 568 });
  await page.goto("/");
  await page.getByRole("button", { name: /nouveau cahier/i }).first().click();
  await page.getByLabel("Nom").fill("Maths mobile");
  await page.getByRole("button", { name: /créer le cahier/i }).click();
  await expect(page.getByRole("heading", { name: "Maths mobile" })).toBeVisible();
});

test("opens the pen diagnostic page", async ({ page }) => {
  await page.goto("/debug/pen");
  await expect(page.getByRole("heading", { name: /test du stylet/i })).toBeVisible();
});
