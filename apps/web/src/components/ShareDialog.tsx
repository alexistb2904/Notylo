import {
  Check,
  Copy,
  Eye,
  Globe2,
  Link2,
  LoaderCircle,
  PenLine,
  RefreshCw,
  Share2,
  ShieldCheck,
  Unplug,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, sharingApi, type ShareMode } from "../lib/api";
import { authErrorMessage } from "../lib/auth";

type DialogMessage = { readonly kind: "success" | "error" | "info"; readonly text: string };

export function ShareDialog({
  accessToken,
  notebookId,
  onClose
}: {
  readonly accessToken: string;
  readonly notebookId: string;
  readonly onClose: () => void;
}) {
  const [mode, setMode] = useState<ShareMode>("read");
  const [enabled, setEnabled] = useState(false);
  const [link, setLink] = useState<string>();
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<DialogMessage>();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef(false);
  pendingRef.current = pending;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pendingRef.current) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void sharingApi
      .status(accessToken, notebookId)
      .then((result) => {
        if (!active) return;
        setEnabled(result.enabled);
        if (result.mode) setMode(result.mode);
      })
      .catch((error) => {
        if (active) setMessage({ kind: "error", text: authErrorMessage(error) });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken, notebookId]);

  const fullLink = useMemo(
    () => (link ? new URL(link, window.location.origin).toString() : undefined),
    [link]
  );

  const copyText = async (value: string) => {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(value);
    } else {
      const input = linkInputRef.current;
      if (!input) throw new Error("Le presse-papiers n’est pas disponible.");
      input.focus();
      input.select();
      if (!document.execCommand("copy")) throw new Error("Copie impossible.");
    }
    setCopied(true);
    setMessage({ kind: "success", text: "Lien copié dans le presse-papiers." });
  };

  const copyLink = async () => {
    if (!fullLink) return;
    try {
      await copyText(fullLink);
    } catch {
      setMessage({ kind: "error", text: "La copie automatique a échoué. Sélectionnez le lien." });
    }
  };

  const enable = async () => {
    setPending(true);
    setCopied(false);
    setMessage(undefined);
    try {
      const result = await sharingApi.enable(accessToken, notebookId, mode);
      const nextLink = new URL(result.path, window.location.origin).toString();
      setEnabled(true);
      setLink(nextLink);
      try {
        await copyText(nextLink);
      } catch {
        setMessage({ kind: "info", text: "Lien généré. Copiez-le depuis le champ ci-dessous." });
      }
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof ApiError ? error.message : "Le lien n’a pas pu être généré."
      });
    } finally {
      setPending(false);
    }
  };

  const disable = async () => {
    setPending(true);
    setMessage(undefined);
    try {
      await sharingApi.disable(accessToken, notebookId);
      setEnabled(false);
      setLink(undefined);
      setCopied(false);
      setMessage({ kind: "success", text: "Le lien public est désactivé." });
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof ApiError ? error.message : "Le partage n’a pas pu être désactivé."
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="modal-backdrop share-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="new-notebook-dialog share-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-dialog-title"
        aria-describedby="share-dialog-description"
        aria-busy={loading || pending}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="share-dialog-header">
          <div className="share-dialog-mark" aria-hidden="true">
            <Share2 size={19} />
          </div>
          <div>
            <p className="eyebrow">Partage public</p>
            <h2 id="share-dialog-title">Partager ce notebook</h2>
          </div>
          <button
            ref={closeButtonRef}
            className="dialog-close"
            type="button"
            aria-label="Fermer la fenêtre de partage"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>

        <p id="share-dialog-description" className="share-dialog-intro">
          Créez un lien qui ouvre ce notebook sans compte. Le lien fonctionne comme une clé :
          partagez-le uniquement avec les personnes de confiance.
        </p>

        <div className={`share-status-card${enabled ? " is-enabled" : ""}`}>
          <span className="share-status-icon" aria-hidden="true">
            {enabled ? <Globe2 size={18} /> : <ShieldCheck size={18} />}
          </span>
          <span className="share-status-copy">
            <strong>{enabled ? "Lien public actif" : "Notebook privé"}</strong>
            <small>
              {enabled
                ? "Les personnes qui possèdent le lien peuvent y accéder."
                : "Rien n’est accessible sans votre autorisation."}
            </small>
          </span>
          <span className="share-status-pill">{enabled ? "ACTIF" : "PRIVÉ"}</span>
        </div>

        <fieldset className="share-modes">
          <legend>
            <span>1</span> Choisissez le niveau d’accès
          </legend>
          <label className={mode === "read" ? "is-selected" : undefined}>
            <input
              type="radio"
              name="share-mode"
              value="read"
              checked={mode === "read"}
              disabled={pending || loading}
              onChange={() => setMode("read")}
            />
            <span className="share-mode-icon" aria-hidden="true">
              <Eye size={17} />
            </span>
            <span className="share-mode-copy">
              <strong>Lecture seule</strong>
              <small>Consulter le notebook et télécharger ses pièces jointes.</small>
            </span>
            <Check className="share-mode-check" size={17} aria-hidden="true" />
          </label>
          <label className={mode === "write" ? "is-selected" : undefined}>
            <input
              type="radio"
              name="share-mode"
              value="write"
              checked={mode === "write"}
              disabled={pending || loading}
              onChange={() => setMode("write")}
            />
            <span className="share-mode-icon" aria-hidden="true">
              <PenLine size={17} />
            </span>
            <span className="share-mode-copy">
              <strong>Lecture et écriture</strong>
              <small>Autoriser les modifications et leur sauvegarde par lien.</small>
            </span>
            <Check className="share-mode-check" size={17} aria-hidden="true" />
          </label>
        </fieldset>

        <div className="share-link-section">
          <div className="share-section-heading">
            <span>
              <span>2</span> Votre lien
            </span>
            {link && <small>À conserver précieusement</small>}
          </div>
          {fullLink ? (
            <div className="share-link-box">
              <Link2 size={16} aria-hidden="true" />
              <input ref={linkInputRef} value={fullLink} readOnly aria-label="Lien public" />
              <button type="button" className="outline-action" onClick={() => void copyLink()}>
                {copied ? <Check size={15} /> : <Copy size={15} />}
                {copied ? "Copié" : "Copier"}
              </button>
            </div>
          ) : (
            <div className="share-link-empty">
              <Link2 size={17} aria-hidden="true" />
              <span>Le lien apparaîtra ici après sa création.</span>
            </div>
          )}
        </div>

        {message && (
          <p
            className={`share-message ${message.kind}`}
            role={message.kind === "error" ? "alert" : "status"}
          >
            {message.kind === "success" ? <Check size={15} /> : <ShieldCheck size={15} />}
            {message.text}
          </p>
        )}

        <footer className="share-dialog-footer">
          <button className="text-button" type="button" onClick={onClose}>
            Fermer
          </button>
          {enabled && (
            <button
              className="share-revoke"
              type="button"
              disabled={pending}
              onClick={() => void disable()}
            >
              <Unplug size={15} /> Désactiver
            </button>
          )}
          <button
            className="primary-action share-submit"
            type="button"
            disabled={pending || loading}
            onClick={() => void enable()}
          >
            {pending ? (
              <LoaderCircle className="spin" size={16} />
            ) : enabled ? (
              <RefreshCw size={16} />
            ) : (
              <Link2 size={16} />
            )}
            {loading
              ? "Vérification…"
              : pending
                ? "Enregistrement…"
                : enabled
                  ? "Régénérer le lien"
                  : "Créer le lien"}
          </button>
        </footer>
      </section>
    </div>
  );
}
