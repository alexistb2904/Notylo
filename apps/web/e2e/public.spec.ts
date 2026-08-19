import { expect, test, type Page } from "@playwright/test";

const makeDocument = (title: string) => ({
  schemaVersion: 1,
  notebook: {
    id: `nb-${title.toLowerCase().replace(/\s+/g, "-")}`,
    title,
    mode: "book" as const,
    createdAt: 1,
    updatedAt: 1,
    settings: {
      autoCalculate: true,
      palmRejection: "auto" as const,
      preferredBackground: "grid-5" as const,
      darkPaper: false,
      pageGap: 48
    },
    schemaVersion: 1,
    coverColor: "#476960"
  },
  pages: [
    {
      id: "page-public-1",
      notebookId: `nb-${title.toLowerCase().replace(/\s+/g, "-")}`,
      index: 0,
      width: 794,
      height: 1123,
      format: "a4" as const,
      background: { kind: "grid-5" as const, color: "#ffffff", lineColor: "#dedede" },
      objectIds: [],
      createdAt: 1,
      updatedAt: 1
    }
  ],
  objects: [],
  assets: []
});

async function mockPublicNotebook(page: Page, token: string, mode: "read" | "write") {
  const document = makeDocument(mode === "read" ? "Lecture publique" : "Édition publique");
  await page.route(`http://localhost:3001/public/notebooks/${token}`, async (route) => {
    const headers = {
      "access-control-allow-origin": "*",
      "content-type": "application/json"
    };
    if (route.request().method() === "PUT") {
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({ document, revision: 2, mode })
      });
      return;
    }
    await route.fulfill({
      status: 200,
      headers,
      body: JSON.stringify({ document, revision: 1, mode })
    });
  });
}

async function touchDrag(
  page: Page,
  start: { x: number; y: number },
  end: { x: number; y: number }
) {
  const client = await page.context().newCDPSession(page);
  await client.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  const point = (x: number, y: number) => ({ x, y, id: 1, radiusX: 2, radiusY: 2, force: 1 });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [point(start.x, start.y)]
  });
  await page.waitForTimeout(30);
  await client.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [point(end.x, end.y)]
  });
  await page.waitForTimeout(40);
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await client.detach();
}

async function documentTransform(page: Page) {
  return page.locator(".document-space").getAttribute("style");
}

test("public read-only link is mobile-friendly and pans with one finger", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockPublicNotebook(page, "read-mobile", "read");
  await page.goto("/public/read-mobile");

  const header = page.locator(".public-editor-header--read");
  await expect(header).toBeVisible();
  await expect(header.getByText("Lecture seule")).toBeVisible();
  await expect(page.getByLabel("Retour à Notylo")).toBeVisible();
  await expect(page.getByTitle("Ajouter une page")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Outils rapides" })).toHaveCount(0);

  const headerBox = await header.boundingBox();
  expect(headerBox).not.toBeNull();
  if (headerBox) {
    expect(headerBox.x).toBeGreaterThanOrEqual(0);
    expect(headerBox.x + headerBox.width).toBeLessThanOrEqual(390.5);
  }

  const canvas = page.locator(".canvas-area");
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  if (!canvasBox) return;
  const before = await documentTransform(page);
  const start = { x: canvasBox.x + canvasBox.width * 0.55, y: canvasBox.y + canvasBox.height * 0.45 };
  await touchDrag(page, start, { x: start.x + 64, y: start.y + 52 });
  await expect.poll(() => documentTransform(page)).not.toBe(before);
});

test("stylus-only mode reserves pen for ink and lets one finger pan", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("notylo-stylus-only", "true"));
  await mockPublicNotebook(page, "write-mobile", "write");
  await page.goto("/public/write-mobile");

  const header = page.locator(".public-editor-header--write");
  await expect(header).toBeVisible();
  await expect(header.getByText("Lecture et écriture")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Outils rapides" })).toBeVisible();

  const canvas = page.locator(".canvas-area");
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  if (!canvasBox) return;
  const before = await documentTransform(page);
  const start = { x: canvasBox.x + canvasBox.width * 0.48, y: canvasBox.y + canvasBox.height * 0.38 };
  await touchDrag(page, start, { x: start.x + 58, y: start.y + 46 });
  await expect.poll(() => documentTransform(page)).not.toBe(before);
  await expect(page.locator(".vector-object-layer path")).toHaveCount(0);
});

test("floating drawing palette can be repositioned with a finger on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockPublicNotebook(page, "palette-mobile", "write");
  await page.goto("/public/palette-mobile");

  const palette = page.getByRole("toolbar", { name: "Palette de dessin" });
  const grip = page.getByRole("button", { name: "Déplacer la palette" });
  await expect(palette).toBeVisible();
  await expect(grip).toBeVisible();

  const before = await palette.boundingBox();
  const gripBox = await grip.boundingBox();
  expect(before).not.toBeNull();
  expect(gripBox).not.toBeNull();
  if (!before || !gripBox) return;

  const start = { x: gripBox.x + gripBox.width / 2, y: gripBox.y + gripBox.height / 2 };
  await touchDrag(page, start, { x: start.x + 56, y: Math.max(80, start.y - 52) });

  await expect
    .poll(async () => {
      const after = await palette.boundingBox();
      if (!after) return 0;
      return Math.hypot(after.x - before.x, after.y - before.y);
    })
    .toBeGreaterThan(20);

  const after = await palette.boundingBox();
  if (after) {
    expect(after.x).toBeGreaterThanOrEqual(0);
    expect(after.x + after.width).toBeLessThanOrEqual(390.5);
    expect(after.y).toBeGreaterThanOrEqual(58);
    expect(after.y + after.height).toBeLessThanOrEqual(844.5);
  }
});
