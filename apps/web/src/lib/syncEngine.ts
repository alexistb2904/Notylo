import type { NotebookDocument } from "@notylo/document-model";
import {
  pullCloudDocument,
  resolveConflict as resolveCloudConflict,
  syncConflictFromError,
  uploadDocument,
  type SyncConflict
} from "./cloud";

export type { SyncConflict } from "./cloud";

/**
 * Editor-facing synchronization boundary.
 *
 * The current implementation delegates to the revision/snapshot cloud protocol,
 * but callers no longer need to know how the transport or conflict protocol is
 * implemented. This keeps a future CRDT/operation-log migration out of the page
 * layer and gives tests one stable seam to replace.
 */
export function createCloudSyncEngine(accessToken: string, userId: string) {
  return {
    push(document: NotebookDocument) {
      return uploadDocument(accessToken, document, userId);
    },

    pull(document: NotebookDocument) {
      return pullCloudDocument(accessToken, userId, document);
    },

    conflictFromError(error: unknown, document: NotebookDocument) {
      return syncConflictFromError(error, document);
    },

    resolveConflict(conflict: SyncConflict, keep: "local" | "cloud") {
      return resolveCloudConflict(accessToken, conflict, keep, userId);
    }
  } as const;
}

export type CloudSyncEngine = ReturnType<typeof createCloudSyncEngine>;
