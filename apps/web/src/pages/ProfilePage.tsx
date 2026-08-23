import { useEffect, useState } from "react";
import { KeyRound, LogOut, Pencil, Plus, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { startRegistration } from "@simplewebauthn/browser";
import { api, isTauri, type Passkey } from "../lib/api";
import { authErrorMessage, useAuth } from "../lib/auth";
import { formatDate, t } from "../i18n";

type Notice = { readonly kind: "success" | "error"; readonly message: string } | undefined;

export function ProfilePage() {
  const { user, accessToken, updateUser, logout, registerPasskeyWithBrowser } = useAuth();
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
    void loadPasskeys().catch((error) => setNotice({ kind: "error", message: authErrorMessage(error) }));
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
  const saveProfile = () => run("profile", async () => {
    const result = await api.updateProfile(accessToken, displayName);
    updateUser(result.user);
    setNotice({ kind: "success", message: t("profile.saved") });
  });
  const savePassword = () => run("password", async () => {
    if (password.next !== password.confirmation) throw new Error(t("profile.passwordMismatch"));
    await api.changePassword(accessToken, password.current, password.next);
    setPassword({ current: "", next: "", confirmation: "" });
    setNotice({ kind: "success", message: t("profile.passwordUpdated") });
  });
  const addPasskey = () => run("passkey", async () => {
    if (isTauri) {
      await registerPasskeyWithBrowser(passkeyName.trim() || t("profile.newPasskey"));
      setPasskeyName("");
      await loadPasskeys();
      setNotice({ kind: "success", message: t("profile.passkeyAdded") });
      return;
    }
    if (!window.PublicKeyCredential) throw new Error(t("auth.passkeysUnsupported"));
    const options = await api.passkeyRegistrationOptions(accessToken, passkeyName.trim() || t("profile.newPasskey"));
    const response = await startRegistration({ optionsJSON: options as never });
    await api.passkeyRegistrationVerify(accessToken, response);
    setPasskeyName("");
    await loadPasskeys();
    setNotice({ kind: "success", message: t("profile.passkeyAdded") });
  });
  const renamePasskey = (passkey: Passkey) => {
    const name = window.prompt(t("profile.passkeyNamePrompt"), passkey.label)?.trim();
    if (!name || name === passkey.label) return;
    void run(`rename:${passkey.id}`, async () => {
      await api.renamePasskey(accessToken, passkey.id, name);
      await loadPasskeys();
      setNotice({ kind: "success", message: t("profile.passkeyRenamed") });
    });
  };
  const removePasskey = (passkey: Passkey) => {
    if (!window.confirm(t("profile.deletePasskeyConfirm", { label: passkey.label }))) return;
    void run(`delete:${passkey.id}`, async () => {
      await api.deletePasskey(accessToken, passkey.id);
      await loadPasskeys();
      setNotice({ kind: "success", message: t("profile.passkeyDeleted") });
    });
  };
  const deleteAccount = () => run("account", async () => {
    // The backend wire protocol keeps the historical canonical keyword while the UI is localized.
    await api.deleteAccount(accessToken, deletePassword, "SUPPRIMER");
    await logout();
  });
  const deleteKeyword = t("profile.deleteKeyword");

  return (
    <main className="profile-shell">
      <header className="profile-header">
        <Link className="text-button" to="/">{t("profile.backNotebooks")}</Link>
        <button className="account-button" type="button" onClick={() => void logout()}><LogOut size={15} /> {t("home.signOut")}</button>
      </header>
      <div className="profile-heading">
        <p className="eyebrow">{t("auth.account")}</p>
        <h1>{t("profile.title")}</h1>
        <p>{t("profile.intro")}</p>
      </div>
      {notice && <p className={`profile-notice ${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>{notice.message}</p>}
      <div className="profile-grid">
        <section className="profile-card" aria-labelledby="profile-identity-title">
          <div className="profile-card-heading"><UserRound size={19} /><div><h2 id="profile-identity-title">{t("profile.profile")}</h2><p>{t("profile.profileDescription")}</p></div></div>
          <form onSubmit={(event) => { event.preventDefault(); void saveProfile(); }}>
            <label>{t("auth.email")}<input value={user.email} readOnly aria-readonly="true" /></label>
            <label>{t("profile.displayName")}<input value={displayName} maxLength={80} autoComplete="name" onChange={(event) => setDisplayName(event.target.value)} required /></label>
            <button className="primary-action" disabled={pending === "profile"} type="submit">{pending === "profile" ? t("profile.saving") : t("profile.saveProfile")}</button>
          </form>
        </section>
        <section className="profile-card" aria-labelledby="profile-password-title">
          <div className="profile-card-heading"><ShieldCheck size={19} /><div><h2 id="profile-password-title">{t("profile.passwordTitle")}</h2><p>{t("profile.passwordDescription")}</p></div></div>
          <form onSubmit={(event) => { event.preventDefault(); void savePassword(); }}>
            <input type="hidden" autoComplete="username" value={user.email} readOnly />
            <label>{t("profile.currentPassword")}<input type="password" autoComplete="current-password" value={password.current} onChange={(event) => setPassword({ ...password, current: event.target.value })} required /></label>
            <label>{t("profile.newPassword")}<input type="password" minLength={10} autoComplete="new-password" value={password.next} onChange={(event) => setPassword({ ...password, next: event.target.value })} required /></label>
            <label>{t("profile.confirmPassword")}<input type="password" minLength={10} autoComplete="new-password" value={password.confirmation} onChange={(event) => setPassword({ ...password, confirmation: event.target.value })} required /></label>
            <button className="outline-action" disabled={pending === "password"} type="submit">{pending === "password" ? t("profile.updating") : t("profile.changePassword")}</button>
          </form>
        </section>
        <section className="profile-card profile-card-wide" aria-labelledby="profile-passkeys-title">
          <div className="profile-card-heading"><KeyRound size={19} /><div><h2 id="profile-passkeys-title">{t("profile.passkeys")}</h2><p>{t("profile.passkeysDescription")}</p></div></div>
          {(isTauri || window.PublicKeyCredential) ? (
            <form className="passkey-add" onSubmit={(event) => { event.preventDefault(); void addPasskey(); }}>
              <label>{t("profile.newPasskeyName")}<input value={passkeyName} maxLength={80} placeholder={t("profile.passkeyPlaceholder")} onChange={(event) => setPasskeyName(event.target.value)} /></label>
              <button className="primary-action" disabled={pending === "passkey"} type="submit"><Plus size={16} /> {pending === "passkey" ? t("profile.adding") : t("profile.addPasskey")}</button>
            </form>
          ) : <p className="profile-muted">{t("profile.passkeysUnsupportedShort")}</p>}
          <div className="passkey-list" aria-live="polite">
            {passkeys.length ? passkeys.map((passkey) => (
              <article key={passkey.id} className="passkey-item">
                <KeyRound size={18} />
                <div><strong>{passkey.label}</strong><span>{passkey.backedUp ? t("profile.synced") : t("profile.singleDevice")} · {t("profile.addedOn", { date: formatDate(passkey.createdAt) })}{passkey.lastUsedAt ? ` · ${t("profile.usedOn", { date: formatDate(passkey.lastUsedAt) })}` : ""}</span></div>
                <button className="icon-button" type="button" aria-label={t("profile.renamePasskey", { label: passkey.label })} disabled={Boolean(pending)} onClick={() => renamePasskey(passkey)}><Pencil size={15} /></button>
                <button className="icon-button danger-icon" type="button" aria-label={t("profile.deletePasskey", { label: passkey.label })} disabled={Boolean(pending)} onClick={() => removePasskey(passkey)}><Trash2 size={15} /></button>
              </article>
            )) : <p className="profile-muted">{t("profile.noPasskey")}</p>}
          </div>
        </section>
        <section className="profile-card profile-danger" aria-labelledby="profile-delete-title">
          <div className="profile-card-heading"><Trash2 size={19} /><div><h2 id="profile-delete-title">{t("profile.deleteAccount")}</h2><p>{t("profile.deleteAccountDescription")}</p></div></div>
          <form onSubmit={(event) => { event.preventDefault(); void deleteAccount(); }}>
            <input type="hidden" autoComplete="username" value={user.email} readOnly />
            <label>{t("profile.currentPassword")}<input type="password" autoComplete="current-password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} required /></label>
            <label>{t("profile.typeDelete")} <strong>{deleteKeyword}</strong><input value={deleteConfirmation} autoComplete="off" onChange={(event) => setDeleteConfirmation(event.target.value)} required /></label>
            <button className="danger-action" disabled={pending === "account" || deleteConfirmation !== deleteKeyword} type="submit">{pending === "account" ? t("profile.deleting") : t("profile.deleteForever")}</button>
          </form>
        </section>
      </div>
    </main>
  );
}
