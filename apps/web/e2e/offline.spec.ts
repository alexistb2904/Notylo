import { expect, test, type BrowserContext, type Page } from "@playwright/test";

async function enableOfflineShell(page: Page) {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;

    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(
        () => reject(new Error("Le service worker n'a pas pris le contrôle de la page.")),
        5_000
      );
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        () => {
          window.clearTimeout(timeout);
          resolve();
        },
        { once: true }
      );
    });
  });

  // The first page load happened before the worker controlled the tab. Reload
  // once online so every route/style/script used by the shell is cached through
  // the same fetch path a real installed PWA uses.
  await page.reload();
}

async function createNotebook(page: Page, name: string) {
  await page.goto("/");
  await page.getByRole("button", { name: /créer votre premier cahier/i }).click();
  await page.getByLabel("Nom").fill(name);
  await page.getByRole("button", { name: /créer le cahier/i }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

async function addText(page: Page, content: string) {
  await page.locator(".tool-rail").getByTitle("Texte (T)").click();
  const paper = page.getByLabel("Page du cahier").first();
  const box = await paper.boundingBox();
  if (!box) throw new Error("Notebook paper is not visible");
  await page.mouse.click(box.x + 220, box.y + 180);

  const text = page.locator(".text-object");
  await expect(text).toHaveCount(1);
  await text.fill(content);
  await text.blur();
}

async function storedText(page: Page): Promise<string | undefined> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("notylo-notes");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<string | undefined>((resolve, reject) => {
        const transaction = database.transaction("objects", "readonly");
        const request = transaction.objectStore("objects").getAll();
        request.onsuccess = () => {
          const text = (request.result as Array<{ type?: string; plainText?: string }>).find(
            (object) => object.type === "text"
          );
          resolve(text?.plainText);
        };
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  });
}

async function withOfflineContext(context: BrowserContext, task: () => Promise<void>) {
  await context.setOffline(true);
  try {
    await task();
  } finally {
    await context.setOffline(false);
  }
}

test("keeps a local notebook available after a full offline reload", async ({ page, context }) => {
  await enableOfflineShell(page);
  await createNotebook(page, "Offline E2E");
  await addText(page, "Disponible sans connexion");

  await expect.poll(() => storedText(page)).toBe("Disponible sans connexion");

  await withOfflineContext(context, async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Offline E2E" })).toBeVisible();
    await expect(page.locator(".text-object")).toHaveValue("Disponible sans connexion");
    await expect.poll(() => storedText(page)).toBe("Disponible sans connexion");
  });
});
