import { expect, test } from "@playwright/test";

test("service worker never serves API responses from Cache Storage", async ({ page }) => {
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

  const responseText = await page.evaluate(async () => {
    const probeCache = await caches.open("notylo-api-probe");
    await probeCache.put(
      "/api/sw-cache-probe",
      new Response("cached-api-response", {
        status: 200,
        headers: { "Content-Type": "text/plain" }
      })
    );

    try {
      const response = await fetch("/api/sw-cache-probe");
      return await response.text();
    } finally {
      await caches.delete("notylo-api-probe");
    }
  });

  expect(responseText).not.toBe("cached-api-response");
});
