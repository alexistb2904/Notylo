export const SERVICE_WORKER_UPDATE_EVENT = "notylo:service-worker-update";

const UPDATE_INTERVAL_MS = 60 * 60 * 1000;

export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;

  const isTauri = "__TAURI_INTERNALS__" in window;
  if (isTauri) {
    // Tauri ships the frontend with the application bundle. Browser service
    // workers can otherwise keep an obsolete shell around after an upgrade.
    void navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => void registration.unregister());
    });
    return;
  }

  void navigator.serviceWorker
    .register("/sw.js", { updateViaCache: "none" })
    .then((registration) => watchForUpdates(registration))
    .catch(() => undefined);
}

function watchForUpdates(registration: ServiceWorkerRegistration): void {
  let reloading = false;

  const announceWaitingWorker = () => {
    if (!registration.waiting) return;
    window.dispatchEvent(
      new CustomEvent<ServiceWorkerRegistration>(SERVICE_WORKER_UPDATE_EVENT, {
        detail: registration
      })
    );
  };

  const watchInstallingWorker = () => {
    const worker = registration.installing;
    if (!worker) return;
    worker.addEventListener("statechange", () => {
      if (worker.state === "installed" && navigator.serviceWorker.controller) {
        announceWaitingWorker();
      }
    });
  };

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  registration.addEventListener("updatefound", watchInstallingWorker);
  announceWaitingWorker();

  const checkForUpdate = () => {
    if (document.visibilityState !== "visible") return;
    void registration.update().catch(() => undefined);
  };

  window.setInterval(checkForUpdate, UPDATE_INTERVAL_MS);
  window.addEventListener("focus", checkForUpdate);
  document.addEventListener("visibilitychange", checkForUpdate);
}
