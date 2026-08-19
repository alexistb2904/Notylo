import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  createId,
  createPage,
  type DocumentObject,
  type NotebookDocument
} from "@notylo/document-model";
import { NotebookRepository } from "@notylo/persistence";
import { evaluateMath } from "@notylo/math-engine";
import { EditorWorkspace } from "../components/EditorWorkspace";
import { ShareDialog } from "../components/ShareDialog";
import { useDocumentSession } from "../lib/session";
import { useAuth } from "../lib/auth";
import { ApiError } from "../lib/api";
import {
  pullCloudDocument,
  resolveConflict,
  syncConflictFromError,
  uploadDocument,
  type SyncConflict
} from "../lib/cloud";

export function EditorPage() {
  const { id } = useParams();
  const { ready, user } = useAuth();
  const repository = useMemo(() => new NotebookRepository(user?.id), [user?.id]);
  const [loaded, setLoaded] = useState<NotebookDocument>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!id || !ready) return;
    let active = true;
    setLoaded(undefined);
    setError(undefined);
    void (async () => {
      try {
        if (user) await repository.claimAnonymous(user.id);
        const document = await repository.load(id);
        if (!active) return;
        if (document) setLoaded(document);
        else setError("Ce cahier n’existe plus ou n’a pas été trouvé dans cet espace.");
      } catch {
        if (active) setError("Impossible d’ouvrir ce cahier. Vos autres cahiers restent intacts.");
      }
    })();
    return () => {
      active = false;
    };
  }, [id, ready, repository, user]);

  if (error)
    return (
      <main className="fatal-state">
        <Link to="/">← Revenir à mes cahiers</Link>
        <h1>Ouverture impossible</h1>
        <p>{error}</p>
      </main>
    );

  if (!loaded)
    return (
      <main className="loading-state">
        <span className="brand-mark">P</span>
        <p>Ouverture du cahier…</p>
      </main>
    );

  return <LoadedEditor key={loaded.notebook.id} initial={loaded} repository={repository} />;
}

function LoadedEditor({
  initial,
  repository
}: {
  readonly initial: NotebookDocument;
  readonly repository: NotebookRepository;
}) {
  const navigate = useNavigate();
  const session = useDocumentSession(initial, repository);
  const { accessToken, user, refreshSession } = useAuth();
  const accountAtOpen = useRef(user?.id);
  const latestDocument = useRef(session.document);
  const debounceTimer = useRef<number | undefined>(undefined);
  const retryTimer = useRef<number | undefined>(undefined);
  const syncing = useRef(false);
  const syncAgain = useRef(false);
  const conflictBlocked = useRef(false);
  const suppressNextUpload = useRef(false);
  const syncNowRef = useRef<() => Promise<void>>(async () => undefined);
  const [cloudSaveState, setCloudSaveState] = useState<
    "saved" | "saving" | "error" | "offline" | "cloud-synced" | "conflict"
  >(navigator.onLine ? "saved" : "offline");
  const [conflict, setConflict] = useState<SyncConflict>();
  const [resolvingConflict, setResolvingConflict] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharePreparing, setSharePreparing] = useState(false);
  const [shareError, setShareError] = useState<string>();

  latestDocument.current = session.document;

  useEffect(() => {
    if (accountAtOpen.current !== user?.id) navigate("/", { replace: true });
  }, [navigate, user?.id]);

  const syncNow = useCallback(async () => {
    if (!accessToken || !user || !navigator.onLine || conflictBlocked.current) return;
    if (syncing.current) {
      syncAgain.current = true;
      return;
    }

    syncing.current = true;
    window.clearTimeout(retryTimer.current);
    setCloudSaveState("saving");

    try {
      await uploadDocument(accessToken, latestDocument.current, user.id);
      setCloudSaveState("cloud-synced");
    } catch (error) {
      const detectedConflict = syncConflictFromError(error, latestDocument.current);
      if (detectedConflict) {
        conflictBlocked.current = true;
        setConflict(detectedConflict);
        setCloudSaveState("conflict");
      } else if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        const refreshed = await refreshSession();
        if (refreshed)
          retryTimer.current = window.setTimeout(() => {
            void syncNowRef.current();
          }, 500);
        else setCloudSaveState("error");
      } else {
        setCloudSaveState(navigator.onLine ? "error" : "offline");
        retryTimer.current = window.setTimeout(() => {
          void syncNowRef.current();
        }, 15_000);
      }
    } finally {
      syncing.current = false;
      if (syncAgain.current && !conflictBlocked.current) {
        syncAgain.current = false;
        debounceTimer.current = window.setTimeout(() => {
          void syncNowRef.current();
        }, 250);
      }
    }
  }, [accessToken, refreshSession, user]);

  syncNowRef.current = syncNow;

  useEffect(() => {
    conflictBlocked.current = false;
    setConflict(undefined);
  }, [accessToken, user?.id]);

  useEffect(() => {
    if (!accessToken || !user) return;
    if (suppressNextUpload.current) {
      suppressNextUpload.current = false;
      return;
    }

    window.clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(() => {
      void syncNowRef.current();
    }, 1_800);

    return () => window.clearTimeout(debounceTimer.current);
  }, [accessToken, user, session.document]);

  useEffect(() => {
    if (!accessToken || !user) return;
    let active = true;
    const pull = async () => {
      if (
        !active ||
        syncing.current ||
        conflictBlocked.current ||
        document.visibilityState !== "visible"
      )
        return;
      try {
        const result = await pullCloudDocument(accessToken, user.id, latestDocument.current);
        if (!active) return;
        if (result.kind === "updated") {
          suppressNextUpload.current = true;
          session.adopt(result.document);
          setCloudSaveState("cloud-synced");
        } else if (result.kind === "deleted") {
          navigate("/", { replace: true });
        } else if (result.kind === "conflict") {
          conflictBlocked.current = true;
          setConflict(result.conflict);
          setCloudSaveState("conflict");
        }
      } catch {
        if (active) setCloudSaveState(navigator.onLine ? "error" : "offline");
      }
    };
    const interval = window.setInterval(() => void pull(), 2_500);
    const onVisible = () => {
      if (document.visibilityState === "visible") void pull();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    void pull();
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [accessToken, navigate, session.adopt, user]);

  useEffect(() => {
    const handleOnline = () => {
      window.clearTimeout(retryTimer.current);
      void syncNowRef.current();
    };
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.clearTimeout(retryTimer.current);
      window.clearTimeout(debounceTimer.current);
    };
  }, []);

  const resolveEditorConflict = async (keep: "local" | "cloud") => {
    if (!accessToken || !user || !conflict) return;
    setResolvingConflict(true);
    try {
      await resolveConflict(accessToken, conflict, keep, user.id);
      if (keep === "cloud") {
        if (conflict.kind === "deleted") {
          navigate("/", { replace: true });
          return;
        }
        suppressNextUpload.current = true;
        session.adopt(conflict.cloud);
      }
      conflictBlocked.current = false;
      setConflict(undefined);
      setCloudSaveState("cloud-synced");
    } catch {
      setCloudSaveState("error");
    } finally {
      setResolvingConflict(false);
    }
  };

  const openShare = async () => {
    if (!accessToken || !user || sharePreparing) return;
    setSharePreparing(true);
    setShareError(undefined);
    try {
      await uploadDocument(accessToken, session.document, user.id);
      setShareOpen(true);
    } catch (error) {
      setShareError(
        error instanceof Error ? error.message : "Le notebook doit d’abord être synchronisé."
      );
    } finally {
      setSharePreparing(false);
    }
  };

  const add = (object: DocumentObject) =>
    session.commit({ kind: "add-object", object, label: "Ajouter un objet" });

  const update = (
    before: readonly DocumentObject[],
    after: readonly DocumentObject[],
    label = "Modifier la sélection"
  ) => {
    session.commit({ kind: "update-objects", before, after, label });
    if (!session.document.notebook.settings.autoCalculate) return;

    const source = after.find((object) => object.type === "text" || object.type === "math");
    const expression =
      source?.type === "text"
        ? source.plainText
        : source?.type === "math"
          ? source.latex
          : undefined;
    if (!source || !expression?.trim().endsWith("=")) return;

    const result = evaluateMath(expression);
    if (!result?.canSuggest) return;

    const now = Date.now();
    add({
      id: createId("calc"),
      notebookId: session.document.notebook.id,
      ...(source.pageId ? { pageId: source.pageId } : {}),
      type: "calculation",
      x: source.x + source.width + 18,
      y: source.y + source.height / 2 - 20,
      width: 150,
      height: 40,
      rotation: 0,
      zIndex: session.document.objects.length + 1,
      opacity: 1,
      locked: false,
      hidden: false,
      createdAt: now,
      updatedAt: now,
      sourceLatex: result.latex,
      resultLatex: result.resultLatex,
      exact: result.exact,
      accepted: false
    });
  };

  const remove = (objects: readonly DocumentObject[]) =>
    session.commit({ kind: "delete-objects", objects, label: "Supprimer" });

  const addPage = () => {
    if (session.document.notebook.mode !== "book") return;
    const prior = session.document.pages.at(-1);
    if (!prior) return;
    const page = createPage(
      session.document.notebook.id,
      session.document.pages.length,
      prior.format === "custom" ? "a4" : prior.format,
      prior.background
    );
    session.commit({ kind: "add-page", page, label: "Ajouter une page" });
  };

  return (
    <>
      <EditorWorkspace
        document={session.document}
        documentRef={session.documentRef}
        saveState={accessToken && user ? cloudSaveState : session.saveState}
        onAdd={add}
        onUpdate={update}
        onDelete={remove}
        onAddPage={addPage}
        onUndo={session.undo}
        onRedo={session.redo}
        onReplace={session.replace}
        onShare={() => void openShare()}
      />
      {sharePreparing && (
        <p className="public-share-progress" role="status">
          Préparation du lien public…
        </p>
      )}
      {shareError && (
        <p className="profile-notice error" role="alert">
          {shareError}
        </p>
      )}
      {shareOpen && accessToken && (
        <ShareDialog
          accessToken={accessToken}
          notebookId={session.document.notebook.id}
          onClose={() => setShareOpen(false)}
        />
      )}
      {conflict && (
        <div className="modal-backdrop sync-conflict-backdrop" role="presentation">
          <section
            className="new-notebook-dialog sync-conflict-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="editor-sync-conflict-title"
          >
            <p className="eyebrow">
              {conflict.kind === "deleted"
                ? "Conflit de suppression"
                : "Conflit de synchronisation"}
            </p>
            <h2 id="editor-sync-conflict-title">
              {conflict.kind === "deleted"
                ? `« ${conflict.title} » a été supprimé dans le cloud`
                : `Une autre copie a modifié « ${conflict.title} »`}
            </h2>
            <p className="sync-conflict-intro">
              Aucune copie n’est écrasée automatiquement. Choisissez la version qui doit devenir la
              nouvelle version cloud.
            </p>
            <div className="sync-conflict-options">
              <article>
                <p>Cet appareil</p>
                <strong>
                  {conflict.kind === "local-delete"
                    ? "Suppression demandée"
                    : new Intl.DateTimeFormat("fr-FR", {
                        dateStyle: "medium",
                        timeStyle: "short"
                      }).format(conflict.local.notebook.updatedAt)}
                </strong>
                <button
                  className="primary-action"
                  disabled={resolvingConflict}
                  onClick={() => void resolveEditorConflict("local")}
                >
                  {conflict.kind === "deleted" ? "Restaurer cette copie" : "Garder cette copie"}
                </button>
              </article>
              <article>
                <p>Cloud</p>
                <strong>
                  {conflict.kind === "deleted"
                    ? "Cahier supprimé"
                    : new Intl.DateTimeFormat("fr-FR", {
                        dateStyle: "medium",
                        timeStyle: "short"
                      }).format(conflict.cloud.notebook.updatedAt)}
                </strong>
                <button
                  className="outline-action"
                  disabled={resolvingConflict}
                  onClick={() => void resolveEditorConflict("cloud")}
                >
                  {conflict.kind === "deleted" ? "Accepter la suppression" : "Garder le cloud"}
                </button>
              </article>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
