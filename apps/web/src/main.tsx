import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "katex/dist/katex.min.css";
import "./styles.css";
import "./mobile-editor.css";
import "./public-editor.css";
import "./pwa-update.css";
import { App } from "./App";
import { AuthProvider } from "./lib/auth";
import { applyDocumentLocale } from "./i18n";
import { registerServiceWorker } from "./lib/serviceWorker";
import { installVisualViewportHeightSync } from "./lib/viewport";

applyDocumentLocale();
installVisualViewportHeightSync();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);

registerServiceWorker();
