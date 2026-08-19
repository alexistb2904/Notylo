import { useState } from "react";
import { authErrorMessage, isCloudUnavailable, useAuth } from "../lib/auth";
import { t } from "../i18n";

export function AuthDialog({ onClose, required = false }: { onClose(): void; required?: boolean }) {
  const {
    login,
    register,
    loginWithPasskey,
    registrationEnabled,
    cloudUnavailable,
    continueOffline
  } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const createAccount = mode === "register";

  const submit = async () => {
    setError(undefined);
    setPending(true);
    try {
      if (createAccount) await register(email, password);
      else await login(email, password);
      onClose();
    } catch (reason) {
      if (required && isCloudUnavailable(reason)) {
        continueOffline();
        return;
      }
      setError(authErrorMessage(reason));
    } finally {
      setPending(false);
    }
  };
  const signInWithPasskey = async () => {
    setError(undefined);
    setPending(true);
    try {
      await loginWithPasskey(email);
      onClose();
    } catch (reason) {
      if (required && isCloudUnavailable(reason)) {
        continueOffline();
        return;
      }
      setError(authErrorMessage(reason));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form
        className="new-notebook-dialog auth-dialog"
        aria-labelledby="auth-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="dialog-title">
          <p className="eyebrow">{t("auth.account")}</p>
          <h2 id="auth-dialog-title">
            {createAccount ? t("auth.createAccount") : t("auth.signIn")}
          </h2>
          <p className="auth-intro">
            {cloudUnavailable
              ? t("auth.cloudUnavailable")
              : required
                ? t("auth.requiredIntro")
                : t("auth.optionalIntro")}
          </p>
        </div>
        <label>
          {t("auth.email")}
          <input
            autoFocus
            autoComplete="email"
            inputMode="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          {!createAccount && <small className="field-hint">{t("auth.passkeyHint")}</small>}
        </label>
        <label>
          {t("auth.password")}
          <input
            autoComplete={createAccount ? "new-password" : "current-password"}
            minLength={10}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          {createAccount && <small className="field-hint">{t("auth.passwordMinimum")}</small>}
        </label>
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions auth-actions">
          {(registrationEnabled || cloudUnavailable) && (
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setMode(createAccount ? "login" : "register");
                setError(undefined);
              }}
            >
              {createAccount ? t("auth.haveAccount") : t("auth.createAccount")}
            </button>
          )}
          <button className="primary-action" disabled={pending} type="submit">
            {pending
              ? t("auth.connecting")
              : createAccount
                ? t("auth.createAccountAction")
                : t("auth.signIn")}
          </button>
        </div>
        {required && cloudUnavailable && (
          <button
            className="outline-action offline-access-button"
            type="button"
            onClick={continueOffline}
          >
            {t("auth.continueOffline")}
          </button>
        )}
        {!createAccount && window.PublicKeyCredential && (
          <button
            className="outline-action passkey-login"
            disabled={pending}
            type="button"
            onClick={() => void signInWithPasskey()}
          >
            {pending ? t("auth.verifying") : t("auth.signInPasskey")}
          </button>
        )}
        {!required && (
          <button className="text-button menu-close" type="button" onClick={onClose}>
            {t("auth.continueWithoutAccount")}
          </button>
        )}
      </form>
    </div>
  );
}
