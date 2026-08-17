import { useEffect, useRef, useState } from "react";
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
  const { accessToken } = useAuth();
  const uploadTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!accessToken) return;
    window.clearTimeout(uploadTimer.current);
    uploadTimer.current = window.setTimeout(() => {
      void uploadDocument(accessToken, session.document).catch(() => undefined);
    }, 900);
    return () => window.clearTimeout(uploadTimer.current);
  }, [accessToken, session.document]);
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
