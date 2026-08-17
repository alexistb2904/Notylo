import { useEffect, useState } from "react";
import { KeyRound, LogOut, Pencil, Plus, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { startRegistration } from "@simplewebauthn/browser";
import { api, type Passkey } from "../lib/api";
import { authErrorMessage, useAuth } from "../lib/auth";

type Notice = { readonly kind: "success" | "error"; readonly message: string } | undefined;

export function ProfilePage() {
  const { user, accessToken, updateUser, logout } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [passkeys, setPasskeys] = useState<readonly Passkey[]>([]);
  const [passkeyName, setPasskeyName] = useState("");
  const [password, setPassword] = useState({ current: "", next: "", confirmation: "" });
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [notice, setNotice] = useState<Notice>();
  const [pending, setPending] = useState<string>();

  const loadPasskeys = async () => {
    if (!accessToken) return;
    setPasskeys((await api.passkeys(accessToken)).passkeys);
  };
  useEffect(() => {
    void loadPasskeys().catch((error) =>
      setNotice({ kind: "error", message: authErrorMessage(error) })
    );
  }, [accessToken]);
  if (!user || !accessToken) return <Navigate to="/" replace />;

  const run = async (action: string, task: () => Promise<void>) => {
    setNotice(undefined);
    setPending(action);
    try {
      await task();
    } catch (error) {
      setNotice({ kind: "error", message: authErrorMessage(error) });
    } finally {
      setPending(undefined);
    }
  };
  const saveProfile = () =>
    run("profile", async () => {
      const result = await api.updateProfile(accessToken, displayName);
      updateUser(result.user);
      setNotice({ kind: "success", message: "Profil enregistré." });
    });
  const savePassword = () =>
    run("password", async () => {
      if (password.next !== password.confirmation)
        throw new Error("Les deux nouveaux mots de passe ne correspondent pas.");
      await api.changePassword(accessToken, password.current, password.next);
      setPassword({ current: "", next: "", confirmation: "" });
      setNotice({ kind: "success", message: "Mot de passe mis à jour." });
    });
  const addPasskey = () =>
    run("passkey", async () => {
      if (!window.PublicKeyCredential)
        throw new Error("Les passkeys ne sont pas prises en charge par ce navigateur.");
      const options = await api.passkeyRegistrationOptions(
        accessToken,
        passkeyName.trim() || "Nouvelle passkey"
      );
      const response = await startRegistration({ optionsJSON: options as never });
      await api.passkeyRegistrationVerify(accessToken, response);
      setPasskeyName("");
      await loadPasskeys();
      setNotice({
        kind: "success",
        message: "Passkey ajoutée. Vous pouvez en enregistrer autant que nécessaire."
      });
    });
  const renamePasskey = (passkey: Passkey) => {
    const name = window.prompt("Nom de la passkey", passkey.label)?.trim();
    if (!name || name === passkey.label) return;
    void run(`rename:${passkey.id}`, async () => {
      await api.renamePasskey(accessToken, passkey.id, name);
      await loadPasskeys();
      setNotice({ kind: "success", message: "Passkey renommée." });
    });
  };
  const removePasskey = (passkey: Passkey) => {
    if (!window.confirm(`Supprimer la passkey « ${passkey.label} » ?`)) return;
    void run(`delete:${passkey.id}`, async () => {
      await api.deletePasskey(accessToken, passkey.id);
      await loadPasskeys();
      setNotice({ kind: "success", message: "Passkey supprimée." });
    });
  };
  const deleteAccount = () =>
    run("account", async () => {
      await api.deleteAccount(accessToken, deletePassword, deleteConfirmation);
      logout();
    });

  return (
    <main className="profile-shell">
      <header className="profile-header">
        <Link className="text-button" to="/">
          ← Mes cahiers
        </Link>
        <button className="account-button" type="button" onClick={logout}>
          <LogOut size={15} /> Se déconnecter
        </button>
      </header>
      <div className="profile-heading">
        <p className="eyebrow">Compte Notylo</p>
        <h1>Profil et sécurité</h1>
        <p>Gérez votre identité, vos méthodes de connexion et vos données cloud.</p>
      </div>
      {notice && (
        <p
          className={`profile-notice ${notice.kind}`}
          role={notice.kind === "error" ? "alert" : "status"}
        >
          {notice.message}
        </p>
      )}
      <div className="profile-grid">
        <section className="profile-card" aria-labelledby="profile-identity-title">
          <div className="profile-card-heading">
            <UserRound size={19} />
            <div>
              <h2 id="profile-identity-title">Profil</h2>
              <p>Vos informations visibles dans Notylo.</p>
            </div>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void saveProfile();
            }}
          >
            <label>
              Adresse e-mail
              <input value={user.email} readOnly aria-readonly="true" />
            </label>
            <label>
              Nom affiché
              <input
                value={displayName}
                maxLength={80}
                autoComplete="name"
                onChange={(event) => setDisplayName(event.target.value)}
                required
              />
            </label>
            <button className="primary-action" disabled={pending === "profile"} type="submit">
              {pending === "profile" ? "Enregistrement…" : "Enregistrer le profil"}
            </button>
          </form>
        </section>
        <section className="profile-card" aria-labelledby="profile-password-title">
          <div className="profile-card-heading">
            <ShieldCheck size={19} />
            <div>
              <h2 id="profile-password-title">Mot de passe</h2>
              <p>Choisissez un mot de passe unique d’au moins 10 caractères.</p>
            </div>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void savePassword();
            }}
          >
            <input type="hidden" autoComplete="username" value={user.email} readOnly />
            <label>
              Mot de passe actuel
              <input
                type="password"
                autoComplete="current-password"
                value={password.current}
                onChange={(event) => setPassword({ ...password, current: event.target.value })}
                required
              />
            </label>
            <label>
              Nouveau mot de passe
              <input
                type="password"
                minLength={10}
                autoComplete="new-password"
                value={password.next}
                onChange={(event) => setPassword({ ...password, next: event.target.value })}
                required
              />
            </label>
            <label>
              Confirmer le nouveau mot de passe
              <input
                type="password"
                minLength={10}
                autoComplete="new-password"
                value={password.confirmation}
                onChange={(event) => setPassword({ ...password, confirmation: event.target.value })}
                required
              />
            </label>
            <button className="outline-action" disabled={pending === "password"} type="submit">
              {pending === "password" ? "Mise à jour…" : "Modifier le mot de passe"}
            </button>
          </form>
        </section>
        <section
          className="profile-card profile-card-wide"
          aria-labelledby="profile-passkeys-title"
        >
          <div className="profile-card-heading">
            <KeyRound size={19} />
            <div>
              <h2 id="profile-passkeys-title">Passkeys</h2>
              <p>
                Ajoutez plusieurs téléphones, ordinateurs ou clés de sécurité pour vous connecter
                sans mot de passe.
              </p>
            </div>
          </div>
          {window.PublicKeyCredential ? (
            <form
              className="passkey-add"
              onSubmit={(event) => {
                event.preventDefault();
                void addPasskey();
              }}
            >
              <label>
                Nom de la nouvelle passkey
                <input
                  value={passkeyName}
                  maxLength={80}
                  placeholder="ex. iPhone personnel"
                  onChange={(event) => setPasskeyName(event.target.value)}
                />
              </label>
              <button className="primary-action" disabled={pending === "passkey"} type="submit">
                <Plus size={16} /> {pending === "passkey" ? "Ajout…" : "Ajouter une passkey"}
              </button>
            </form>
          ) : (
            <p className="profile-muted">Ce navigateur ne prend pas en charge les passkeys.</p>
          )}
          <div className="passkey-list" aria-live="polite">
            {passkeys.length ? (
              passkeys.map((passkey) => (
                <article key={passkey.id} className="passkey-item">
                  <KeyRound size={18} />
                  <div>
                    <strong>{passkey.label}</strong>
                    <span>
                      {passkey.backedUp ? "Synchronisée" : "Appareil unique"} · ajoutée le{" "}
                      {formatDate(passkey.createdAt)}
                      {passkey.lastUsedAt ? ` · utilisée le ${formatDate(passkey.lastUsedAt)}` : ""}
                    </span>
                  </div>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={`Renommer ${passkey.label}`}
                    disabled={Boolean(pending)}
                    onClick={() => renamePasskey(passkey)}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    className="icon-button danger-icon"
                    type="button"
                    aria-label={`Supprimer ${passkey.label}`}
                    disabled={Boolean(pending)}
                    onClick={() => removePasskey(passkey)}
                  >
                    <Trash2 size={15} />
                  </button>
                </article>
              ))
            ) : (
              <p className="profile-muted">
                Aucune passkey enregistrée. Votre mot de passe reste disponible pour vous connecter.
              </p>
            )}
          </div>
        </section>
        <section className="profile-card profile-danger" aria-labelledby="profile-delete-title">
          <div className="profile-card-heading">
            <Trash2 size={19} />
            <div>
              <h2 id="profile-delete-title">Supprimer le compte</h2>
              <p>
                Cette action efface définitivement les cahiers et pièces jointes stockés dans votre
                cloud. Les données uniquement locales restent sur cet appareil.
              </p>
            </div>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void deleteAccount();
            }}
          >
            <input type="hidden" autoComplete="username" value={user.email} readOnly />
            <label>
              Mot de passe actuel
              <input
                type="password"
                autoComplete="current-password"
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.target.value)}
                required
              />
            </label>
            <label>
              Tapez <strong>SUPPRIMER</strong> pour confirmer
              <input
                value={deleteConfirmation}
                autoComplete="off"
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                required
              />
            </label>
            <button
              className="danger-action"
              disabled={pending === "account" || deleteConfirmation !== "SUPPRIMER"}
              type="submit"
            >
              {pending === "account" ? "Suppression…" : "Supprimer définitivement mon compte"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value));
}
