import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { createPage, type DocumentObject, type NotebookDocument } from "@notylo/document-model";
import { NotebookRepository } from "@notylo/persistence";
import { EditorWorkspace } from "../components/EditorWorkspace";
import { publicApi, type ApiError, type PublicDocumentResponse, type ShareMode } from "../lib/api";
import { useDocumentSession, type SaveState } from "../lib/session";
import { t } from "../i18n";

export function PublicPage() {
  const { token } = useParams();
  const [loaded, setLoaded] = useState<{ document: NotebookDocument; revision: number; mode: ShareMode }>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!token) return;
    let active = true;
    void loadPublicDocument(token)
      .then((result) => {
        if (active) setLoaded(result);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : t("public.unavailable"));
      });
    return () => {
      active = false;
    };
  }, [token]);

  if (error)
    return (
      <main className="fatal-state public-link-state">
        <span className="brand-mark">N</span>
        <p className="eyebrow">{t("common.publicLink")}</p>
        <h1>{t("public.notebookUnavailable")}</h1>
        <p>{error}</p>
        <Link to="/">{t("common.backToNotylo")}</Link>
      </main>
    );
  if (!loaded)
    return (
      <main className="loading-state public-link-state" aria-live="polite">
        <span className="brand-mark">N</span>
        <p className="eyebrow">{t("public.loadingEyebrow")}</p>
        <strong>{t("public.opening")}</strong>
        <p>{t("public.loadingResources")}</p>
      </main>
    );
  return <LoadedPublicNotebook token={token!} initial={loaded.document} initialRevision={loaded.revision} mode={loaded.mode} />;
}

function LoadedPublicNotebook({ token, initial, initialRevision, mode }: { readonly token: string; readonly initial: NotebookDocument; readonly initialRevision: number; readonly mode: ShareMode }) {
  const repository = useMemo(() => new NotebookRepository(`public:${token}`), [token]);
  const session = useDocumentSession(initial, repository);
  const [saveState, setSaveState] = useState<SaveState>("cloud-synced");
  const revisionRef = useRef(initialRevision);
  const saving = useRef(false);
  const saveAgain = useRef(false);
  const firstDocument = useRef(true);
  const latestDocument = useRef(session.document);
  const assetHashes = useRef<Readonly<Record<string, string>>>(Object.fromEntries(initial.assets.map((asset) => [asset.id, asset.hash])));
  latestDocument.current = session.document;

  const savePublic = useCallback(async (document: NotebookDocument) => {
    if (saving.current) {
      saveAgain.current = true;
      return;
    }
    saving.current = true;
    setSaveState("saving");
    try {
      const result = await publicApi.save(token, document, revisionRef.current);
      revisionRef.current = result.revision;
      const nextHashes: Record<string, string> = {};
      for (const asset of document.assets) {
        if (assetHashes.current[asset.id] === asset.hash) {
          nextHashes[asset.id] = asset.hash;
          continue;
        }
        const local = await repository.getAsset(asset.id);
        if (!local || local.hash !== asset.hash) continue;
        await publicApi.uploadAsset(token, asset.id, local.blob);
        nextHashes[asset.id] = asset.hash;
      }
      assetHashes.current = nextHashes;
      setSaveState("cloud-synced");
    } catch (reason) {
      const conflict = reason instanceof Error && "status" in reason && (reason as ApiError).status === 409;
      setSaveState(conflict ? "conflict" : "error");
      if (!conflict) window.setTimeout(() => void savePublic(latestDocument.current), 2_000);
      else saveAgain.current = false;
    } finally {
      saving.current = false;
      if (saveAgain.current) {
        saveAgain.current = false;
        void savePublic(latestDocument.current);
      }
    }
  }, [repository, token]);

  useEffect(() => {
    if (mode !== "write") return;
    if (firstDocument.current) {
      firstDocument.current = false;
      return;
    }
    const timer = window.setTimeout(() => void savePublic(session.document), 500);
    return () => window.clearTimeout(timer);
  }, [mode, savePublic, session.document]);

  const add = (object: DocumentObject) => session.commit({ kind: "add-object", object, label: t("ops.addObject") });
  const update = (before: readonly DocumentObject[], after: readonly DocumentObject[], label = t("ops.editSelection")) => session.commit({ kind: "update-objects", before, after, label });
  const remove = (objects: readonly DocumentObject[]) => session.commit({ kind: "delete-objects", objects, label: t("ops.delete") });
  const addPage = () => {
    if (mode !== "write" || session.document.notebook.mode !== "book") return;
    const prior = session.document.pages.at(-1);
    if (!prior) return;
    session.commit({
      kind: "add-page",
      page: createPage(session.document.notebook.id, session.document.pages.length, prior.format === "custom" ? "a4" : prior.format, prior.background),
      label: t("ops.addPage")
    });
  };

  return (
    <EditorWorkspace
      document={session.document}
      documentRef={session.documentRef}
      saveState={mode === "read" ? "saved" : saveState}
      readOnly={mode === "read"}
      publicMode={mode}
      onAdd={add}
      onUpdate={update}
      onDelete={remove}
      onAddPage={addPage}
      onUndo={session.undo}
      onRedo={session.redo}
      onReplace={session.replace}
    />
  );
}

async function loadPublicDocument(token: string): Promise<{ document: NotebookDocument; revision: number; mode: ShareMode }> {
  const repository = new NotebookRepository(`public:${token}`);
  const result = (await publicApi.load(token)) as PublicDocumentResponse;
  if (!isNotebookDocument(result.document)) throw new Error(t("public.invalidResponse"));
  await Promise.all(result.document.assets.map(async (asset) => {
    const blob = await publicApi.downloadAsset(token, asset.id);
    await repository.putAsset(asset, blob);
  }));
  return { document: result.document, revision: result.revision, mode: result.mode };
}

function isNotebookDocument(value: unknown): value is NotebookDocument {
  if (!value || typeof value !== "object") return false;
  const document = value as Partial<NotebookDocument>;
  return Boolean(document.notebook && typeof document.notebook.id === "string" && Array.isArray(document.pages) && Array.isArray(document.objects) && Array.isArray(document.assets));
}
