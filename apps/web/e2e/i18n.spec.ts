import { expect, test } from "@playwright/test";

test.describe("French browser locale", () => {
  test.use({ locale: "fr-FR" });

  test("renders the application in French", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.getByRole("heading", { name: "Bonjour." })).toBeVisible();
    await expect(page.getByRole("button", { name: /Nouveau/ }).first()).toBeVisible();
  });
});

test.describe("English browser locale", () => {
  test.use({ locale: "en-US" });

  test("renders the application in English", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { name: "Hello." })).toBeVisible();
    await expect(page.getByRole("button", { name: /New/ }).first()).toBeVisible();
  });
});

test.describe("unsupported browser locale", () => {
  test.use({ locale: "de-DE" });

  test("falls back to English", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { name: "Hello." })).toBeVisible();
    await expect(page.getByText("A calm space to write, draw and organize your ideas.")).toBeVisible();
  });
});
