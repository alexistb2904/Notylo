import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyOperation,
  type DocumentOperation,
  type NotebookDocument,
  TransactionHistory
} from "@notylo/document-model";
import { NotebookRepository } from "@notylo/persistence";

export type SaveState = "saved" | "saving" | "error" | "offline";

export function useDocumentSession(
  initial: NotebookDocument,
  providedRepository?: NotebookRepository
) {
  const repositoryRef = useRef(providedRepository ?? new NotebookRepository());
  const repository = repositoryRef.current;
  const [document, setDocument] = useState(initial);
  const [saveState, setSaveState] = useState<SaveState>(navigator.onLine ? "saved" : "offline");
  const history = useRef(new TransactionHistory());
  const documentRef = useRef(document);
  const timer = useRef<number | undefined>(undefined);
  documentRef.current = document;

  const persist = useCallback(
    async (next: NotebookDocument, snapshot = false) => {
      setSaveState(navigator.onLine ? "saving" : "offline");
      try {
        await repository.save(next);
        if (snapshot) await repository.snapshot(next);
        setSaveState(navigator.onLine ? "saved" : "offline");
      } catch {
        setSaveState("error");
      }
    },
    [repository]
  );

  const scheduleSave = useCallback(
    (next: NotebookDocument, snapshot = false) => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        void persist(next, snapshot);
      }, 260);
    },
    [persist]
  );

  const commit = useCallback(
    (operation: DocumentOperation) => {
      history.current.commit(operation);
      const next = applyOperation(documentRef.current, operation);
      documentRef.current = next;
      setDocument(next);
      scheduleSave(next);
    },
    [scheduleSave]
  );

  const replace = useCallback(
    (updater: (current: NotebookDocument) => NotebookDocument, snapshot = false) => {
      const next = updater(documentRef.current);
      documentRef.current = next;
      setDocument(next);
      scheduleSave(next, snapshot);
    },
    [scheduleSave]
  );

  const undo = useCallback(() => {
    const result = history.current.undo(documentRef.current);
    if (result.operation) {
      documentRef.current = result.document;
      setDocument(result.document);
      scheduleSave(result.document);
    }
  }, [scheduleSave]);
  const redo = useCallback(() => {
    const result = history.current.redo(documentRef.current);
    if (result.operation) {
      documentRef.current = result.document;
      setDocument(result.document);
      scheduleSave(result.document);
    }
  }, [scheduleSave]);

  useEffect(() => {
    const handleOnline = () => setSaveState("saved");
    const handleOffline = () => setSaveState("offline");
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    const snapshot = window.setInterval(() => {
      void repository.snapshot(documentRef.current);
    }, 60_000);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.clearInterval(snapshot);
      window.clearTimeout(timer.current);
    };
  }, [repository]);

  return useMemo(
    () => ({
      document,
      documentRef,
      saveState,
      commit,
      replace,
      undo,
      redo,
      canUndo: history.current.canUndo,
      canRedo: history.current.canRedo
    }),
    [document, saveState, commit, replace, undo, redo]
  );
}
