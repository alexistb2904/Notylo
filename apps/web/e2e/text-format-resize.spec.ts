import { expect, test, type Page } from "@playwright/test";

async function createNotebook(page: Page, name: string) {
  await page.goto("/");
  await page.getByRole("button", { name: /créer votre premier cahier/i }).click();
  await page.getByLabel("Nom").fill(name);
  await page.getByRole("button", { name: /créer le cahier/i }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

async function visiblePaperPoint(page: Page) {
  const paper = page.getByLabel("Page du cahier").first();
  const box = await paper.boundingBox();
  expect(box).not.toBeNull();
  if (!box) throw new Error("Notebook paper is not visible");
  return {
    x: box.x + Math.min(240, box.width * 0.28),
    y: box.y + Math.min(190, box.height * 0.2)
  };
}

test("formats text and previews resize before pointer release", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await createNotebook(page, "Text format resize E2E");

  const tools = page.locator(".tool-rail");
  await tools.getByTitle("Texte (T)").click();
  const point = await visiblePaperPoint(page);
  await page.mouse.click(point.x, point.y);

  const text = page.locator(".dom-object.text .text-object").first();
  await expect(text).toBeVisible();
  await expect(page.locator(".inspector")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Texte" })).toBeVisible();

  await page.getByLabel("Police", { exact: true }).selectOption("Arial, sans-serif");
  await page.getByLabel("Taille de police", { exact: true }).fill("30");
  await page.getByRole("button", { name: "Gras", exact: true }).click();
  await page.getByRole("button", { name: "Italique", exact: true }).click();
  await page.getByRole("button", { name: "Centrer", exact: true }).click();

  await expect
    .poll(() => text.evaluate((element) => getComputedStyle(element).fontFamily))
    .toContain("Arial");
  await expect(text).toHaveCSS("font-size", "30px");
  await expect(text).toHaveCSS("font-weight", "700");
  await expect(text).toHaveCSS("font-style", "italic");
  await expect(text).toHaveCSS("text-align", "center");

  await text.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type(
    "A long adaptive text block that should reflow immediately when its box is resized in the editor."
  );

  const object = page.locator(".dom-object.text").first();
  const before = await object.boundingBox();
  expect(before).not.toBeNull();
  if (!before) return;

  const handle = page.locator(".selection-box .handle.se");
  await expect(handle).toBeVisible();
  const handleBox = await handle.boundingBox();
  expect(handleBox).not.toBeNull();
  if (!handleBox) return;

  const start = {
    x: handleBox.x + handleBox.width / 2,
    y: handleBox.y + handleBox.height / 2
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 100, start.y + 50, { steps: 10 });

  // The regression this test protects against: dimensions must update while
  // the pointer is still held, not only after pointerup.
  await expect
    .poll(async () => (await object.boundingBox())?.width ?? 0)
    .toBeGreaterThan(before.width + 60);

  const during = await object.boundingBox();
  expect(during).not.toBeNull();
  await page.mouse.up();

  await expect
    .poll(async () => (await object.boundingBox())?.width ?? 0)
    .toBeGreaterThan(before.width + 60);
  await expect(text).toContainText("A long adaptive text block");
});