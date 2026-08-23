import { expect, test, type Page } from "@playwright/test";

async function createNotebook(page: Page, name: string) {
  await page.goto("/");
  await page.getByRole("button", { name: /créer votre premier cahier/i }).click();
  await page.getByLabel("Nom").fill(name);
  await page.getByRole("button", { name: /créer le cahier/i }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

async function createWhiteboard(page: Page, name: string) {
  await page.goto("/");
  await page.getByRole("button", { name: /créer votre premier cahier/i }).click();
  await page.getByLabel("Nom").fill(name);
  await page.getByRole("button", { name: /whiteboard/i }).click();
  await page.getByRole("button", { name: /créer le cahier/i }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

async function visiblePaperRect(page: Page) {
  const paper = page.getByLabel("Page du cahier").first();
  const box = await paper.boundingBox();
  expect(box).not.toBeNull();
  if (!box) throw new Error("Notebook paper is not visible");
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  return {
    left: Math.max(0, box.x),
    right: Math.min(viewport.width, box.x + box.width),
    top: Math.max(0, box.y),
    bottom: Math.min(viewport.height, box.y + box.height),
    box
  };
}

async function drawStroke(page: Page, yOffset: number) {
  const visible = await visiblePaperRect(page);
  expect(visible.right - visible.left).toBeGreaterThan(220);
  expect(visible.bottom - visible.top).toBeGreaterThan(90);

  const start = {
    x: Math.min(visible.right - 190, visible.left + 100),
    y: Math.max(
      visible.top + 35,
      Math.min(visible.bottom - 35, visible.box.y + 100 + yOffset)
    )
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

async function drawRectangleIcon(page: Page) {
  const visible = await visiblePaperRect(page);
  const start = {
    x: Math.min(visible.right - 180, visible.left + 160),
    y: Math.min(visible.bottom - 130, visible.top + 190)
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 110, start.y + 72, { steps: 8 });
  await page.mouse.up();
}

async function storedObjectCount(page: Page, type: "ink" | "shape"): Promise<number> {
  return page.evaluate(async (objectType) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("notylo-notes");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<number>((resolve, reject) => {
        const transaction = database.transaction("objects", "readonly");
        const request = transaction.objectStore("objects").index("type").count(objectType);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  }, type);
}

const storedInkCount = (page: Page) => storedObjectCount(page, "ink");

test("creates and reopens a local notebook", async ({ page }) => {
  await createNotebook(page, "Maths E2E");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Maths E2E" })).toBeVisible();
});

test("creates a notebook from the mobile empty state", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 568 });
  await createNotebook(page, "Maths mobile");
});

test("organizes notebooks in local folders without changing notebook storage", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await createNotebook(page, "Maths dossier");
  await page.goto("/");

  await page.locator(".library-folder-action").click();
  await page.getByLabel("Nom du dossier").fill("Cours");
  await page.getByRole("button", { name: "Créer le dossier" }).click();
  await expect(page.getByRole("button", { name: "Ouvrir Cours" })).toBeVisible();

  await page.locator(".notebook-card").filter({ hasText: "Maths dossier" }).click();
  await page.getByLabel("Déplacer vers").selectOption({ label: "Cours" });
  await page.getByRole("button", { name: "Fermer" }).click();
  await expect(page.locator(".notebook-card").filter({ hasText: "Maths dossier" })).toBeHidden();
  await expect(page.locator(".folder-card").filter({ hasText: "1 cahier" })).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Ouvrir Cours" }).click();
  await expect(page.getByRole("heading", { name: "Cours" })).toBeVisible();
  await expect(page.locator(".notebook-card").filter({ hasText: "Maths dossier" })).toBeVisible();

  await page.getByRole("button", { name: "Gérer le dossier" }).click();
  await page.getByRole("button", { name: "Supprimer le dossier" }).click();
  await expect(page.getByRole("button", { name: "Ouvrir Cours" })).toBeHidden();
  await expect(page.locator(".notebook-card").filter({ hasText: "Maths dossier" })).toBeVisible();
});

test("keeps the mobile toolbar inside the dynamic viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createNotebook(page, "Mobile viewport E2E");

  const dock = page.getByRole("navigation", { name: "Outils rapides" });
  await expect(dock).toBeVisible();

  for (const height of [844, 700, 568]) {
    await page.setViewportSize({ width: 390, height });
    await expect(dock).toBeVisible();

    const metrics = await page.evaluate(() => {
      const shell = document.querySelector<HTMLElement>(".editor-shell");
      const header = document.querySelector<HTMLElement>(".editor-header");
      const main = document.querySelector<HTMLElement>(".editor-main");
      const canvas = document.querySelector<HTMLElement>(".canvas-area");
      const mobileDock = document.querySelector<HTMLElement>(".mobile-tool-dock");
      if (!shell || !header || !main || !canvas || !mobileDock)
        throw new Error("Mobile editor chrome is missing");
      const shellRect = shell.getBoundingClientRect();
      const headerRect = header.getBoundingClientRect();
      const mainRect = main.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      const dockRect = mobileDock.getBoundingClientRect();
      return {
        innerHeight: window.innerHeight,
        visualHeight: window.visualViewport?.height ?? window.innerHeight,
        shellTop: shellRect.top,
        shellBottom: shellRect.bottom,
        mainBottom: mainRect.bottom,
        canvasBottom: canvasRect.bottom,
        dockTop: dockRect.top,
        dockBottom: dockRect.bottom,
        headerBottom: headerRect.bottom
      };
    });

    const visibleHeight = Math.min(metrics.innerHeight, metrics.visualHeight);
    expect(metrics.shellTop).toBeGreaterThanOrEqual(-1);
    expect(metrics.shellBottom).toBeLessThanOrEqual(visibleHeight + 1);
    expect(Math.abs(metrics.shellBottom - visibleHeight)).toBeLessThanOrEqual(1);
    expect(Math.abs(metrics.mainBottom - metrics.shellBottom)).toBeLessThanOrEqual(1);
    expect(Math.abs(metrics.canvasBottom - metrics.shellBottom)).toBeLessThanOrEqual(1);
    expect(metrics.dockBottom).toBeLessThanOrEqual(visibleHeight + 1);
    expect(metrics.dockTop).toBeGreaterThan(metrics.headerBottom);
  }
});

test("shows settings in the mobile whiteboard tool menu", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await createWhiteboard(page, "Whiteboard mobile E2E");

  const dock = page.getByRole("navigation", { name: "Outils rapides" });
  await dock.getByRole("button", { name: "Plus d’outils" }).click();
  const sheet = page.locator(".tool-rail.mobile-sheet-open");
  await expect(sheet).toBeVisible();

  const settings = sheet.getByRole("button", { name: "Ouvrir les réglages" });
  await expect(settings).toBeVisible();
  await settings.click();
  await expect(sheet).toBeHidden();
  await expect(page.locator(".inspector")).toBeVisible();
  await expect(page.getByLabel("Fermer les réglages")).toBeVisible();
  await page.getByLabel("Fermer les réglages").click();
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
  await expect
    .poll(async () => {
      const box = await palette.boundingBox();
      return box ? dockBox.y - (box.y + box.height) : Number.POSITIVE_INFINITY;
    })
    .toBeLessThan(32);
  const paletteBox = await palette.boundingBox();
  expect(paletteBox).not.toBeNull();
  if (paletteBox) {
    const paletteBottom = paletteBox.y + paletteBox.height;
    expect(paletteBottom).toBeLessThan(dockBox.y);
    expect(dockBox.y - paletteBottom).toBeLessThan(32);
  }

  await dock.getByRole("button", { name: "Plus d’outils" }).click();
  const sheet = page.locator(".tool-rail.mobile-sheet-open");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Ouvrir les réglages" })).toBeVisible();
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
  await expect(brushes.getByRole("button", { name: /^Crayon Graphite/i })).toBeVisible();
  const brushBox = await brushes.boundingBox();
  expect(brushBox).not.toBeNull();
  if (brushBox) expect(brushBox.y + brushBox.height).toBeLessThanOrEqual(dockBox.y - 2);
});

test("previews an already placed vector shape while it is being dragged", async ({ page }) => {
  await createNotebook(page, "Shape drag E2E");
  const desktopTools = page.locator(".tool-rail");

  await desktopTools.getByTitle("Icônes de base").click();
  await page.getByRole("button", { name: "Carré" }).click();
  await drawRectangleIcon(page);
  await expect(page.locator(".vector-object-layer rect").first()).toBeVisible();
  await expect.poll(() => storedObjectCount(page, "shape")).toBe(1);

  // Re-open the document so the scenario exercises an existing persisted shape,
  // not the transient state immediately following insertion.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Shape drag E2E" })).toBeVisible();
  await desktopTools.getByTitle("Sélection (V)").click();
  await expect(desktopTools.getByTitle("Sélection (V)")).toHaveAttribute("aria-pressed", "true");

  const shape = page.locator(".vector-object-layer rect").first();
  await expect(shape).toBeVisible();
  const beforeTransform = await shape.getAttribute("transform");
  const box = await shape.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 86, center.y + 34, { steps: 12 });

  let liveTransform = beforeTransform;
  await expect
    .poll(async () => {
      liveTransform = await shape.getAttribute("transform");
      return liveTransform;
    })
    .not.toBe(beforeTransform);

  await page.mouse.up();
  await expect.poll(() => shape.getAttribute("transform")).not.toBe(beforeTransform);
  expect(liveTransform).not.toBeNull();
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

test("renders stamp-mask ink on canvas and keeps editor tools available", async ({ page }) => {
  await createNotebook(page, "Ink E2E");
  const desktopTools = page.locator(".tool-rail");

  await drawStroke(page, 0);
  await expect.poll(() => storedInkCount(page)).toBe(1);
  const inkSurface = page.locator(".ink-object-layer");
  await expect(inkSurface).toBeVisible();
  await expect.poll(() => inkSurface.evaluate((surface) => {
    const canvas = surface as HTMLCanvasElement;
    const context = canvas.getContext("2d");
    if (!context) return false;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let index = 3; index < pixels.length; index += 4) if (pixels[index]) return true;
    return false;
  })).toBe(true);

  await desktopTools.getByTitle("Brosses").click();
  const brushDialog = page.getByRole("dialog", { name: "Brosses et épaisseurs" });
  const pencilPreset = brushDialog.getByRole("button", { name: /^Crayon Graphite/i });
  await pencilPreset.click();
  await expect(desktopTools.getByTitle("Crayon")).toHaveAttribute("aria-pressed", "true");

  await drawStroke(page, 90);
  await expect.poll(() => storedInkCount(page)).toBe(2);
  await expect(page.locator(".ink-object-layer")).toHaveCount(1);

  await desktopTools.getByTitle("Brosses").click();
  await expect(
    page.getByRole("dialog", { name: "Brosses et épaisseurs" }).getByRole("button", {
      name: /^Crayon Graphite/i
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
  await desktopTools.getByRole("button", { name: "Réglages" }).click();
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
