import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { EditorPage } from "./pages/EditorPage";
import { HomePage } from "./pages/HomePage";
import { PenDebugPage } from "./pages/PenDebugPage";
import { BenchmarkPage } from "./pages/BenchmarkPage";
import { ProfilePage } from "./pages/ProfilePage";
import { AuthDialog } from "./components/AuthDialog";
import { useAuth } from "./lib/auth";
import { PublicPage } from "./pages/PublicPage";
import { DesktopPasskeyPage } from "./pages/DesktopPasskeyPage";
import { t } from "./i18n";

const authRequired = ["true", "1", "yes"].includes(
  String(import.meta.env.VITE_REQUIRE_AUTH).toLowerCase()
);

export function App() {
  return (
    <AccessGate>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/notebook/:id" element={<EditorPage />} />
        <Route path="/debug/pen" element={<PenDebugPage />} />
        <Route path="/debug/benchmark" element={<BenchmarkPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/public/:token" element={<PublicPage />} />
        <Route path="/desktop/passkey" element={<DesktopPasskeyPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AccessGate>
  );
}

function AccessGate({ children }: { readonly children: React.ReactNode }) {
  const { ready, user, hasOfflineAccess } = useAuth();
  const location = useLocation();
  const isPublicShare = location.pathname.startsWith("/public/");
  const isDesktopPasskey = location.pathname === "/desktop/passkey";

  if (isPublicShare || isDesktopPasskey) return children;

  if (!authRequired || !ready) {
    if (!ready) {
      return (
        <main className="loading-state" aria-live="polite">
          <span className="brand-mark">P</span>
          <p>{t("app.verifyingAccess")}</p>
        </main>
      );
    }
    return children;
  }

  if (user || hasOfflineAccess) return children;

  return (
    <main className="access-gate">
      <div className="access-gate-intro">
        <span className="brand-mark">P</span>
        <p className="eyebrow">{t("app.privateSpace")}</p>
        <h1>{t("app.loginRequired")}</h1>
        <p>{t("app.loginRequiredDescription")}</p>
      </div>
      <AuthDialog required onClose={() => undefined} />
    </main>
  );
}
