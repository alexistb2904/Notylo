import { useMemo, useState } from "react";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { KeyRound } from "lucide-react";
import { api } from "../lib/api";
import { authErrorMessage } from "../lib/auth";
import { t } from "../i18n";

type FlowMode = "login" | "registration";

export function DesktopPasskeyPage() {
  const { state, mode } = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const state = params.get("state") ?? "";
    const requestedMode = params.get("mode");
    return {
      state,
      mode: requestedMode === "registration" ? "registration" : "login" as FlowMode
    };
  }, []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const validState = /^[A-Za-z0-9_-]{43,128}$/.test(state);

  const continueToDesktop = (url: string) => window.location.replace(url);
  const continueWithPasskey = async () => {
    if (!validState || pending) return;
    setError(undefined);
    setPending(true);
    try {
      if (mode === "registration") {
        const options = await api.desktopPasskeyRegistrationOptions(state);
        const response = await startRegistration({ optionsJSON: options as never });
        const result = await api.desktopPasskeyRegistrationVerify(state, response);
        continueToDesktop(result.continueUrl);
      } else {
        const options = await api.desktopPasskeyLoginOptions(state);
        const response = await startAuthentication({ optionsJSON: options as never });
        const result = await api.desktopPasskeyLoginVerify(state, response);
        continueToDesktop(result.continueUrl);
      }
    } catch (reason) {
      setError(authErrorMessage(reason));
      setPending(false);
    }
  };

  return (
    <main className="desktop-passkey-page">
      <section className="desktop-passkey-card" aria-labelledby="desktop-passkey-title">
        <span className="brand-mark"><KeyRound size={24} /></span>
        <p className="eyebrow">Notylo · {t("auth.passkeyBrowser")}</p>
        <h1 id="desktop-passkey-title">
          {mode === "registration" ? t("auth.passkeyCreateTitle") : t("auth.passkeySignInTitle")}
        </h1>
        <p>{t("auth.passkeyBrowserIntro")}</p>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="primary-action" type="button" disabled={!validState || pending} onClick={() => void continueWithPasskey()}>
          {pending ? t("auth.verifying") : t("auth.continueWithPasskey")}
        </button>
        <small>{t("auth.passkeyBrowserSafety")}</small>
      </section>
    </main>
  );
}
