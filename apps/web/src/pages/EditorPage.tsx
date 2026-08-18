import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  createId,
  createPage,
  type DocumentObject,
  type NotebookDocument
} from "@notylo/document-model";
import { NotebookRepository } from "@notylo/persistence";
import { evaluateMath } from "@notylo/math-engine";
import { EditorWorkspace } from "../components/EditorWorkspace";
import { useDocumentSession } from "../lib/session";
import { useAuth } from "../lib/auth";
import { ApiError } from "../lib/api";
import { uploadDocument } from "../lib/cloud";

const repository = new NotebookRepository();

export function EditorPage() {
  const { id } = useParams();
  const [loaded, setLoaded] = useState<NotebookDocument>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!id) return;
    void repository
      .load(id)
      .then((document) =>
        document
          ? setLoaded(document)
          : setError("Ce cahier n’existe plus ou n’a pas été trouvé sur cet appareil.")
      )
      .catch(() => setError("Impossible d’ouvrir ce cahier. Vos autres cahiers restent intacts."));
  }, [id]);

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

  return <LoadedEditor key={loaded.notebook.id} initial={loaded} />;
}

function LoadedEditor({ initial }: { readonly initial: NotebookDocument }) {
  const session = useDocumentSession(initial);
  const { accessToken, refreshSession } = useAuth();
  const latestDocument = useRef(session.document);
  const debounceTimer = useRef<number | undefined>(undefined);
  const retryTimer = useRef<number | undefined>(undefined);
  const syncing = useRef(false);
  const syncAgain = useRef(false);
  const conflictBlocked = useRef(false);
  const syncNowRef = useRef<() => Promise<void>>(async () => undefined);

  latestDocument.current = session.document;

  const syncNow = useCallback(async () => {
    if (!accessToken || !navigator.onLine || conflictBlocked.current) return;
    if (syncing.current) {
      syncAgain.current = true;
      return;
    }

    syncing.current = true;
    window.clearTimeout(retryTimer.current);

    try {
      await uploadDocument(accessToken, latestDocument.current);
    } catch (error) {
      if (error instanceof ApiError && (error.status === 409 || error.status === 410)) {
        conflictBlocked.current = true;
      } else if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        void refreshSession();
        retryTimer.current = window.setTimeout(() => {
          void syncNowRef.current();
        }, 2_000);
      } else {
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
  }, [accessToken, refreshSession]);

  syncNowRef.current = syncNow;

  useEffect(() => {
    conflictBlocked.current = false;
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;

    window.clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(() => {
      void syncNowRef.current();
    }, 1_800);

    return () => window.clearTimeout(debounceTimer.current);
  }, [accessToken, session.document]);

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
    <EditorWorkspace
      document={session.document}
      documentRef={session.documentRef}
      saveState={session.saveState}
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
