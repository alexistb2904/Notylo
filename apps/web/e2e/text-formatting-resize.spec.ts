import { expect, test, type Page } from "@playwright/test";

async function createNotebook(page: Page, name: string) {
  await page.goto("/");
  await page.getByRole("button", { name: /créer votre premier cahier/i }).click();
  await page.getByLabel("Nom").fill(name);
  await page.getByRole("button", { name: /créer le cahier/i }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

async function addTextObject(page: Page) {
  const tools = page.locator(".tool-rail");
  await tools.getByTitle("Texte (T)").click();
  const paper = page.getByLabel("Page du cahier").first();
  const box = await paper.boundingBox();
  expect(box).not.toBeNull();
  if (!box) throw new Error("Notebook paper is not visible");
  await page.mouse.click(box.x + 220, box.y + 180);
  await expect(page.locator(".dom-object.text")).toHaveCount(1);
  await expect(page.getByRole("toolbar", { name: "Mise en forme du texte" })).toBeVisible();
}

test("formats a text block and previews resize before pointer release", async ({ page }) => {
  await createNotebook(page, "Texte adaptatif E2E");
  await addTextObject(page);

  const text = page.locator(".text-object");
  await text.fill("Titre adaptatif");
  await text.blur();

  const toolbar = page.getByRole("toolbar", { name: "Mise en forme du texte" });
  await toolbar.getByLabel("Police").selectOption("Manrope, sans-serif");
  const size = toolbar.getByLabel("Taille de police");
  await size.fill("32");
  await size.press("Enter");
  await toolbar.getByRole("button", { name: "Gras" }).click();
  await toolbar.getByRole("button", { name: "Italique" }).click();
  await toolbar.getByRole("button", { name: "Centrer le texte" }).click();

  await expect.poll(async () =>
    text.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        family: style.fontFamily,
        size: style.fontSize,
        weight: style.fontWeight,
        fontStyle: style.fontStyle,
        align: style.textAlign
      };
    })
  ).toMatchObject({
    size: "32px",
    weight: "700",
    fontStyle: "italic",
    align: "center"
  });

  const object = page.locator(".dom-object.text");
  const before = await object.boundingBox();
  expect(before).not.toBeNull();
  if (!before) return;

  const handle = page.locator(".selection-box .handle.se");
  const handleBox = await handle.boundingBox();
  expect(handleBox).not.toBeNull();
  if (!handleBox) return;

  const start = { x: handleBox.x + handleBox.width / 2, y: handleBox.y + handleBox.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 110, start.y + 64, { steps: 8 });

  const live = await object.boundingBox();
  expect(live).not.toBeNull();
  if (!live) return;
  expect(live.width).toBeGreaterThan(before.width + 80);
  expect(live.height).toBeGreaterThan(before.height + 40);

  await page.mouse.up();
  const committed = await object.boundingBox();
  expect(committed).not.toBeNull();
  if (!committed) return;
  expect(committed.width).toBeGreaterThan(before.width + 80);

  const committedWidth = committed.width;
  await page.reload();
  const reopened = await page.locator(".dom-object.text").boundingBox();
  expect(reopened).not.toBeNull();
  if (reopened) expect(Math.abs(reopened.width - committedWidth)).toBeLessThan(2);
});
