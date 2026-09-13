import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyOperation,
  type DocumentOperation,
  type NotebookDocument,
  TransactionHistory
} from "@notylo/document-model";
import { NotebookRepository } from "@notylo/persistence";

export type SaveState =
  | "saved"
  | "saving"
  | "error"
  | "offline"
  | "cloud-synced"
  | "conflict";

type PendingSave = {
  readonly document: NotebookDocument;
  readonly snapshot: boolean;
};

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
  const pendingSave = useRef<PendingSave>();
  const writeChain = useRef<Promise<void>>(Promise.resolve());
  const mounted = useRef(true);
  documentRef.current = document;

  const enqueueRepositoryWrite = useCallback(
    (next: NotebookDocument, snapshot = false) => {
      const write = async () => {
        await repository.save(next);
        if (snapshot) await repository.snapshot(next);
      };
      const queued = writeChain.current.then(write, write);
      writeChain.current = queued.catch(() => undefined);
      return queued;
    },
    [repository]
  );

  const persist = useCallback(
    async (next: NotebookDocument, snapshot = false, reportState = true) => {
      if (reportState && mounted.current)
        setSaveState(navigator.onLine ? "saving" : "offline");
      try {
        await enqueueRepositoryWrite(next, snapshot);
        if (reportState && mounted.current)
          setSaveState(navigator.onLine ? "saved" : "offline");
      } catch {
        if (reportState && mounted.current) setSaveState("error");
      }
    },
    [enqueueRepositoryWrite]
  );

  const flushPendingSave = useCallback(
    (reportState = true) => {
      const pending = pendingSave.current;
      if (!pending) return Promise.resolve();
      pendingSave.current = undefined;
      window.clearTimeout(timer.current);
      timer.current = undefined;
      return persist(pending.document, pending.snapshot, reportState);
    },
    [persist]
  );

  const scheduleSave = useCallback(
    (next: NotebookDocument, snapshot = false) => {
      const previous = pendingSave.current;
      pendingSave.current = {
        document: next,
        snapshot: snapshot || previous?.snapshot === true
      };
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        void flushPendingSave();
      }, 260);
    },
    [flushPendingSave]
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

  // A remote update was already persisted by the cloud synchronizer. Cancel a
  // stale debounced local write, then enqueue the adopted document after any
  // local write that was already in flight so the local repository cannot end
  // up behind the in-memory/cloud version because of a race.
  const adopt = useCallback(
    (next: NotebookDocument) => {
      pendingSave.current = undefined;
      window.clearTimeout(timer.current);
      timer.current = undefined;
      history.current = new TransactionHistory();
      documentRef.current = next;
      setDocument(next);
      void enqueueRepositoryWrite(next);
    },
    [enqueueRepositoryWrite]
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
    mounted.current = true;
    const handleOnline = () => setSaveState("saved");
    const handleOffline = () => setSaveState("offline");
    const handlePageHide = () => {
      void flushPendingSave();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") void flushPendingSave();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    const snapshot = window.setInterval(() => {
      void repository.snapshot(documentRef.current);
    }, 60_000);
    return () => {
      mounted.current = false;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(snapshot);
      void flushPendingSave(false);
    };
  }, [flushPendingSave, repository]);

  return useMemo(
    () => ({
      document,
      documentRef,
      saveState,
      commit,
      replace,
      adopt,
      undo,
      redo,
      canUndo: history.current.canUndo,
      canRedo: history.current.canRedo
    }),
    [document, saveState, commit, replace, adopt, undo, redo]
  );
}
