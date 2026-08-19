import { useState } from "react";
import { authErrorMessage, isCloudUnavailable, useAuth } from "../lib/auth";

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
          <p className="eyebrow">Compte Notylo</p>
          <h2 id="auth-dialog-title">{createAccount ? "Créer un compte" : "Se connecter"}</h2>
          <p className="auth-intro">
            {cloudUnavailable
              ? "Le cloud est indisponible pour le moment. Vos cahiers locaux restent accessibles."
              : required
                ? "Un compte autorisé est nécessaire pour accéder à cet espace."
                : "Vos cahiers restent sur cet appareil. Le compte prépare l’accès aux services privés."}
          </p>
        </div>
        <label>
          Adresse e-mail
          <input
            autoFocus
            autoComplete="email"
            inputMode="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          {!createAccount && (
            <small className="field-hint">
              Facultative avec une passkey : laissez vide pour choisir un appareil enregistré.
            </small>
          )}
        </label>
        <label>
          Mot de passe
          <input
            autoComplete={createAccount ? "new-password" : "current-password"}
            minLength={10}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          {createAccount && <small className="field-hint">10 caractères minimum.</small>}
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
              {createAccount ? "J’ai déjà un compte" : "Créer un compte"}
            </button>
          )}
          <button className="primary-action" disabled={pending} type="submit">
            {pending ? "Connexion…" : createAccount ? "Créer le compte" : "Se connecter"}
          </button>
        </div>
        {required && cloudUnavailable && (
          <button
            className="outline-action offline-access-button"
            type="button"
            onClick={continueOffline}
          >
            Continuer hors connexion
          </button>
        )}
        {!createAccount && window.PublicKeyCredential && (
          <button
            className="outline-action passkey-login"
            disabled={pending}
            type="button"
            onClick={() => void signInWithPasskey()}
          >
            {pending ? "Vérification…" : "Se connecter avec une passkey"}
          </button>
        )}
        {!required && (
          <button className="text-button menu-close" type="button" onClick={onClose}>
            Continuer sans compte
          </button>
        )}
      </form>
    </div>
  );
}
