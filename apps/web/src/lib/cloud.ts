import type { NotebookDocument } from "@notylo/document-model";
import { getDatabase, NotebookRepository } from "@notylo/persistence";
import { ApiError, cloudApi } from "./api";

const repository = new NotebookRepository();
const syncMetaPrefix = "cloud-sync:";

type CloudSyncMeta = {
  readonly version: 1;
  readonly documentUpdatedAt: number;
  readonly assetHashes: Readonly<Record<string, string>>;
  readonly syncedAt: number;
};

export type SyncConflict = {
  readonly notebookId: string;
  readonly title: string;
  readonly local: NotebookDocument;
  readonly cloud: NotebookDocument;
};

export async function reconcileCloud(accessToken: string): Promise<readonly SyncConflict[]> {
  const remote = await cloudApi.list(accessToken);
  const remoteIds = new Set(remote.notebooks.map((entry) => entry.id));
  const localNotebooks = await repository.list();
  const localById = new Map(localNotebooks.map((notebook) => [notebook.id, notebook]));
  const conflicts: SyncConflict[] = [];

  for (const entry of remote.notebooks) {
    const localSummary = localById.get(entry.id);
    if (!localSummary) {
      const remoteDocument = await loadCloudDocument(accessToken, entry.id);
      if (!remoteDocument) continue;
      const assetHashes = await downloadAssets(accessToken, remoteDocument);
      await repository.save(remoteDocument);
      await writeSyncMeta(entry.id, remoteDocument.notebook.updatedAt, assetHashes);
      continue;
    }

    const meta = await readSyncMeta(entry.id);

    if (localSummary.updatedAt === entry.updatedAt) {
      const localDocument = await repository.load(entry.id);
      const remoteDocument = await loadCloudDocument(accessToken, entry.id);
      if (!localDocument || !remoteDocument) continue;

      let assetHashes: Readonly<Record<string, string>> = meta?.assetHashes ?? {};
      assetHashes = await uploadChangedAssets(
        accessToken,
        localDocument,
        assetHashes
      );
      assetHashes = {
        ...assetHashes,
        ...(await downloadAssets(accessToken, remoteDocument, true))
      };
      await writeSyncMeta(entry.id, entry.updatedAt, assetHashes);
      continue;
    }

    if (!meta) {
      const [localDocument, remoteDocument] = await Promise.all([
        repository.load(entry.id),
        loadCloudDocument(accessToken, entry.id)
      ]);
      if (localDocument && remoteDocument)
        conflicts.push({
          notebookId: entry.id,
          title: localSummary.title,
          local: localDocument,
          cloud: remoteDocument
        });
      continue;
    }

    const localChanged = localSummary.updatedAt !== meta.documentUpdatedAt;
    const remoteChanged = entry.updatedAt !== meta.documentUpdatedAt;

    if (localChanged && remoteChanged) {
      const [localDocument, remoteDocument] = await Promise.all([
        repository.load(entry.id),
        loadCloudDocument(accessToken, entry.id)
      ]);
      if (localDocument && remoteDocument)
        conflicts.push({
          notebookId: entry.id,
          title: localSummary.title,
          local: localDocument,
          cloud: remoteDocument
        });
      continue;
    }

    if (localChanged) {
      const localDocument = await repository.load(entry.id);
      if (localDocument) await uploadDocument(accessToken, localDocument);
      continue;
    }

    if (remoteChanged) {
      const remoteDocument = await loadCloudDocument(accessToken, entry.id);
      if (!remoteDocument) continue;
      const assetHashes = await downloadAssets(accessToken, remoteDocument);
      await repository.save(remoteDocument);
      await writeSyncMeta(entry.id, remoteDocument.notebook.updatedAt, assetHashes);
      continue;
    }

    await writeSyncMeta(entry.id, entry.updatedAt, meta.assetHashes);
  }

  for (const notebook of localNotebooks) {
    if (remoteIds.has(notebook.id)) continue;
    const local = await repository.load(notebook.id);
    if (local) await uploadDocument(accessToken, local);
  }

  return conflicts;
}

export async function resolveConflict(
  accessToken: string,
  conflict: SyncConflict,
  keep: "local" | "cloud"
): Promise<void> {
  if (keep === "local") {
    await uploadDocument(accessToken, conflict.local, true);
    return;
  }

  const assetHashes = await downloadAssets(accessToken, conflict.cloud);
  await repository.save(conflict.cloud);
  await writeSyncMeta(
    conflict.notebookId,
    conflict.cloud.notebook.updatedAt,
    assetHashes
  );
}

export async function uploadDocument(
  accessToken: string,
  document: NotebookDocument,
  force = false
): Promise<void> {
  const notebookId = document.notebook.id;
  const meta = await readSyncMeta(notebookId);

  if (!force) {
    const remoteDocument = await loadCloudDocument(accessToken, notebookId);
    if (remoteDocument) {
      if (meta) {
        const remoteChanged =
          remoteDocument.notebook.updatedAt !== meta.documentUpdatedAt;
        const remoteAlreadyMatchesLocal =
          remoteDocument.notebook.updatedAt === document.notebook.updatedAt;
        if (remoteChanged && !remoteAlreadyMatchesLocal)
          throw syncConflictError(remoteDocument);
      } else if (remoteDocument.notebook.updatedAt !== document.notebook.updatedAt) {
        throw syncConflictError(remoteDocument);
      }
    }
  }

  await cloudApi.save(accessToken, notebookId, document, force);

  // Persist the document checkpoint before assets. If an asset upload fails,
  // the next retry knows the document snapshot itself is already accepted.
  await writeSyncMeta(
    notebookId,
    document.notebook.updatedAt,
    meta?.assetHashes ?? {}
  );

  const assetHashes = await uploadChangedAssets(
    accessToken,
    document,
    meta?.assetHashes ?? {}
  );
  await writeSyncMeta(notebookId, document.notebook.updatedAt, assetHashes);
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

    await cloudApi.uploadAsset(
      accessToken,
      document.notebook.id,
      asset.id,
      local.blob
    );
    next[asset.id] = asset.hash;
  }

  return next;
}

async function loadCloudDocument(
  accessToken: string,
  notebookId: string
): Promise<NotebookDocument | undefined> {
  try {
    const result = await cloudApi.load(accessToken, notebookId);
    return isDocument(result.document) ? result.document : undefined;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return undefined;
    throw error;
  }
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

async function readSyncMeta(notebookId: string): Promise<CloudSyncMeta | undefined> {
  const preference = await getDatabase().preferences.get(syncMetaKey(notebookId));
  return isSyncMeta(preference?.value) ? preference.value : undefined;
}

async function writeSyncMeta(
  notebookId: string,
  documentUpdatedAt: number,
  assetHashes: Readonly<Record<string, string>>
): Promise<void> {
  await getDatabase().preferences.put({
    key: syncMetaKey(notebookId),
    value: {
      version: 1,
      documentUpdatedAt,
      assetHashes: { ...assetHashes },
      syncedAt: Date.now()
    } satisfies CloudSyncMeta,
    updatedAt: Date.now()
  });
}

function syncMetaKey(notebookId: string): string {
  return `${syncMetaPrefix}${notebookId}`;
}

function syncConflictError(remoteDocument: NotebookDocument): ApiError {
  return new ApiError(
    409,
    "Une autre copie de ce cahier a changé dans le cloud. Revenez à la bibliothèque pour choisir la version à conserver.",
    { document: remoteDocument }
  );
}

function isSyncMeta(value: unknown): value is CloudSyncMeta {
  if (!value || typeof value !== "object") return false;
  const meta = value as Partial<CloudSyncMeta>;
  return (
    meta.version === 1 &&
    typeof meta.documentUpdatedAt === "number" &&
    Number.isFinite(meta.documentUpdatedAt) &&
    Boolean(meta.assetHashes) &&
    typeof meta.assetHashes === "object"
  );
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
