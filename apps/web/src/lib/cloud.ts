import type { NotebookDocument } from "@notylo/document-model";
import { NotebookRepository } from "@notylo/persistence";
import { ApiError, cloudApi } from "./api";

const repository = new NotebookRepository();

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
  const conflicts: SyncConflict[] = [];
  for (const entry of remote.notebooks) {
    const local = localNotebooks.find((notebook) => notebook.id === entry.id);
    if (!local) {
      const remoteDocument = await loadCloudDocument(accessToken, entry.id);
      if (!remoteDocument) continue;
      await downloadAssets(accessToken, remoteDocument);
      await repository.save(remoteDocument);
    } else if (local.updatedAt !== entry.updatedAt) {
      const remoteDocument = await loadCloudDocument(accessToken, entry.id);
      if (!remoteDocument) continue;
      const localDocument = await repository.load(entry.id);
      if (localDocument)
        conflicts.push({
          notebookId: entry.id,
          title: local.title,
          local: localDocument,
          cloud: remoteDocument
        });
    }
  }
  for (const notebook of localNotebooks) {
    if (remoteIds.has(notebook.id)) continue;
    const local = await repository.load(notebook.id);
    if (local) await uploadDocument(accessToken, local);
  }
  return conflicts;
}

async function loadCloudDocument(
  accessToken: string,
  notebookId: string
): Promise<NotebookDocument | undefined> {
  const result = await cloudApi.load(accessToken, notebookId);
  return isDocument(result.document) ? result.document : undefined;
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
  await downloadAssets(accessToken, conflict.cloud);
  await repository.save(conflict.cloud);
}

export async function uploadDocument(
  accessToken: string,
  document: NotebookDocument,
  force = false
): Promise<void> {
  await cloudApi.save(accessToken, document.notebook.id, document, force);
  for (const asset of document.assets) {
    const local = await repository.getAsset(asset.id);
    if (local) await cloudApi.uploadAsset(accessToken, document.notebook.id, asset.id, local.blob);
  }
}

async function downloadAssets(accessToken: string, document: NotebookDocument): Promise<void> {
  for (const asset of document.assets) {
    try {
      await repository.putAsset(
        asset,
        await cloudApi.downloadAsset(accessToken, document.notebook.id, asset.id)
      );
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) throw error;
    }
  }
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
