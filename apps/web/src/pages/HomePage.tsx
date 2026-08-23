import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent
} from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
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
import { formatDate, intlLocale, t } from "../i18n";
import {
  createHomeFolder,
  deleteHomeFolder,
  loadHomeFolders,
  moveNotebookToFolder,
  removeNotebookFromFolders,
  renameHomeFolder,
  saveHomeFolders,
  type HomeFolderState,
  type HomeFolder
} from "../lib/homeFolders";

export function HomePage() {
  const navigate = useNavigate();
  const { user, accessToken, ready, logout } = useAuth();
  const repository = useMemo(() => new NotebookRepository(user?.id), [user?.id]);
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
  const [folderState, setFolderState] = useState<HomeFolderState>(() => loadHomeFolders());
  const [activeFolderId, setActiveFolderId] = useState<string>();
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderMenu, setFolderMenu] = useState<HomeFolder>();
  const [folderRename, setFolderRename] = useState("");
  const [draggedNotebookId, setDraggedNotebookId] = useState<string>();
  const [dropTargetFolderId, setDropTargetFolderId] = useState<string>();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const updateFolderState = useCallback(
    (update: (current: HomeFolderState) => HomeFolderState) => {
      setFolderState((current) => {
        const next = update(current);
        if (next !== current) saveHomeFolders(next);
        return next;
      });
    },
    []
  );

  const refresh = useCallback(async () => setNotebooks(await repository.list()), [repository]);
  useEffect(() => {
    void (async () => {
      if (user) await repository.claimAnonymous(user.id);
      await refresh();
    })();
  }, [refresh, repository, user]);
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
      title: title || t("home.newNotebookDefault"),
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
      if (activeFolderId) {
        updateFolderState((current) =>
          moveNotebookToFolder(current, document.notebook.id, activeFolderId)
        );
      }
      navigate(`/notebook/${document.notebook.id}`);
    } catch (error) {
      setCreationError(error instanceof Error ? error.message : t("home.createFailed"));
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
          title: `${imported.document.notebook.title} (${t("home.importedSuffix")})`,
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
      if (activeFolderId) {
        updateFolderState((current) =>
          moveNotebookToFolder(current, document.notebook.id, activeFolderId)
        );
      }
      await refresh();
      navigate(`/notebook/${document.notebook.id}`);
    } catch (error) {
      alert(error instanceof Error ? error.message : t("home.importFailed"));
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
    updateFolderState((current) => removeNotebookFromFolders(current, notebookMenu.id));
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
  const createFolder = () => {
    if (!folderName.trim()) return;
    const folder: HomeFolder = {
      id: createId("folder"),
      name: folderName,
      createdAt: Date.now()
    };
    updateFolderState((current) => createHomeFolder(current, folder));
    setFolderName("");
    setFolderDialogOpen(false);
  };
  const openFolderMenu = (folder: HomeFolder) => {
    setFolderMenu(folder);
    setFolderRename(folder.name);
  };
  const saveFolderName = () => {
    if (!folderMenu || !folderRename.trim()) return;
    updateFolderState((current) => renameHomeFolder(current, folderMenu.id, folderRename));
    setFolderMenu(undefined);
  };
  const removeFolder = () => {
    if (!folderMenu) return;
    updateFolderState((current) => deleteHomeFolder(current, folderMenu.id));
    if (activeFolderId === folderMenu.id) setActiveFolderId(undefined);
    setFolderMenu(undefined);
  };
  const moveNotebook = (notebookId: string, folderId: string | undefined) => {
    updateFolderState((current) => moveNotebookToFolder(current, notebookId, folderId));
  };
  const dropNotebookInFolder = (event: DragEvent<HTMLElement>, folderId: string) => {
    event.preventDefault();
    const notebookId =
      draggedNotebookId || event.dataTransfer.getData("application/x-notylo-notebook");
    if (notebookId) moveNotebook(notebookId, folderId);
    setDraggedNotebookId(undefined);
    setDropTargetFolderId(undefined);
  };
  const today = formatDate(new Date(), { weekday: "long", day: "numeric", month: "long" });
  const normalizedQuery = searchQuery
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase(intlLocale);
  const activeFolder = folderState.folders.find((folder) => folder.id === activeFolderId);
  const notebooksAtCurrentLocation = notebooks.filter((notebook) => {
    const folderId = folderState.notebookFolders[notebook.id];
    return activeFolder ? folderId === activeFolder.id : !folderId;
  });
  const searchedNotebooks = normalizedQuery && !activeFolder ? notebooks : notebooksAtCurrentLocation;
  const visibleNotebooks = searchedNotebooks.filter((notebook) =>
    normalizedQuery ? normalizeForSearch(notebook.title).includes(normalizedQuery) : true
  );
  const visibleFolders = activeFolder
    ? []
    : folderState.folders.filter((folder) =>
        normalizedQuery ? normalizeForSearch(folder.name).includes(normalizedQuery) : true
      );
  const libraryIsEmpty = notebooks.length === 0 && folderState.folders.length === 0;
  const notebookCountTotal = activeFolder ? notebooksAtCurrentLocation.length : notebooks.length;
  const notebookCountVisible = normalizedQuery ? visibleNotebooks.length : notebookCountTotal;
  const searchHasNoResult =
    Boolean(normalizedQuery) && visibleNotebooks.length === 0 && visibleFolders.length === 0;
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
            aria-label={mobileMenuOpen ? t("home.closeMenu") : t("home.openMenu")}
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
          <span>{user ? user.displayName : ready ? t("auth.signIn") : t("home.accountPending")}</span>
          <ChevronRight size={15} />
        </button>
        <nav className="home-navigation" id="mobile-navigation" aria-label={t("home.mainNavigation")}>
          <a className="active" href="#mes-cahiers" onClick={() => setMobileMenuOpen(false)}>
            <Grid2X2 size={17} /> {t("home.myNotebooks")}
          </a>
          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen(false);
              setDialogOpen(true);
            }}
          >
            <Plus size={17} /> {t("home.newNotebook")}
          </button>
          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen(false);
              setFolderDialogOpen(true);
            }}
          >
            <FolderPlus size={17} /> {t("home.newFolder")}
          </button>
          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen(false);
              void importNotezip();
            }}
          >
            <Upload size={16} /> {t("common.import")}
          </button>
        </nav>
        <div className="sidebar-footer">
          <p>{user ? t("home.connectedAccount") : ""}</p>
          {user && cloudStatus === "conflict" && (
            <span>{t("home.syncChoiceRequired")}</span>
          )}
          {user && (
            <button className="sidebar-signout" type="button" onClick={logout}>
              {t("home.signOut")}
            </button>
          )}
          <div className="utility-links">
            <Link to="/debug/pen">
              <PenLine size={14} /> {t("home.stylus")}
            </Link>
            <Link to="/debug/benchmark">
              <Gauge size={14} /> {t("home.diagnostic")}
            </Link>
          </div>
        </div>
      </aside>
      <section className="home-content" aria-label={t("home.myNotebooks")}>
        <header className="home-topbar">
          <form className="home-search" role="search" onSubmit={(event) => event.preventDefault()}>
            <Search size={17} />
            <input
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t("home.search")}
              aria-label={t("home.search")}
            />
            {searchQuery && (
              <button
                className="search-clear"
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  searchInputRef.current?.focus();
                }}
                aria-label={t("home.clearSearch")}
              >
                <X size={15} />
              </button>
            )}
          </form>
          <div className="home-account-actions">
            {user ? (
              <button className="account-button" type="button" onClick={() => navigate("/profile")}>
                {t("home.myProfile")}
              </button>
            ) : (
              <button className="account-button" type="button" onClick={() => setAuthOpen(true)}>
                {t("auth.signIn")}
              </button>
            )}
            <button className="new-page-button" onClick={() => setDialogOpen(true)}>
              <Plus size={16} /> {t("home.new")}
            </button>
          </div>
        </header>
        <div className="home-page-heading">
          <p className="home-date">{today}</p>
          <h1>{t("home.hello")}</h1>
          <p>{t("home.intro")}</p>
        </div>
        <section className="notebook-section" id="mes-cahiers">
          <div className="library-toolbar">
            <div className="library-path" aria-label={t("home.folderNavigation")}>
              {activeFolder ? (
                <>
                  <button type="button" onClick={() => setActiveFolderId(undefined)}>
                    {t("home.myNotebooks")}
                  </button>
                  <ChevronRight size={14} aria-hidden="true" />
                  <span>{activeFolder.name}</span>
                </>
              ) : (
                <span>{t("home.library")}</span>
              )}
            </div>
            <div className="library-toolbar-actions">
              {activeFolder && (
                <button
                  className="library-quiet-action"
                  type="button"
                  onClick={() => openFolderMenu(activeFolder)}
                >
                  <MoreHorizontal size={16} /> {t("home.manageFolder")}
                </button>
              )}
              <button
                className="library-folder-action"
                type="button"
                onClick={() => setFolderDialogOpen(true)}
              >
                <FolderPlus size={16} /> {t("home.newFolder")}
              </button>
            </div>
          </div>
          <div className="section-heading">
            <div>
              <h2>{activeFolder?.name ?? t("home.myNotebooks")}</h2>
              <p>{activeFolder ? t("home.folderIntro") : t("home.libraryIntro")}</p>
            </div>
            <span>
              {notebookCountTotal === 1
                ? t("home.notebookCountOne", {
                    visible: notebookCountVisible,
                    total: notebookCountTotal
                  })
                : t("home.notebookCountMany", {
                    visible: notebookCountVisible,
                    total: notebookCountTotal
                  })}
            </span>
          </div>
          {libraryIsEmpty ? (
            <button
              className="empty-shelf"
              type="button"
              aria-label={t("home.createFirstAria")}
              onClick={() => setDialogOpen(true)}
            >
              <span className="empty-icon">
                <FileText size={22} />
              </span>
              <span className="empty-shelf-copy">
                <span className="empty-shelf-kicker">{t("home.spaceReady")}</span>
                <strong>{t("home.createFirst")}</strong>
                <small>
                  {t("home.createFirstDescription")}
                </small>
              </span>
              <span className="empty-action">
                {t("home.start")} <ChevronRight size={16} />
              </span>
            </button>
          ) : searchHasNoResult ? (
            <div className="search-empty" role="status">
              <Search size={20} aria-hidden="true" />
              <div>
                <strong>{t("home.noNotebookFound")}</strong>
                <p>{t("home.noNotebookFoundDescription")}</p>
              </div>
              <button type="button" onClick={() => setSearchQuery("")}>
                {t("home.clear")}
              </button>
            </div>
          ) : (
            <>
              {visibleFolders.length > 0 && (
                <div className="folder-grid" role="list" aria-label={t("home.folders")}>
                  {visibleFolders.map((folder) => {
                    const itemCount = notebooks.filter(
                      (notebook) => folderState.notebookFolders[notebook.id] === folder.id
                    ).length;
                    return (
                      <article
                        key={folder.id}
                        role="listitem"
                        className={`folder-card${dropTargetFolderId === folder.id ? " is-drop-target" : ""}`}
                        onDragEnter={(event) => {
                          event.preventDefault();
                          if (draggedNotebookId) setDropTargetFolderId(folder.id);
                        }}
                        onDragOver={(event) => {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                        }}
                        onDragLeave={() => setDropTargetFolderId(undefined)}
                        onDrop={(event) => dropNotebookInFolder(event, folder.id)}
                      >
                        <button
                          className="folder-card-open"
                          type="button"
                          aria-label={t("home.openFolder", { name: folder.name })}
                          onClick={() => {
                            setActiveFolderId(folder.id);
                            setSearchQuery("");
                          }}
                        >
                          <span className="folder-card-icon">
                            <Folder size={24} strokeWidth={1.7} />
                          </span>
                          <span className="folder-card-copy">
                            <strong>{folder.name}</strong>
                            <small>
                              {itemCount === 1
                                ? t("home.folderItemCountOne")
                                : t("home.folderItemCountMany", { count: itemCount })}
                            </small>
                          </span>
                          <ChevronRight className="folder-card-arrow" size={17} aria-hidden="true" />
                        </button>
                        <button
                          className="folder-card-menu"
                          type="button"
                          aria-label={t("home.folderActions", { name: folder.name })}
                          onClick={() => openFolderMenu(folder)}
                        >
                          <MoreHorizontal size={17} />
                        </button>
                      </article>
                    );
                  })}
                </div>
              )}
              {visibleNotebooks.length > 0 && (
                <div className="notebook-grid">
                  {visibleNotebooks.map((notebook) => (
                    <button
                      key={notebook.id}
                      className={`notebook-card${draggedNotebookId === notebook.id ? " is-dragging" : ""}`}
                      style={{ "--cover": "#ddddd8" } as CSSProperties}
                      draggable
                      onDragStart={(event) => {
                        setDraggedNotebookId(notebook.id);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("application/x-notylo-notebook", notebook.id);
                      }}
                      onDragEnd={() => {
                        setDraggedNotebookId(undefined);
                        setDropTargetFolderId(undefined);
                      }}
                      onClick={() => openNotebookMenu(notebook)}
                    >
                      <span className="card-icon">
                        <FileText size={20} />
                      </span>
                      <span className="card-menu" aria-hidden>
                        <MoreHorizontal size={18} />
                      </span>
                      <div className="card-copy">
                        <p>{notebook.mode === "book" ? t("common.book") : t("common.whiteboard")}</p>
                        <h3>{notebook.title}</h3>
                      </div>
                      <div className="card-footer">
                        <small>
                          {t("home.modified", {
                            date: formatDate(notebook.updatedAt, { dateStyle: "medium" })
                          })}
                        </small>
                        <span className="card-open">
                          {t("home.open")} <ChevronRight size={14} />
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {activeFolder && !normalizedQuery && visibleNotebooks.length === 0 && (
                <div className="folder-empty">
                  <span>
                    <FolderOpen size={22} />
                  </span>
                  <div>
                    <strong>{t("home.emptyFolder")}</strong>
                    <p>{t("home.emptyFolderDescription")}</p>
                  </div>
                  <button type="button" onClick={() => setDialogOpen(true)}>
                    <Plus size={15} /> {t("home.createHere")}
                  </button>
                </div>
              )}
            </>
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
              <p className="eyebrow">{t("home.freshStart")}</p>
              <h2>{t("home.createSpace")}</h2>
            </div>
            <label>
              {t("home.name")}
              <input
                autoFocus
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t("home.namePlaceholder")}
              />
            </label>
            <fieldset>
              <legend>{t("home.format")}</legend>
              <div className="segmented">
                <button
                  type="button"
                  aria-pressed={mode === "book"}
                  onClick={() => setMode("book")}
                >
                  ▤ {t("common.book")}
                </button>
                <button
                  type="button"
                  aria-pressed={mode === "whiteboard"}
                  onClick={() => setMode("whiteboard")}
                >
                  ⌁ {t("common.whiteboard")}
                </button>
              </div>
            </fieldset>
            {mode === "book" && (
              <fieldset>
                <legend>{t("home.pageBackground")}</legend>
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
                        ? t("home.backgroundBlank")
                        : value === "ruled"
                          ? t("home.backgroundRuled")
                          : value === "grid-5"
                            ? t("home.backgroundGrid")
                            : value === "dots"
                              ? t("home.backgroundDots")
                              : t("home.backgroundSeyes")}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
            <div className="dialog-actions">
              <button type="button" className="text-button" onClick={() => setDialogOpen(false)}>
                {t("common.cancel")}
              </button>
              <button type="submit" className="primary-action" disabled={creating}>
                {creating ? t("home.creating") : t("home.createNotebookAction")}
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
      {folderDialogOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setFolderDialogOpen(false)}
        >
          <form
            className="new-notebook-dialog folder-dialog"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              createFolder();
            }}
          >
            <div className="dialog-title folder-dialog-title">
              <span aria-hidden="true">
                <FolderPlus size={20} />
              </span>
              <div>
                <p className="eyebrow">{t("home.localOrganization")}</p>
                <h2>{t("home.createFolder")}</h2>
              </div>
            </div>
            <label>
              {t("home.folderName")}
              <input
                autoFocus
                maxLength={80}
                value={folderName}
                onChange={(event) => setFolderName(event.target.value)}
                placeholder={t("home.folderNamePlaceholder")}
              />
            </label>
            <p className="folder-dialog-note">{t("home.folderLocalDescription")}</p>
            <div className="dialog-actions">
              <button
                type="button"
                className="text-button"
                onClick={() => setFolderDialogOpen(false)}
              >
                {t("common.cancel")}
              </button>
              <button className="primary-action" type="submit" disabled={!folderName.trim()}>
                {t("home.createFolderAction")}
              </button>
            </div>
          </form>
        </div>
      )}
      {folderMenu && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setFolderMenu(undefined)}
        >
          <section
            className="new-notebook-dialog notebook-menu-dialog folder-menu-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="folder-menu-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="dialog-title folder-dialog-title">
              <span aria-hidden="true">
                <FolderOpen size={20} />
              </span>
              <div>
                <p className="eyebrow">{t("home.folder")}</p>
                <h2 id="folder-menu-title">{folderMenu.name}</h2>
              </div>
            </div>
            <label>
              {t("home.renameFolder")}
              <input
                maxLength={80}
                value={folderRename}
                onChange={(event) => setFolderRename(event.target.value)}
              />
            </label>
            <div className="notebook-menu-actions">
              <div className="notebook-menu-primary">
                <button
                  className="primary-action"
                  type="button"
                  onClick={() => {
                    setActiveFolderId(folderMenu.id);
                    setSearchQuery("");
                    setFolderMenu(undefined);
                  }}
                >
                  {t("home.openThisFolder")}
                </button>
              </div>
              <div className="notebook-menu-secondary">
                <button
                  className="outline-action"
                  type="button"
                  disabled={!folderRename.trim()}
                  onClick={saveFolderName}
                >
                  {t("home.saveName")}
                </button>
              </div>
              <div className="notebook-menu-danger folder-menu-danger">
                <p>{t("home.deleteFolderDescription")}</p>
                <button className="danger-action" type="button" onClick={removeFolder}>
                  {t("home.deleteFolder")}
                </button>
              </div>
            </div>
            <button className="text-button menu-close" onClick={() => setFolderMenu(undefined)}>
              {t("common.close")}
            </button>
          </section>
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
              <p className="eyebrow">{notebookMenu.mode === "book" ? t("common.book") : t("common.whiteboard")}</p>
              <h2 id="notebook-menu-title">{notebookMenu.title}</h2>
            </div>
            <label>
              {t("home.rename")}
              <input value={rename} onChange={(event) => setRename(event.target.value)} />
            </label>
            <label className="notebook-folder-field">
              {t("home.moveToFolder")}
              <select
                value={folderState.notebookFolders[notebookMenu.id] ?? ""}
                onChange={(event) => moveNotebook(notebookMenu.id, event.target.value || undefined)}
              >
                <option value="">{t("home.libraryRoot")}</option>
                {folderState.folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
              <small>{t("home.folderLocalOnly")}</small>
            </label>
            <div className="notebook-menu-actions">
              <div className="notebook-menu-primary">
                <button
                  className="primary-action"
                  onClick={() => navigate(`/notebook/${notebookMenu.id}`)}
                >
                  {t("home.openNotebook")}
                </button>
              </div>
              <div
                className="notebook-menu-secondary"
                role="group"
                aria-label={t("home.secondaryActions")}
              >
                <button className="outline-action" onClick={() => void renameNotebook()}>
                  {t("home.saveName")}
                </button>
                <button className="outline-action" onClick={() => void exportNotebook()}>
                  {t("home.exportCopy")}
                </button>
              </div>
              <div className="notebook-menu-danger">
                <button className="danger-action" onClick={() => setConfirmDelete(true)}>
                  {t("home.delete")}
                </button>
              </div>
            </div>
            <button className="text-button menu-close" onClick={() => setNotebookMenu(undefined)}>
              {t("common.close")}
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
            <p className="eyebrow">{t("home.irreversible")}</p>
            <h2>{t("home.deleteTitle", { title: notebookMenu.title })}</h2>
            <p>
              {t("home.deleteDescription")}
            </p>
            <div className="dialog-actions">
              <button className="text-button" onClick={() => setConfirmDelete(false)}>
                {t("common.cancel")}
              </button>
              <button className="danger-action" onClick={() => void deleteNotebook()}>
                {t("home.deleteConfirm")}
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
                ? t("home.deleteConflict")
                : t("home.syncConflict")}
            </p>
            <h2 id="sync-conflict-title">
              {conflicts[0].kind === "deleted"
                ? t("home.deletedCloudTitle", { title: conflicts[0].title })
                : conflicts[0].kind === "local-delete"
                  ? t("home.localDeleteConflictTitle", { title: conflicts[0].title })
                  : t("home.copyConflictTitle", { title: conflicts[0].title })}
            </h2>
            <p className="sync-conflict-intro">
              {conflicts[0].kind === "deleted"
                ? t("home.deletedCloudIntro")
                : conflicts[0].kind === "local-delete"
                  ? t("home.localDeleteConflictIntro")
                  : t("home.copyConflictIntro")}
            </p>
            <div className="sync-conflict-options">
              <article>
                <p>{t("common.thisDevice")}</p>
                <strong>
                  {conflicts[0].kind === "local-delete"
                    ? t("home.deletionRequestedAt", { date: formatSyncDate(conflicts[0].deletedAt) })
                    : formatSyncDate(conflicts[0].local.notebook.updatedAt)}
                </strong>
                <small>
                  {conflicts[0].kind === "deleted"
                    ? t("home.restoreCloudCopy")
                    : conflicts[0].kind === "local-delete"
                      ? t("home.confirmDeleteNewerCloud")
                      : t("home.keepLocalDescription")}
                </small>
                <button
                  className="primary-action"
                  disabled={resolvingConflict}
                  onClick={() => void resolveCurrentConflict("local")}
                >
                  {conflicts[0].kind === "deleted"
                    ? t("home.restoreNotebook")
                    : conflicts[0].kind === "local-delete"
                      ? t("home.confirmDeletion")
                      : t("home.keepThisCopy")}
                </button>
              </article>
              <article>
                <p>{t("common.cloud")}</p>
                {conflicts[0].kind === "deleted" ? (
                  <>
                    <strong>{t("home.deletedAt", { date: formatSyncDate(conflicts[0].deletedAt) })}</strong>
                    <small>{t("home.deleteLocalModified")}</small>
                  </>
                ) : (
                  <>
                    <strong>{formatSyncDate(conflicts[0].cloud.notebook.updatedAt)}</strong>
                    <small>{t("home.replaceLocalFromCloud")}</small>
                  </>
                )}
                <button
                  className="outline-action"
                  disabled={resolvingConflict}
                  onClick={() => void resolveCurrentConflict("cloud")}
                >
                  {conflicts[0].kind === "deleted"
                    ? t("home.acceptDeletion")
                    : t("home.keepCloud")}
                </button>
              </article>
            </div>
            {resolvingConflict && (
              <p className="sync-conflict-progress" role="status">
                {t("home.applyingChoice")}
              </p>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

function formatSyncDate(value: number): string {
  return formatDate(value, { dateStyle: "full", timeStyle: "short" });
}

function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase(intlLocale);
}
