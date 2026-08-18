import { useEffect, useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ChevronRight,
  FileText,
  Gauge,
  Grid2X2,
  MoreHorizontal,
  PenLine,
  Plus,
  Search,
  Upload
} from "lucide-react";
import {
  createId,
  createNotebook,
  type NotebookSummary,
  type NotebookDocument,
  type NotebookMode
} from "@notylo/document-model";
import { getDatabase, NotebookRepository } from "@notylo/persistence";
import { readNotezip } from "@notylo/import-export";
import { webPlatform } from "../lib/platform";
import { ExportDialog } from "../components/ExportDialog";
import { AuthDialog } from "../components/AuthDialog";
import { useAuth } from "../lib/auth";
import { reconcileCloud, resolveConflict, type SyncConflict } from "../lib/cloud";

const repository = new NotebookRepository();

export function HomePage() {
  const navigate = useNavigate();
  const { user, accessToken, ready, logout } = useAuth();
  const [notebooks, setNotebooks] = useState<readonly NotebookSummary[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<NotebookMode>("book");
  const [background, setBackground] = useState<"blank" | "ruled" | "grid-5" | "dots" | "seyes">(
    "grid-5"
  );
  const [notebookMenu, setNotebookMenu] = useState<NotebookSummary>();
  const [rename, setRename] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exportDocument, setExportDocument] = useState<NotebookDocument>();
  const [authOpen, setAuthOpen] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<"idle" | "syncing" | "conflict" | "error">("idle");
  const [conflicts, setConflicts] = useState<readonly SyncConflict[]>([]);
  const [resolvingConflict, setResolvingConflict] = useState(false);

  const refresh = async () => setNotebooks(await repository.list());
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    setCloudStatus("syncing");
    void reconcileCloud(accessToken)
      .then(async (detectedConflicts) => {
        if (!active) return;
        await refresh();
        if (active) {
          setConflicts(detectedConflicts);
          setCloudStatus(detectedConflicts.length ? "conflict" : "idle");
        }
      })
      .catch(() => active && setCloudStatus("error"));
    return () => {
      active = false;
    };
  }, [accessToken]);
  const resolveCurrentConflict = async (keep: "local" | "cloud") => {
    const conflict = conflicts[0];
    if (!accessToken || !conflict) return;
    setResolvingConflict(true);
    try {
      await resolveConflict(accessToken, conflict, keep);
      const remaining = conflicts.slice(1);
      setConflicts(remaining);
      await refresh();
      setCloudStatus(remaining.length ? "conflict" : "idle");
    } catch {
      setCloudStatus("error");
    } finally {
      setResolvingConflict(false);
    }
  };
  const create = async () => {
    const document = createNotebook({
      title: title || "Nouveau cahier",
      mode,
      background: { kind: background, color: "#ffffff", lineColor: "#dedede" }
    });
    await repository.save(document);
    navigate(`/notebook/${document.notebook.id}`);
  };
  const importNotezip = async () => {
    try {
      const [file] = await webPlatform.openFiles(".notezip", false);
      if (!file) return;
      const imported = await readNotezip(file);
      const newNotebookId = createId("nb");
      const remap = new Map<string, string>();
      remap.set(imported.document.notebook.id, newNotebookId);
      const assets = imported.assets.map(({ metadata, blob }) => ({
        metadata: { ...metadata, id: createId("asset"), localBlobId: createId("blob") },
        blob
      }));
      imported.assets.forEach((source, index) => {
        const target = assets[index];
        if (target) remap.set(source.metadata.id, target.metadata.id);
      });
      const pageIds = new Map(imported.document.pages.map((page) => [page.id, createId("page")]));
      const objectIds = new Map(imported.document.objects.map((object) => [object.id, createId()]));
      const document = {
        ...imported.document,
        notebook: {
          ...imported.document.notebook,
          id: newNotebookId,
          title: `${imported.document.notebook.title} (importé)`,
          createdAt: Date.now(),
          updatedAt: Date.now()
        },
        pages: imported.document.pages.map((page) => ({
          ...page,
          id: pageIds.get(page.id)!,
          notebookId: newNotebookId,
          objectIds: page.objectIds.map((id) => objectIds.get(id) ?? id)
        })),
        objects: imported.document.objects.map((object) => ({
          ...object,
          id: objectIds.get(object.id)!,
          notebookId: newNotebookId,
          ...(object.pageId ? { pageId: pageIds.get(object.pageId)! } : {}),
          ...("assetId" in object ? { assetId: remap.get(object.assetId) ?? object.assetId } : {}),
          ...(object.type === "group"
            ? { childIds: object.childIds.map((id) => objectIds.get(id) ?? id) }
            : {})
        })),
        assets: assets.map((asset) => asset.metadata)
      } as NotebookDocument;
      await getDatabase().transaction("rw", getDatabase().assets, async () => {
        await getDatabase().assets.bulkPut(
          assets.map((asset) => ({ ...asset.metadata, blob: asset.blob }))
        );
      });
      await repository.save(document);
      await refresh();
      navigate(`/notebook/${document.notebook.id}`);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Cette sauvegarde n’a pas pu être importée.");
    }
  };
  const openNotebookMenu = (notebook: NotebookSummary) => {
    setNotebookMenu(notebook);
    setRename(notebook.title);
    setConfirmDelete(false);
  };
  const renameNotebook = async () => {
    if (!notebookMenu || !rename.trim()) return;
    const document = await repository.load(notebookMenu.id);
    if (!document) return;
    await repository.save({
      ...document,
      notebook: { ...document.notebook, title: rename.trim(), updatedAt: Date.now() }
    });
    await refresh();
    setNotebookMenu(undefined);
  };
  const exportNotebook = async () => {
    if (!notebookMenu) return;
    const document = await repository.load(notebookMenu.id);
    if (document) setExportDocument(document);
  };
  const deleteNotebook = async () => {
    if (!notebookMenu) return;
    await repository.remove(notebookMenu.id);
    await refresh();
    setConfirmDelete(false);
    setNotebookMenu(undefined);

    if (accessToken && navigator.onLine) {
      setCloudStatus("syncing");
      void reconcileCloud(accessToken)
        .then(async (detectedConflicts) => {
          await refresh();
          setConflicts(detectedConflicts);
          setCloudStatus(detectedConflicts.length ? "conflict" : "idle");
        })
        .catch(() => setCloudStatus("error"));
    }
  };
  const today = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(new Date());
  return (
    <main className="home-shell">
      <aside className="home-sidebar">
        <div className="home-brand">
          <span className="brand-mark">
            <PenLine size={17} strokeWidth={2.2} />
          </span>
          <span>Notylo</span>
        </div>
        <button
          className="workspace-switcher"
          type="button"
          onClick={() => (user ? navigate("/profile") : setAuthOpen(true))}
        >
          <span className="workspace-avatar">{user?.email.slice(0, 1).toUpperCase() ?? "P"}</span>
          <span>{user ? user.displayName : ready ? "Se connecter" : "Compte…"}</span>
          <ChevronRight size={15} />
        </button>
        <nav className="home-navigation" aria-label="Navigation principale">
          <a className="active" href="#mes-cahiers">
            <Grid2X2 size={17} /> Mes cahiers
          </a>
          <button type="button" onClick={() => setDialogOpen(true)}>
            <Plus size={17} /> Nouveau cahier
          </button>
          <button type="button" onClick={() => void importNotezip()}>
            <Upload size={16} /> Importer
          </button>
        </nav>
        <div className="sidebar-footer">
          <p>{user ? "Compte connecté" : ""}</p>
          <span>
            {user
              ? cloudStatus === "syncing"
                ? "Synchronisation cloud…"
                : cloudStatus === "conflict"
                  ? "Un choix de synchronisation est requis."
                  : cloudStatus === "error"
                    ? "Cloud indisponible : copie locale conservée."
                    : "Synchronisé avec votre cloud."
              : ""}
          </span>
          {user && (
            <button className="sidebar-signout" type="button" onClick={logout}>
              Se déconnecter
            </button>
          )}
          <div className="utility-links">
            <Link to="/debug/pen">
              <PenLine size={14} /> Stylet
            </Link>
            <Link to="/debug/benchmark">
              <Gauge size={14} /> Diagnostic
            </Link>
          </div>
        </div>
      </aside>
      <section className="home-content" aria-label="Mes cahiers">
        <header className="home-topbar">
          <div className="home-search">
            <Search size={17} />
            <span>Rechercher dans vos cahiers</span>
          </div>
          <div className="home-account-actions">
            {user ? (
              <button className="account-button" type="button" onClick={() => navigate("/profile")}>
                Mon profil
              </button>
            ) : (
              <button className="account-button" type="button" onClick={() => setAuthOpen(true)}>
                Se connecter
              </button>
            )}
            <button className="new-page-button" onClick={() => setDialogOpen(true)}>
              <Plus size={16} /> Nouveau
            </button>
          </div>
        </header>
        <div className="home-page-heading">
          <p className="home-date">{today}</p>
          <h1>Bonjour.</h1>
          <p>Un espace calme pour écrire, dessiner et organiser vos idées.</p>
        </div>
        <section className="notebook-section" id="mes-cahiers">
          <div className="section-heading">
            <div>
              <h2>Mes cahiers</h2>
              <p>Votre bibliothèque personnelle, disponible hors ligne.</p>
            </div>
            <span>
              {notebooks.length} {notebooks.length > 1 ? "cahiers" : "cahier"}
            </span>
          </div>
          {notebooks.length === 0 ? (
            <button
              className="empty-shelf"
              type="button"
              aria-label="Créer votre premier cahier"
              onClick={() => setDialogOpen(true)}
            >
              <span className="empty-icon">
                <FileText size={22} />
              </span>
              <span className="empty-shelf-copy">
                <span className="empty-shelf-kicker">Votre espace est prêt</span>
                <strong>Créez votre premier cahier</strong>
                <small>
                  Une page vierge pour commencer, enregistrée uniquement sur cet appareil.
                </small>
              </span>
              <span className="empty-action">
                Commencer <ChevronRight size={16} />
              </span>
            </button>
          ) : (
            <div className="notebook-grid">
              {notebooks.map((notebook) => (
                <button
                  key={notebook.id}
                  className="notebook-card"
                  style={{ "--cover": "#ddddd8" } as CSSProperties}
                  onClick={() => openNotebookMenu(notebook)}
                >
                  <span className="card-icon">
                    <FileText size={20} />
                  </span>
                  <span className="card-menu" aria-hidden>
                    <MoreHorizontal size={18} />
                  </span>
                  <div className="card-copy">
                    <p>{notebook.mode === "book" ? "Cahier" : "Whiteboard"}</p>
                    <h3>{notebook.title}</h3>
                  </div>
                  <div className="card-footer">
                    <small>
                      Modifié{" "}
                      {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(
                        notebook.updatedAt
                      )}
                    </small>
                    <span className="card-open">
                      Ouvrir <ChevronRight size={14} />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </section>
      {dialogOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setDialogOpen(false)}
        >
          <form
            className="new-notebook-dialog"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <div className="dialog-title">
              <p className="eyebrow">Nouveau départ</p>
              <h2>Créer un espace</h2>
            </div>
            <label>
              Nom
              <input
                autoFocus
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="ex. Analyse — Chapitre 1"
              />
            </label>
            <fieldset>
              <legend>Format</legend>
              <div className="segmented">
                <button
                  type="button"
                  aria-pressed={mode === "book"}
                  onClick={() => setMode("book")}
                >
                  ▤ Cahier
                </button>
                <button
                  type="button"
                  aria-pressed={mode === "whiteboard"}
                  onClick={() => setMode("whiteboard")}
                >
                  ⌁ Whiteboard
                </button>
              </div>
            </fieldset>
            {mode === "book" && (
              <fieldset>
                <legend>Fond de page</legend>
                <div className="background-picks">
                  {(["blank", "ruled", "grid-5", "dots", "seyes"] as const).map((value) => (
                    <button
                      className={`paper-pick ${value}`}
                      type="button"
                      aria-pressed={background === value}
                      onClick={() => setBackground(value)}
                      key={value}
                    >
                      {value === "blank"
                        ? "Vierge"
                        : value === "ruled"
                          ? "Lignes"
                          : value === "grid-5"
                            ? "Quadrillé"
                            : value === "dots"
                              ? "Points"
                              : "Seyès"}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
            <div className="dialog-actions">
              <button type="button" className="text-button" onClick={() => setDialogOpen(false)}>
                Annuler
              </button>
              <button type="submit" className="primary-action">
                Créer le cahier
              </button>
            </div>
          </form>
        </div>
      )}
      {notebookMenu && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setNotebookMenu(undefined)}
        >
          <section
            className="new-notebook-dialog notebook-menu-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="notebook-menu-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="dialog-title">
              <p className="eyebrow">{notebookMenu.mode === "book" ? "Cahier" : "Whiteboard"}</p>
              <h2 id="notebook-menu-title">{notebookMenu.title}</h2>
            </div>
            <label>
              Renommer
              <input value={rename} onChange={(event) => setRename(event.target.value)} />
            </label>
            <div className="notebook-menu-actions">
              <div className="notebook-menu-primary">
                <button
                  className="primary-action"
                  onClick={() => navigate(`/notebook/${notebookMenu.id}`)}
                >
                  Ouvrir le cahier
                </button>
              </div>
              <div
                className="notebook-menu-secondary"
                role="group"
                aria-label="Actions secondaires"
              >
                <button className="outline-action" onClick={() => void renameNotebook()}>
                  Enregistrer le nom
                </button>
                <button className="outline-action" onClick={() => void exportNotebook()}>
                  Exporter une copie
                </button>
              </div>
              <div className="notebook-menu-danger">
                <button className="danger-action" onClick={() => setConfirmDelete(true)}>
                  Supprimer…
                </button>
              </div>
            </div>
            <button className="text-button menu-close" onClick={() => setNotebookMenu(undefined)}>
              Fermer
            </button>
          </section>
        </div>
      )}
      {confirmDelete && notebookMenu && (
        <div
          className="modal-backdrop confirmation-backdrop"
          role="presentation"
          onMouseDown={() => setConfirmDelete(false)}
        >
          <section
            className="new-notebook-dialog confirm-dialog"
            role="dialog"
            aria-modal="true"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className="eyebrow">Action irréversible</p>
            <h2>Supprimer « {notebookMenu.title} » ?</h2>
            <p>
              Le cahier sera retiré immédiatement de cet appareil. La suppression cloud sera
              synchronisée dès qu’une connexion et un compte seront disponibles.
            </p>
            <div className="dialog-actions">
              <button className="text-button" onClick={() => setConfirmDelete(false)}>
                Annuler
              </button>
              <button className="danger-action" onClick={() => void deleteNotebook()}>
                Oui, supprimer
              </button>
            </div>
          </section>
        </div>
      )}
      {exportDocument && (
        <ExportDialog document={exportDocument} onClose={() => setExportDocument(undefined)} />
      )}
      {authOpen && <AuthDialog onClose={() => setAuthOpen(false)} />}
      {conflicts[0] && (
        <div className="modal-backdrop sync-conflict-backdrop" role="presentation">
          <section
            className="new-notebook-dialog sync-conflict-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sync-conflict-title"
          >
            <p className="eyebrow">
              {conflicts[0].kind === "deleted"
                ? "Conflit de suppression"
                : "Conflit de synchronisation"}
            </p>
            <h2 id="sync-conflict-title">
              {conflicts[0].kind === "deleted"
                ? `« ${conflicts[0].title} » a été supprimé dans le cloud`
                : `Choisir la copie de « ${conflicts[0].title} »`}
            </h2>
            <p className="sync-conflict-intro">
              {conflicts[0].kind === "deleted"
                ? "Cet appareil contient une copie modifiée depuis la dernière synchronisation. Choisissez si vous souhaitez la restaurer ou accepter la suppression cloud."
                : "Les deux copies ont été modifiées. La version choisie deviendra immédiatement la nouvelle copie cloud."}
            </p>
            <div className="sync-conflict-options">
              <article>
                <p>Cet appareil</p>
                <strong>{formatSyncDate(conflicts[0].local.notebook.updatedAt)}</strong>
                <small>
                  {conflicts[0].kind === "deleted"
                    ? "Restaurer cette copie dans le cloud."
                    : "Conserver cette copie puis remplacer le cloud."}
                </small>
                <button
                  className="primary-action"
                  disabled={resolvingConflict}
                  onClick={() => void resolveCurrentConflict("local")}
                >
                  {conflicts[0].kind === "deleted" ? "Restaurer le cahier" : "Garder cette copie"}
                </button>
              </article>
              <article>
                <p>Cloud</p>
                {conflicts[0].kind === "deleted" ? (
                  <>
                    <strong>Supprimé {formatSyncDate(conflicts[0].deletedAt)}</strong>
                    <small>Supprimer aussi la copie modifiée de cet appareil.</small>
                  </>
                ) : (
                  <>
                    <strong>{formatSyncDate(conflicts[0].cloud.notebook.updatedAt)}</strong>
                    <small>Remplacer la copie de cet appareil par le cloud.</small>
                  </>
                )}
                <button
                  className="outline-action"
                  disabled={resolvingConflict}
                  onClick={() => void resolveCurrentConflict("cloud")}
                >
                  {conflicts[0].kind === "deleted" ? "Accepter la suppression" : "Garder le cloud"}
                </button>
              </article>
            </div>
            {resolvingConflict && (
              <p className="sync-conflict-progress" role="status">
                Application de votre choix…
              </p>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

function formatSyncDate(value: number): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short" }).format(value);
}
