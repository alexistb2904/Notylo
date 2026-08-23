import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "katex/dist/katex.min.css";
import "./styles.css";
import "./mobile-editor.css";
import "./public-editor.css";
import { App } from "./App";
import { AuthProvider } from "./lib/auth";
import { applyDocumentLocale } from "./i18n";

applyDocumentLocale();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  const isTauri = "__TAURI_INTERNALS__" in window;
  if (isTauri) {
    // Tauri already ships the complete frontend and persists notebooks via
    // IndexedDB. A browser service worker only adds a stale-shell failure mode.
    void navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => void registration.unregister());
    });
  } else {
    void navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .catch(() => undefined);
  }
}
