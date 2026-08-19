const CACHE_PREFIX = "notylo-shell-";
const CACHE = `${CACHE_PREFIX}v2`;
const SHELL = ["/"];
const STATIC_DESTINATIONS = new Set(["style", "script", "font", "image", "worker"]);

function isDynamicRequest(request, url) {
  return (
    request.headers.has("Authorization") ||
    url.pathname === "/api" ||
    url.pathname.startsWith("/api/") ||
    url.pathname === "/ocr" ||
    url.pathname.startsWith("/ocr/")
  );
}

async function fetchAndCache(request, cacheKey = request) {
  const response = await fetch(request);
  if (!response.ok) return response;

  // A Response body is a one-shot stream. Clone it synchronously, before any
  // await/cache operation gives the page a chance to consume the original.
  const cachedResponse = response.clone();
  try {
    const cache = await caches.open(CACHE);
    await cache.put(cacheKey, cachedResponse);
  } catch {
    // Cache Storage is only an offline optimization. A cache failure must never
    // turn a successful network request into an application failure.
  }
  return response;
}

self.addEventListener("install", (event) =>
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  )
);

self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  )
);

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isDynamicRequest(request, url)) return;

  // Navigations are network-first so a deployed app is picked up immediately,
  // with the cached shell only used as an offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetchAndCache(request, "/").catch(async () => {
        return (await caches.match(request)) ?? (await caches.match("/")) ?? Response.error();
      })
    );
    return;
  }

  // Only immutable-ish browser resources are cached. Generic same-origin GETs
  // are deliberately left to the network so application data can never leak
  // into the shared service-worker cache.
  if (!STATIC_DESTINATIONS.has(request.destination)) return;

  event.respondWith(
    caches.match(request).then((cached) => cached ?? fetchAndCache(request))
  );
});
