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
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  const visibleLeft = Math.max(0, box.x);
  const visibleRight = Math.min(viewport.width, box.x + box.width);
  const visibleTop = Math.max(0, box.y);
  const visibleBottom = Math.min(viewport.height, box.y + box.height);
  expect(visibleRight - visibleLeft).toBeGreaterThan(220);
  expect(visibleBottom - visibleTop).toBeGreaterThan(90);

  const start = {
    x: Math.min(visibleRight - 190, visibleLeft + 100),
    y: Math.max(visibleTop + 35, Math.min(visibleBottom - 35, box.y + 100 + yOffset))
  };
  const target = await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y);
    return {
      tag: element?.tagName ?? "none",
      className:
        typeof element?.className === "string"
          ? element.className
          : element?.getAttribute("class") ?? "",
      onPaper: Boolean(element?.closest(".paper")),
      inCanvas: Boolean(element?.closest(".canvas-area"))
    };
  }, start);
  expect(target, `drawing target was ${target.tag}.${target.className}`).toMatchObject({
    onPaper: true,
    inCanvas: true
  });

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 70, start.y + 18, { steps: 7 });
  await page.mouse.move(start.x + 150, start.y - 8, { steps: 7 });
  await page.mouse.up();
}

async function storedInkCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("notylo-notes");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<number>((resolve, reject) => {
        const transaction = database.transaction("objects", "readonly");
        const request = transaction.objectStore("objects").index("type").count("ink");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  });
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

test("uses a thumb-friendly mobile tool dock and bottom sheets", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createNotebook(page, "Mobile tools E2E");

  const dock = page.getByRole("navigation", { name: "Outils rapides" });
  await expect(dock).toBeVisible();
  await expect(dock.getByRole("button")).toHaveCount(6);
  await expect(page.getByLabel("Afficher les outils")).toBeHidden();
  await expect(page.getByLabel("Annuler")).toBeVisible();
  await expect(page.getByLabel("Rétablir")).toBeVisible();

  const dockBox = await dock.boundingBox();
  expect(dockBox).not.toBeNull();
  if (!dockBox) return;
  expect(dockBox.y + dockBox.height).toBeLessThanOrEqual(844);
  expect(dockBox.y).toBeGreaterThan(740);

  const palette = page.getByRole("toolbar", { name: "Palette de dessin" });
  await expect(palette).toBeVisible();
  const paletteBox = await palette.boundingBox();
  expect(paletteBox).not.toBeNull();
  if (paletteBox) expect(paletteBox.y + paletteBox.height).toBeLessThan(dockBox.y);

  await dock.getByRole("button", { name: "Plus d’outils" }).click();
  const sheet = page.locator(".tool-rail.mobile-sheet-open");
  await expect(sheet).toBeVisible();
  const sheetBox = await sheet.boundingBox();
  expect(sheetBox).not.toBeNull();
  if (sheetBox) {
    expect(sheetBox.width).toBeGreaterThan(340);
    expect(sheetBox.y + sheetBox.height).toBeLessThanOrEqual(dockBox.y - 2);
  }

  await sheet.getByTitle("Texte (T)").click();
  await expect(sheet).toBeHidden();

  await dock.getByRole("button", { name: "Stylo" }).click();
  await expect(palette).toBeVisible();
  await dock.getByRole("button", { name: "Plus d’outils" }).click();
  await page.locator(".tool-rail.mobile-sheet-open").getByTitle("Brosses").click();

  const brushes = page.getByRole("dialog", { name: "Brosses et épaisseurs" });
  await expect(brushes).toBeVisible();
  await expect(brushes.getByRole("button", { name: /^Crayon\b/i })).toBeVisible();
  const brushBox = await brushes.boundingBox();
  expect(brushBox).not.toBeNull();
  if (brushBox) expect(brushBox.y + brushBox.height).toBeLessThanOrEqual(dockBox.y - 2);
});

test("pans with the middle mouse button without drawing", async ({ page }) => {
  await createNotebook(page, "Middle pan E2E");
  const desktopTools = page.locator(".tool-rail");
  await expect(desktopTools.getByTitle("Stylo (P)")).toHaveAttribute("aria-pressed", "true");

  const paper = page.getByLabel("Page du cahier").first();
  const before = await paper.boundingBox();
  expect(before).not.toBeNull();
  if (!before) return;

  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  const start = {
    x: Math.max(80, Math.min(viewport.width - 220, before.x + 180)),
    y: Math.max(120, Math.min(viewport.height - 160, before.y + 180))
  };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(start.x + 72, start.y + 46, { steps: 6 });
  await page.mouse.up({ button: "middle" });

  const after = await paper.boundingBox();
  expect(after).not.toBeNull();
  if (!after) return;
  expect(after.x - before.x).toBeGreaterThan(60);
  expect(after.y - before.y).toBeGreaterThan(34);
  await expect.poll(() => storedInkCount(page)).toBe(0);
  await expect(desktopTools.getByTitle("Stylo (P)")).toHaveAttribute("aria-pressed", "true");
});

test("renders live ink as vectors and keeps editor tools available", async ({ page }) => {
  await createNotebook(page, "Ink E2E");
  const desktopTools = page.locator(".tool-rail");

  await drawStroke(page, 0);
  await expect.poll(() => storedInkCount(page)).toBe(1);
  await expect(page.locator(".vector-object-layer path")).toHaveCount(1);

  await desktopTools.getByTitle("Brosses").click();
  const brushDialog = page.getByRole("dialog", { name: "Brosses et épaisseurs" });
  const pencilPreset = brushDialog.getByRole("button", { name: /^Crayon\b/i });
  await pencilPreset.click();
  await expect(desktopTools.getByTitle("Crayon")).toHaveAttribute("aria-pressed", "true");

  await drawStroke(page, 90);
  await expect.poll(() => storedInkCount(page)).toBe(2);
  // Pen = one outline. Pencil = one outline + one vector graphite texture path.
  await expect(page.locator(".vector-object-layer path")).toHaveCount(3);

  await desktopTools.getByTitle("Brosses").click();
  await expect(
    page.getByRole("dialog", { name: "Brosses et épaisseurs" }).getByRole("button", {
      name: /^Crayon\b/i
    })
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Fermer" }).click();

  for (const tool of ["Surligneur", "Gomme (E)", "Texte (T)", "Forme libre", "Équation", "Tableau"]) {
    const button = desktopTools.getByTitle(tool);
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
  }

  await desktopTools.getByTitle("Icônes de base").click();
  await expect(page.getByRole("dialog", { name: "Icônes de base" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Carré" })).toBeVisible();

  await page.getByRole("button", { name: "Fermer" }).click();
  await desktopTools.getByTitle("Gomme (E)").click();
  await desktopTools.getByTitle("Propriétés").click();
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
