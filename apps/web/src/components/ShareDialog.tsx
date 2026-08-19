import { Link2, X } from "lucide-react";
import { ApiError, sharingApi, type ShareMode } from "../lib/api";
import { authErrorMessage } from "../lib/auth";
import { useEffect, useMemo, useState } from "react";

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
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    void sharingApi
      .status(accessToken, notebookId)
      .then((result) => {
        setEnabled(result.enabled);
        if (result.mode) setMode(result.mode);
      })
      .catch((error) => setMessage(authErrorMessage(error)));
  }, [accessToken, notebookId]);

  const fullLink = useMemo(
    () => (link ? new URL(link, window.location.origin).toString() : undefined),
    [link]
  );

  const enable = async () => {
    setPending(true);
    setMessage(undefined);
    try {
      const result = await sharingApi.enable(accessToken, notebookId, mode);
      const nextLink = new URL(result.path, window.location.origin).toString();
      setEnabled(true);
      setLink(nextLink);
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(nextLink).catch(() => undefined);
      }
      setMessage("Lien généré et copié dans le presse-papiers.");
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Le lien n’a pas pu être généré.");
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
      setMessage("Le partage public est désactivé.");
    } catch (error) {
      setMessage(
        error instanceof ApiError ? error.message : "Le partage n’a pas pu être désactivé."
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="new-notebook-dialog share-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="dialog-close" type="button" aria-label="Fermer" onClick={onClose}>
          <X size={18} />
        </button>
        <p className="eyebrow">Accès public</p>
        <h2 id="share-dialog-title">Partager ce notebook</h2>
        <p>
          Toute personne possédant le lien pourra ouvrir ce notebook sans compte. Un nouveau lien
          invalide immédiatement l’ancien.
        </p>
        <fieldset className="share-modes">
          <legend>Autorisation du lien</legend>
          <label>
            <input
              type="radio"
              name="share-mode"
              value="read"
              checked={mode === "read"}
              onChange={() => setMode("read")}
            />
            <span>
              <strong>Lecture seule</strong>
              <small>Le notebook peut être consulté et ses assets téléchargés.</small>
            </span>
          </label>
          <label>
            <input
              type="radio"
              name="share-mode"
              value="write"
              checked={mode === "write"}
              onChange={() => setMode("write")}
            />
            <span>
              <strong>Lecture et écriture</strong>
              <small>Toute personne avec le lien peut modifier et sauvegarder le notebook.</small>
            </span>
          </label>
        </fieldset>
        {fullLink && (
          <div className="share-link-box">
            <Link2 size={16} />
            <input value={fullLink} readOnly aria-label="Lien public" />
            <button
              type="button"
              className="outline-action"
              onClick={() => void navigator.clipboard?.writeText(fullLink)}
            >
              Copier
            </button>
          </div>
        )}
        {message && (
          <p className="profile-notice success" role="status">
            {message}
          </p>
        )}
        <div className="dialog-actions">
          <button className="text-button" type="button" onClick={onClose}>
            Fermer
          </button>
          {enabled && (
            <button
              className="danger-action"
              type="button"
              disabled={pending}
              onClick={() => void disable()}
            >
              Désactiver
            </button>
          )}
          <button
            className="primary-action"
            type="button"
            disabled={pending}
            onClick={() => void enable()}
          >
            {pending ? "Enregistrement…" : enabled ? "Régénérer le lien" : "Générer le lien"}
          </button>
        </div>
      </section>
    </div>
  );
}
