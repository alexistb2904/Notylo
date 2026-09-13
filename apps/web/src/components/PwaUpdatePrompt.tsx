import { useEffect, useRef, useState } from "react";
import { pwaMessages } from "../i18n/pwa";
import { SERVICE_WORKER_UPDATE_EVENT } from "../lib/serviceWorker";

export function PwaUpdatePrompt() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration>();
  const [updating, setUpdating] = useState(false);
  const dismissedWorker = useRef<ServiceWorker | null>(null);

  useEffect(() => {
    const onUpdateAvailable = (event: Event) => {
      const nextRegistration = (event as CustomEvent<ServiceWorkerRegistration>).detail;
      const waiting = nextRegistration?.waiting;
      if (!waiting || waiting === dismissedWorker.current) return;
      setRegistration(nextRegistration);
      setUpdating(false);
    };

    window.addEventListener(SERVICE_WORKER_UPDATE_EVENT, onUpdateAvailable);
    return () => window.removeEventListener(SERVICE_WORKER_UPDATE_EVENT, onUpdateAvailable);
  }, []);

  const waiting = registration?.waiting;
  if (!waiting) return null;

  const applyUpdate = () => {
    setUpdating(true);
    waiting.postMessage({ type: "SKIP_WAITING" });
  };

  const dismiss = () => {
    dismissedWorker.current = waiting;
    setRegistration(undefined);
  };

  return (
    <aside className="pwa-update-prompt" role="status" aria-live="polite">
      <p>{pwaMessages.available}</p>
      <div className="pwa-update-actions">
        <button type="button" className="outline-action" onClick={dismiss} disabled={updating}>
          {pwaMessages.dismiss}
        </button>
        <button type="button" className="primary-action" onClick={applyUpdate} disabled={updating}>
          {pwaMessages.update}
        </button>
      </div>
    </aside>
  );
}
