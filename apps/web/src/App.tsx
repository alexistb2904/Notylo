import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthDialog } from "./components/AuthDialog";
import { BrandMark } from "./components/BrandMark";
import { useAuth } from "./lib/auth";
import { t } from "./i18n";

const HomePage = lazy(() => import("./pages/HomePage").then(({ HomePage }) => ({ default: HomePage })));
const EditorPage = lazy(() => import("./pages/EditorPage").then(({ EditorPage }) => ({ default: EditorPage })));
const ProfilePage = lazy(() => import("./pages/ProfilePage").then(({ ProfilePage }) => ({ default: ProfilePage })));
const PublicPage = lazy(() => import("./pages/PublicPage").then(({ PublicPage }) => ({ default: PublicPage })));
const DesktopPasskeyPage = lazy(() =>
  import("./pages/DesktopPasskeyPage").then(({ DesktopPasskeyPage }) => ({ default: DesktopPasskeyPage }))
);

const PenDebugPage = import.meta.env.DEV
  ? lazy(() => import("./pages/PenDebugPage").then(({ PenDebugPage }) => ({ default: PenDebugPage })))
  : null;
const BenchmarkPage = import.meta.env.DEV
  ? lazy(() => import("./pages/BenchmarkPage").then(({ BenchmarkPage }) => ({ default: BenchmarkPage })))
  : null;

const authRequired = ["true", "1", "yes"].includes(
  String(import.meta.env.VITE_REQUIRE_AUTH).toLowerCase()
);

export function App() {
  return (
    <AccessGate>
      <Suspense fallback={<LoadingState label={t("app.loading")} />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/notebook/:id" element={<EditorPage />} />
          {PenDebugPage && <Route path="/debug/pen" element={<PenDebugPage />} />}
          {BenchmarkPage && <Route path="/debug/benchmark" element={<BenchmarkPage />} />}
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/public/:token" element={<PublicPage />} />
          <Route path="/desktop/passkey" element={<DesktopPasskeyPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AccessGate>
  );
}

function AccessGate({ children }: { readonly children: ReactNode }) {
  const { ready, user, hasOfflineAccess } = useAuth();
  const location = useLocation();
  const isPublicShare = location.pathname.startsWith("/public/");
  const isDesktopPasskey = location.pathname === "/desktop/passkey";

  if (isPublicShare || isDesktopPasskey) return children;

  if (!authRequired || !ready) {
    if (!ready) return <LoadingState label={t("app.verifyingAccess")} />;
    return children;
  }

  if (user || hasOfflineAccess) return children;

  return (
    <main className="access-gate">
      <div className="access-gate-intro">
        <BrandMark />
        <p className="eyebrow">{t("app.privateSpace")}</p>
        <h1>{t("app.loginRequired")}</h1>
        <p>{t("app.loginRequiredDescription")}</p>
      </div>
      <AuthDialog required onClose={() => undefined} />
    </main>
  );
}

function LoadingState({ label }: { readonly label: string }) {
  return (
    <main className="loading-state" aria-live="polite">
      <BrandMark />
      <p>{label}</p>
    </main>
  );
}
