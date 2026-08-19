import { expect, test, type Page } from "@playwright/test";

async function createNotebook(page: Page, name: string) {
  await page.goto("/");
  await page.getByRole("button", { name: /créer votre premier cahier/i }).click();
  await page.getByLabel("Nom").fill(name);
  await page.getByRole("button", { name: /créer le cahier/i }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

async function drawStroke(page: Page, yOffset: number) {
  const paper = page.getByLabel("Page du cahier").first();
  const box = await paper.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  const y = box.y + Math.min(box.height - 40, 100 + yOffset);
  await page.mouse.move(box.x + 100, y);
  await page.mouse.down();
  await page.mouse.move(box.x + 170, y + 18, { steps: 7 });
  await page.mouse.move(box.x + 250, y - 8, { steps: 7 });
  await page.mouse.up();
}

test("creates and reopens a local notebook", async ({ page }) => {
  await createNotebook(page, "Maths E2E");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Maths E2E" })).toBeVisible();
});

test("creates a notebook from the mobile empty state", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 568 });
  await createNotebook(page, "Maths mobile");
});

test("renders live ink as vectors and keeps editor tools available", async ({ page }) => {
  await createNotebook(page, "Ink E2E");

  await drawStroke(page, 0);
  await expect(page.locator(".vector-object-layer path")).toHaveCount(1);

  await page.getByTitle("Brosses").click();
  await page.getByRole("button", { name: /Crayon esquisse/i }).click();
  await drawStroke(page, 90);
  // Fineliner = one outline. Pencil = one outline + one vector graphite texture path.
  await expect(page.locator(".vector-object-layer path")).toHaveCount(3);

  await page.getByTitle("Brosses").click();
  await expect(page.getByRole("button", { name: /Crayon esquisse/i })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await page.getByRole("button", { name: "Fermer" }).click();

  for (const tool of ["Surligneur", "Gomme (E)", "Texte (T)", "Forme libre", "Équation", "Tableau"]) {
    const button = page.getByTitle(tool);
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
  }

  await page.getByTitle("Icônes de base").click();
  await expect(page.getByRole("dialog", { name: "Icônes de base" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Carré" })).toBeVisible();

  await page.getByRole("button", { name: "Fermer" }).click();
  await page.getByTitle("Gomme (E)").click();
  await page.getByTitle("Propriétés").click();
  await expect(page.getByRole("button", { name: "Objet entier" })).toBeVisible();
  await page.getByRole("button", { name: "Gomme précise" }).click();
  await expect(page.getByRole("button", { name: "Gomme précise" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
});

test("opens the pen diagnostic page", async ({ page }) => {
  await page.goto("/debug/pen");
  await expect(page.getByRole("heading", { name: /test du stylet/i })).toBeVisible();
});
