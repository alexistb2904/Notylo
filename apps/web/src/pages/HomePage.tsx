import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ChevronRight,
  FileText,
  Gauge,
  Grid2X2,
  Menu,
  MoreHorizontal,
  PenLine,
  Plus,
  Search,
  Upload,
  X
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
import {
  createCloudDocument,
  reconcileCloud,
  resolveConflict,
  type SyncConflict
} from "../lib/cloud";

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
  const [creating, setCreating] = useState(false);
  const [creationError, setCreationError] = useState<string>();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const refresh = async () => setNotebooks(await repository.list());
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "k") return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }
      event.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);
  const synchronizeCloud = useCallback(
    async (canUpdate: () => boolean = () => true) => {
      if (!accessToken || !user) return false;

      if (canUpdate()) setCloudStatus("syncing");
      try {
        const detectedConflicts = await reconcileCloud(accessToken, user.id);
        await refresh();
        if (!canUpdate()) return false;
        setConflicts(detectedConflicts);
        setCloudStatus(detectedConflicts.length ? "conflict" : "idle");
        return true;
      } catch {
        if (canUpdate()) setCloudStatus("error");
        return false;
      }
    },
    [accessToken, user]
  );

  useEffect(() => {
    if (!accessToken || !user) return;
    let active = true;
    let syncTimer: number | undefined;

    const run = async () => {
      await synchronizeCloud(() => active);
      if (active)
        syncTimer = window.setTimeout(run, document.visibilityState === "visible" ? 5_000 : 20_000);
    };
    const refreshOnReturn = () => {
      if (document.visibilityState !== "visible") return;
      window.clearTimeout(syncTimer);
      void run();
    };

    void run();
    window.addEventListener("online", refreshOnReturn);
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => {
      active = false;
      if (syncTimer) window.clearTimeout(syncTimer);
      window.removeEventListener("online", refreshOnReturn);
      document.removeEventListener("visibilitychange", refreshOnReturn);
    };
  }, [accessToken, user, synchronizeCloud]);
  const resolveCurrentConflict = async (keep: "local" | "cloud") => {
    const conflict = conflicts[0];
    if (!accessToken || !user || !conflict) return;
    setResolvingConflict(true);
    try {
      await resolveConflict(accessToken, conflict, keep, user.id);
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
    if (creating) return;
    const document = createNotebook({
      title: title || "Nouveau cahier",
      mode,
      background: { kind: background, color: "#ffffff", lineColor: "#dedede" }
    });
    setCreating(true);
    setCreationError(undefined);
    try {
      await repository.save(document);
      // Saving locally first means a temporary cloud failure never blocks work.
      // The editor retries this write as soon as it opens or reconnects.
      if (accessToken && user && navigator.onLine) {
        try {
          await createCloudDocument(accessToken, user.id, document);
        } catch {
          setCloudStatus("error");
        }
      }
      navigate(`/notebook/${document.notebook.id}`);
    } catch (error) {
      setCreationError(error instanceof Error ? error.message : "Le cahier n’a pas pu être créé.");
    } finally {
      setCreating(false);
    }
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

    if (accessToken && user && navigator.onLine) {
      setCloudStatus("syncing");
      void reconcileCloud(accessToken, user.id)
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
  const normalizedQuery = searchQuery
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-FR");
  const visibleNotebooks = normalizedQuery
    ? notebooks.filter((notebook) =>
        notebook.title
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLocaleLowerCase("fr-FR")
          .includes(normalizedQuery)
      )
    : notebooks;
  return (
    <main className="home-shell">
      <aside className={`home-sidebar${mobileMenuOpen ? " is-menu-open" : ""}`}>
        <div className="home-mobile-bar">
          <div className="home-brand">
            <span className="brand-mark">
              <PenLine size={17} strokeWidth={2.2} />
            </span>
            <span>Notylo</span>
          </div>
          <button
            className="mobile-menu-toggle"
            type="button"
            aria-label={mobileMenuOpen ? "Fermer le menu" : "Ouvrir le menu"}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-navigation"
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            {mobileMenuOpen ? <X size={19} /> : <Menu size={20} />}
          </button>
        </div>
        <button
          className="workspace-switcher"
          type="button"
          onClick={() => {
            setMobileMenuOpen(false);
            if (user) navigate("/profile");
            else setAuthOpen(true);
          }}
        >
          <span className="workspace-avatar">{user?.email.slice(0, 1).toUpperCase() ?? "P"}</span>
          <span>{user ? user.displayName : ready ? "Se connecter" : "Compte…"}</span>
          <ChevronRight size={15} />
        </button>
        <nav className="home-navigation" id="mobile-navigation" aria-label="Navigation principale">
          <a className="active" href="#mes-cahiers" onClick={() => setMobileMenuOpen(false)}>
            <Grid2X2 size={17} /> Mes cahiers
          </a>
          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen(false);
              setDialogOpen(true);
            }}
          >
            <Plus size={17} /> Nouveau cahier
          </button>
          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen(false);
              void importNotezip();
            }}
          >
            <Upload size={16} /> Importer
          </button>
        </nav>
        <div className="sidebar-footer">
          <p>{user ? "Compte connecté" : ""}</p>
          {user && cloudStatus === "conflict" && (
            <span>Un choix de synchronisation est requis.</span>
          )}
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
          <form className="home-search" role="search" onSubmit={(event) => event.preventDefault()}>
            <Search size={17} />
            <input
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Rechercher dans vos cahiers"
              aria-label="Rechercher dans vos cahiers"
            />
            {searchQuery && (
              <button
                className="search-clear"
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  searchInputRef.current?.focus();
                }}
                aria-label="Effacer la recherche"
              >
                <X size={15} />
              </button>
            )}
          </form>
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
              {visibleNotebooks.length} sur {notebooks.length}{" "}
              {notebooks.length > 1 ? "cahiers" : "cahier"}
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
          ) : visibleNotebooks.length === 0 ? (
            <div className="search-empty" role="status">
              <Search size={20} aria-hidden="true" />
              <div>
                <strong>Aucun cahier trouvé</strong>
                <p>Essayez un autre titre ou effacez votre recherche.</p>
              </div>
              <button type="button" onClick={() => setSearchQuery("")}>
                Effacer
              </button>
            </div>
          ) : (
            <div className="notebook-grid">
              {visibleNotebooks.map((notebook) => (
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
              <button type="submit" className="primary-action" disabled={creating}>
                {creating ? "Création…" : "Créer le cahier"}
              </button>
            </div>
            {creationError && (
              <p className="auth-error" role="alert">
                {creationError}
              </p>
            )}
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
              {conflicts[0].kind === "deleted" || conflicts[0].kind === "local-delete"
                ? "Conflit de suppression"
                : "Conflit de synchronisation"}
            </p>
            <h2 id="sync-conflict-title">
              {conflicts[0].kind === "deleted"
                ? `« ${conflicts[0].title} » a été supprimé dans le cloud`
                : conflicts[0].kind === "local-delete"
                  ? `La suppression de « ${conflicts[0].title} » est en conflit`
                  : `Choisir la copie de « ${conflicts[0].title} »`}
            </h2>
            <p className="sync-conflict-intro">
              {conflicts[0].kind === "deleted"
                ? "Cet appareil contient une copie modifiée depuis la dernière synchronisation. Choisissez si vous souhaitez la restaurer ou accepter la suppression cloud."
                : conflicts[0].kind === "local-delete"
                  ? "Cet appareil a demandé une suppression, mais le cahier a été modifié dans le cloud entre-temps. Aucun changement n’est perdu tant que vous n’avez pas choisi."
                  : "Les deux copies ont été modifiées. La version choisie deviendra immédiatement la nouvelle copie cloud."}
            </p>
            <div className="sync-conflict-options">
              <article>
                <p>Cet appareil</p>
                <strong>
                  {conflicts[0].kind === "local-delete"
                    ? `Suppression demandée ${formatSyncDate(conflicts[0].deletedAt)}`
                    : formatSyncDate(conflicts[0].local.notebook.updatedAt)}
                </strong>
                <small>
                  {conflicts[0].kind === "deleted"
                    ? "Restaurer cette copie dans le cloud."
                    : conflicts[0].kind === "local-delete"
                      ? "Confirmer la suppression, même si le cloud contient une version plus récente."
                      : "Conserver cette copie puis remplacer le cloud."}
                </small>
                <button
                  className="primary-action"
                  disabled={resolvingConflict}
                  onClick={() => void resolveCurrentConflict("local")}
                >
                  {conflicts[0].kind === "deleted"
                    ? "Restaurer le cahier"
                    : conflicts[0].kind === "local-delete"
                      ? "Confirmer la suppression"
                      : "Garder cette copie"}
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
                  {conflicts[0].kind === "deleted"
                    ? "Accepter la suppression"
                    : conflicts[0].kind === "local-delete"
                      ? "Conserver le cloud"
                      : "Garder le cloud"}
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
