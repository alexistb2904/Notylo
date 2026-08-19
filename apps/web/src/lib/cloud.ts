import type { NotebookDocument } from "@notylo/document-model";
import { getDatabase, NotebookRepository } from "@notylo/persistence";
import { ApiError, cloudApi, type CloudDocumentResponse } from "./api";

const repository = new NotebookRepository();
const syncMetaPrefix = "cloud-sync:";

type CloudSyncMeta = {
  readonly version: 2;
  readonly revision: number;
  readonly documentUpdatedAt: number;
  readonly assetHashes: Readonly<Record<string, string>>;
  /** Locks an IndexedDB copy to the account that first synchronized it. */
  readonly accountId?: string;
  readonly syncedAt: number;
};

type DocumentSyncConflict = {
  readonly kind: "document";
  readonly notebookId: string;
  readonly title: string;
  readonly local: NotebookDocument;
  readonly cloud: NotebookDocument;
  readonly cloudRevision: number;
};

type RemoteDeletionSyncConflict = {
  readonly kind: "deleted";
  readonly notebookId: string;
  readonly title: string;
  readonly local: NotebookDocument;
  readonly deletedAt: number;
};

type LocalDeletionSyncConflict = {
  readonly kind: "local-delete";
  readonly notebookId: string;
  readonly title: string;
  readonly deletedAt: number;
  readonly cloud: NotebookDocument;
  readonly cloudRevision: number;
};

export type SyncConflict =
  | DocumentSyncConflict
  | RemoteDeletionSyncConflict
  | LocalDeletionSyncConflict;

export type CloudPullResult =
  | { readonly kind: "unchanged" }
  | { readonly kind: "updated"; readonly document: NotebookDocument }
  | { readonly kind: "deleted" }
  | { readonly kind: "conflict"; readonly conflict: SyncConflict };

/**
 * Uploads one complete document using optimistic concurrency. The server only
 * accepts the write when the revision we last synchronized is still current.
 */
export async function uploadDocument(
  accessToken: string,
  document: NotebookDocument,
  accountId?: string,
  force = false
): Promise<void> {
  const notebookId = document.notebook.id;
  const meta = await readSyncMeta(notebookId);
  if (!belongsToActiveAccount(meta, accountId)) return;

  const response = asCloudResponse(
    await cloudApi.save(accessToken, notebookId, document, meta?.revision ?? 0, force)
  );
  if (!response) throw new ApiError(502, "Réponse cloud invalide.");

  // Commit the document checkpoint before attachments. A failed attachment
  // upload is retried later without re-submitting the whole document.
  await writeSyncMeta(
    notebookId,
    response.revision,
    document.notebook.updatedAt,
    meta?.assetHashes ?? {},
    accountId
  );
  const assetHashes = await uploadChangedAssets(
    accessToken,
    document,
    meta?.assetHashes ?? {}
  );
  await writeSyncMeta(
    notebookId,
    response.revision,
    document.notebook.updatedAt,
    assetHashes,
    accountId
  );
}

/** Creates a cloud record immediately while keeping the local copy authoritative on failure. */
export async function createCloudDocument(
  accessToken: string,
  accountId: string,
  document: NotebookDocument
): Promise<void> {
  const response = asCloudResponse(await cloudApi.create(accessToken, document));
  if (!response) throw new ApiError(502, "Réponse cloud invalide.");
  await writeSyncMeta(document.notebook.id, response.revision, document.notebook.updatedAt, {}, accountId);
  const assetHashes = await uploadChangedAssets(accessToken, document, {});
  await writeSyncMeta(
    document.notebook.id,
    response.revision,
    document.notebook.updatedAt,
    assetHashes,
    accountId
  );
}

/**
 * Reconciles the library after sign-in, on reconnect, and periodically while
 * the page is visible. Remote changes win only when this device has no local
 * edit since its last confirmed revision; otherwise we surface a choice.
 */
export async function reconcileCloud(
  accessToken: string,
  accountId?: string
): Promise<readonly SyncConflict[]> {
  const conflicts = [...(await flushPendingDeletes(accessToken, accountId))];
  const remote = await cloudApi.list(accessToken);
  const remoteDeleted = remote.deletedNotebooks ?? [];
  const remoteDeletedIds = new Set(remoteDeleted.map((entry) => entry.id));

  let localNotebooks = await repository.list();
  let localById = new Map(localNotebooks.map((notebook) => [notebook.id, notebook]));

  for (const tombstone of remoteDeleted) {
    const localSummary = localById.get(tombstone.id);
    if (!localSummary) {
      const meta = await readSyncMeta(tombstone.id);
      if (belongsToActiveAccount(meta, accountId)) await clearSyncMeta(tombstone.id);
      continue;
    }

    const meta = await readSyncMeta(tombstone.id);
    if (!belongsToActiveAccount(meta, accountId)) continue;
    const localChanged = !meta || localSummary.updatedAt !== meta.documentUpdatedAt;
    if (localChanged) {
      const local = await repository.load(tombstone.id);
      if (local)
        conflicts.push({
          kind: "deleted",
          notebookId: tombstone.id,
          title: localSummary.title,
          local,
          deletedAt: tombstone.deletedAt
        });
      continue;
    }

    await repository.removeLocal(tombstone.id);
    await clearSyncMeta(tombstone.id);
  }

  localNotebooks = await repository.list();
  localById = new Map(localNotebooks.map((notebook) => [notebook.id, notebook]));
  const remoteIds = new Set(remote.notebooks.map((entry) => entry.id));

  for (const entry of remote.notebooks) {
    const localSummary = localById.get(entry.id);
    if (!localSummary) {
      const remoteDocument = await loadCloudDocument(accessToken, entry.id);
      if (!remoteDocument) continue;
      const assetHashes = await downloadAssets(accessToken, remoteDocument.document);
      await repository.save(remoteDocument.document);
      await writeSyncMeta(
        entry.id,
        remoteDocument.revision,
        remoteDocument.document.notebook.updatedAt,
        assetHashes,
        accountId
      );
      continue;
    }

    const meta = await readSyncMeta(entry.id);
    if (!belongsToActiveAccount(meta, accountId)) continue;
    const localDocument = await repository.load(entry.id);
    if (!localDocument) continue;

    // A legacy/local copy can be adopted without a conflict only when it is
    // demonstrably the same snapshot that is already in the cloud.
    if (!meta) {
      if (localDocument.notebook.updatedAt !== entry.updatedAt) {
        const remoteDocument = await loadCloudDocument(accessToken, entry.id);
        if (remoteDocument)
          conflicts.push(documentConflict(entry.id, localSummary.title, localDocument, remoteDocument));
        continue;
      }
      const remoteDocument = await loadCloudDocument(accessToken, entry.id);
      if (!remoteDocument) continue;
      const assetHashes = await downloadAssets(accessToken, remoteDocument.document, true);
      await repository.save(remoteDocument.document);
      await writeSyncMeta(
        entry.id,
        remoteDocument.revision,
        remoteDocument.document.notebook.updatedAt,
        assetHashes,
        accountId
      );
      continue;
    }

    const localChanged = localSummary.updatedAt !== meta.documentUpdatedAt;
    const remoteChanged = entry.revision !== meta.revision;

    if (localChanged && remoteChanged) {
      const remoteDocument = await loadCloudDocument(accessToken, entry.id);
      if (remoteDocument)
        conflicts.push(documentConflict(entry.id, localSummary.title, localDocument, remoteDocument));
      continue;
    }

    if (localChanged) {
      try {
        await uploadDocument(accessToken, localDocument, accountId);
      } catch (error) {
        const conflict = syncConflictFromError(error, localDocument);
        if (conflict) conflicts.push(conflict);
        else throw error;
      }
      continue;
    }

    if (remoteChanged) {
      const remoteDocument = await loadCloudDocument(accessToken, entry.id);
      if (!remoteDocument) continue;
      const assetHashes = await downloadAssets(accessToken, remoteDocument.document);
      await repository.save(remoteDocument.document);
      await writeSyncMeta(
        entry.id,
        remoteDocument.revision,
        remoteDocument.document.notebook.updatedAt,
        assetHashes,
        accountId
      );
      continue;
    }

    let assetHashes: Readonly<Record<string, string>> = meta.assetHashes;
    assetHashes = await uploadChangedAssets(accessToken, localDocument, assetHashes);
    const remoteDocument = await loadCloudDocument(accessToken, entry.id);
    if (remoteDocument) {
      assetHashes = {
        ...assetHashes,
        ...(await downloadAssets(accessToken, remoteDocument.document, true))
      };
      await writeSyncMeta(
        entry.id,
        remoteDocument.revision,
        localDocument.notebook.updatedAt,
        assetHashes,
        accountId
      );
    }
  }

  for (const notebook of localNotebooks) {
    if (remoteIds.has(notebook.id) || remoteDeletedIds.has(notebook.id)) continue;
    const meta = await readSyncMeta(notebook.id);
    if (!belongsToActiveAccount(meta, accountId)) continue;
    const local = await repository.load(notebook.id);
    if (!local) continue;
    try {
      await uploadDocument(accessToken, local, accountId);
    } catch (error) {
      const conflict = syncConflictFromError(error, local);
      if (conflict) conflicts.push(conflict);
      else throw error;
    }
  }

  return conflicts;
}

/** Pulls a single active document so another browser is reflected without reload. */
export async function pullCloudDocument(
  accessToken: string,
  accountId: string,
  local: NotebookDocument
): Promise<CloudPullResult> {
  const meta = await readSyncMeta(local.notebook.id);
  if (!belongsToActiveAccount(meta, accountId)) return { kind: "unchanged" };

  try {
    const remote = await loadCloudDocument(accessToken, local.notebook.id);
    if (!remote) return { kind: "unchanged" };
    if (!meta || remote.revision !== meta.revision) {
      const localChanged = !meta || local.notebook.updatedAt !== meta.documentUpdatedAt;
      if (localChanged)
        return {
          kind: "conflict",
          conflict: documentConflict(local.notebook.id, local.notebook.title, local, remote)
        };

      const assetHashes = await downloadAssets(accessToken, remote.document);
      await repository.save(remote.document);
      await writeSyncMeta(
        local.notebook.id,
        remote.revision,
        remote.document.notebook.updatedAt,
        assetHashes,
        accountId
      );
      return { kind: "updated", document: remote.document };
    }
    return { kind: "unchanged" };
  } catch (error) {
    if (!isDeletedError(error)) throw error;
    const deletedAt = deletionTimeFromError(error);
    if (meta && local.notebook.updatedAt === meta.documentUpdatedAt) {
      await repository.removeLocal(local.notebook.id);
      await clearSyncMeta(local.notebook.id);
      return { kind: "deleted" };
    }
    return {
      kind: "conflict",
      conflict: {
        kind: "deleted",
        notebookId: local.notebook.id,
        title: local.notebook.title,
        local,
        deletedAt
      }
    };
  }
}

/** Returns conflicts for deletes that raced with remote edits; network errors still retry normally. */
export async function flushPendingDeletes(
  accessToken: string,
  accountId?: string
): Promise<readonly SyncConflict[]> {
  const db = getDatabase();
  const pending = (await db.syncQueue.toArray())
    .filter((item) => item.type === "delete")
    .sort((left, right) => left.createdAt - right.createdAt);
  const conflicts: SyncConflict[] = [];

  for (const item of pending) {
    const meta = await readSyncMeta(item.notebookId);
    if (!meta) {
      // This notebook never reached the cloud, so there is nothing to delete remotely.
      await db.syncQueue.delete(item.id);
      continue;
    }
    if (!belongsToActiveAccount(meta, accountId)) continue;

    try {
      await cloudApi.deleteNotebook(
        accessToken,
        item.notebookId,
        deletionTimestamp(item),
        meta.revision
      );
      await db.syncQueue.delete(item.id);
      await clearSyncMeta(item.notebookId);
    } catch (error) {
      const remote = cloudResponseFromError(error);
      if (!remote) throw error;
      conflicts.push({
        kind: "local-delete",
        notebookId: item.notebookId,
        title: deletionTitle(item) ?? remote.document.notebook.title,
        deletedAt: deletionTimestamp(item),
        cloud: remote.document,
        cloudRevision: remote.revision
      });
    }
  }
  return conflicts;
}

export async function resolveConflict(
  accessToken: string,
  conflict: SyncConflict,
  keep: "local" | "cloud",
  accountId?: string
): Promise<void> {
  if (conflict.kind === "deleted") {
    if (keep === "local") await uploadDocument(accessToken, conflict.local, accountId, true);
    else {
      await repository.removeLocal(conflict.notebookId);
      await clearSyncMeta(conflict.notebookId);
    }
    return;
  }

  if (conflict.kind === "local-delete") {
    if (keep === "local") {
      await cloudApi.deleteNotebook(
        accessToken,
        conflict.notebookId,
        conflict.deletedAt,
        conflict.cloudRevision,
        true
      );
      await getDatabase().syncQueue.delete(`delete:${conflict.notebookId}`);
      await clearSyncMeta(conflict.notebookId);
    } else await acceptCloudDocument(accessToken, conflict.cloud, conflict.cloudRevision, accountId);
    return;
  }

  if (keep === "local") await uploadDocument(accessToken, conflict.local, accountId, true);
  else await acceptCloudDocument(accessToken, conflict.cloud, conflict.cloudRevision, accountId);
}

/** Converts a server response into an editor/library conflict without losing either copy. */
export function syncConflictFromError(
  error: unknown,
  local: NotebookDocument
): SyncConflict | undefined {
  const remote = cloudResponseFromError(error);
  if (remote) return documentConflict(local.notebook.id, local.notebook.title, local, remote);
  if (isDeletedError(error))
    return {
      kind: "deleted",
      notebookId: local.notebook.id,
      title: local.notebook.title,
      local,
      deletedAt: deletionTimeFromError(error)
    };
  return undefined;
}

async function acceptCloudDocument(
  accessToken: string,
  document: NotebookDocument,
  revision: number,
  accountId?: string
): Promise<void> {
  const assetHashes = await downloadAssets(accessToken, document);
  await repository.save(document);
  await writeSyncMeta(document.notebook.id, revision, document.notebook.updatedAt, assetHashes, accountId);
}

async function uploadChangedAssets(
  accessToken: string,
  document: NotebookDocument,
  knownHashes: Readonly<Record<string, string>>
): Promise<Readonly<Record<string, string>>> {
  const next: Record<string, string> = {};
  for (const asset of document.assets) {
    if (knownHashes[asset.id] === asset.hash) {
      next[asset.id] = asset.hash;
      continue;
    }
    const local = await repository.getAsset(asset.id);
    if (!local || local.hash !== asset.hash) continue;
    await cloudApi.uploadAsset(accessToken, document.notebook.id, asset.id, local.blob);
    next[asset.id] = asset.hash;
  }
  return next;
}

async function downloadAssets(
  accessToken: string,
  document: NotebookDocument,
  onlyMissing = false
): Promise<Readonly<Record<string, string>>> {
  const hashes: Record<string, string> = {};
  for (const asset of document.assets) {
    if (onlyMissing) {
      const local = await repository.getAsset(asset.id);
      if (local?.hash === asset.hash) {
        hashes[asset.id] = asset.hash;
        continue;
      }
    }
    try {
      await repository.putAsset(
        asset,
        await cloudApi.downloadAsset(accessToken, document.notebook.id, asset.id)
      );
      hashes[asset.id] = asset.hash;
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) throw error;
    }
  }
  return hashes;
}

async function loadCloudDocument(
  accessToken: string,
  notebookId: string
): Promise<{ readonly document: NotebookDocument; readonly revision: number } | undefined> {
  try {
    return asCloudResponse(await cloudApi.load(accessToken, notebookId));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return undefined;
    throw error;
  }
}

function asCloudResponse(
  value: CloudDocumentResponse
): { readonly document: NotebookDocument; readonly revision: number } | undefined {
  return isDocument(value.document) && validRevision(value.revision)
    ? { document: value.document, revision: value.revision }
    : undefined;
}

function cloudResponseFromError(
  error: unknown
): { readonly document: NotebookDocument; readonly revision: number } | undefined {
  if (!(error instanceof ApiError) || !error.payload || typeof error.payload !== "object") return undefined;
  const payload = error.payload as Partial<CloudDocumentResponse>;
  return isDocument(payload.document) && validRevision(payload.revision)
    ? { document: payload.document, revision: payload.revision }
    : undefined;
}

function documentConflict(
  notebookId: string,
  title: string,
  local: NotebookDocument,
  cloud: { readonly document: NotebookDocument; readonly revision: number }
): DocumentSyncConflict {
  return {
    kind: "document",
    notebookId,
    title,
    local,
    cloud: cloud.document,
    cloudRevision: cloud.revision
  };
}

function isDeletedError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 410;
}

function deletionTimeFromError(error: ApiError): number {
  const payload = error.payload;
  if (payload && typeof payload === "object") {
    const deletedAt = (payload as { deletedAt?: unknown }).deletedAt;
    if (typeof deletedAt === "number" && Number.isFinite(deletedAt)) return deletedAt;
  }
  return Date.now();
}

async function readSyncMeta(notebookId: string): Promise<CloudSyncMeta | undefined> {
  const preference = await getDatabase().preferences.get(syncMetaKey(notebookId));
  return isSyncMeta(preference?.value) ? preference.value : undefined;
}

async function writeSyncMeta(
  notebookId: string,
  revision: number,
  documentUpdatedAt: number,
  assetHashes: Readonly<Record<string, string>>,
  accountId?: string
): Promise<void> {
  await getDatabase().preferences.put({
    key: syncMetaKey(notebookId),
    value: {
      version: 2,
      revision,
      documentUpdatedAt,
      assetHashes: { ...assetHashes },
      ...(accountId ? { accountId } : {}),
      syncedAt: Date.now()
    } satisfies CloudSyncMeta,
    updatedAt: Date.now()
  });
}

async function clearSyncMeta(notebookId: string): Promise<void> {
  await getDatabase().preferences.delete(syncMetaKey(notebookId));
}

function syncMetaKey(notebookId: string): string {
  return `${syncMetaPrefix}${notebookId}`;
}

function belongsToActiveAccount(meta: CloudSyncMeta | undefined, accountId?: string): boolean {
  return !meta?.accountId || !accountId || meta.accountId === accountId;
}

function deletionTimestamp(item: { readonly payload: unknown; readonly createdAt: number }): number {
  if (item.payload && typeof item.payload === "object" && "deletedAt" in item.payload) {
    const deletedAt = (item.payload as { deletedAt?: unknown }).deletedAt;
    if (typeof deletedAt === "number" && Number.isFinite(deletedAt)) return deletedAt;
  }
  return item.createdAt;
}

function deletionTitle(item: { readonly payload: unknown }): string | undefined {
  if (!item.payload || typeof item.payload !== "object") return undefined;
  const title = (item.payload as { title?: unknown }).title;
  return typeof title === "string" && title.trim() ? title : undefined;
}

function isSyncMeta(value: unknown): value is CloudSyncMeta {
  if (!value || typeof value !== "object") return false;
  const meta = value as Partial<CloudSyncMeta>;
  return (
    meta.version === 2 &&
    validRevision(meta.revision) &&
    typeof meta.documentUpdatedAt === "number" &&
    Number.isFinite(meta.documentUpdatedAt) &&
    Boolean(meta.assetHashes) &&
    typeof meta.assetHashes === "object" &&
    (meta.accountId === undefined || typeof meta.accountId === "string")
  );
}

function validRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isDocument(value: unknown): value is NotebookDocument {
  if (!value || typeof value !== "object") return false;
  const document = value as Partial<NotebookDocument>;
  return (
    typeof document.notebook?.id === "string" &&
    typeof document.notebook.updatedAt === "number" &&
    Array.isArray(document.pages) &&
    Array.isArray(document.objects) &&
    Array.isArray(document.assets)
  );
}
