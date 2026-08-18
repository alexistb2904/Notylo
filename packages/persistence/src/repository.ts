import type {
  Asset,
  DocumentObject,
  NotebookDocument,
  NotebookSummary,
  Page
} from "@notylo/document-model";
import { createId, migrateDocument } from "@notylo/document-model";
import { getDatabase, type StoredAsset } from "./database";

function deletionQueueId(notebookId: string): string {
  return `delete:${notebookId}`;
}

export class NotebookRepository {
  async save(document: NotebookDocument): Promise<void> {
    const db = getDatabase();
    await db.transaction(
      "rw",
      db.notebooks,
      db.pages,
      db.objects,
      db.assetRefs,
      db.syncQueue,
      async () => {
        await db.syncQueue.delete(deletionQueueId(document.notebook.id));
        await db.notebooks.put(document.notebook);
        await db.pages.where("notebookId").equals(document.notebook.id).delete();
        await db.objects.where("notebookId").equals(document.notebook.id).delete();
        await db.assetRefs.where("notebookId").equals(document.notebook.id).delete();
        await db.pages.bulkPut([...document.pages]);
        await db.objects.bulkPut([...document.objects]);
        await db.assetRefs.bulkPut(
          document.assets.map((asset) => ({
            key: `${document.notebook.id}:${asset.id}`,
            notebookId: document.notebook.id,
            assetId: asset.id
          }))
        );
      }
    );
  }

  async load(notebookId: string): Promise<NotebookDocument | undefined> {
    const db = getDatabase();
    const notebook = await db.notebooks.get(notebookId);
    if (!notebook) return undefined;
    const [pages, objects, refs] = await Promise.all([
      db.pages.where("notebookId").equals(notebookId).sortBy("index"),
      db.objects.where("notebookId").equals(notebookId).toArray(),
      db.assetRefs.where("notebookId").equals(notebookId).toArray()
    ]);
    const assets = (await Promise.all(refs.map((ref) => db.assets.get(ref.assetId))))
      .filter((asset): asset is StoredAsset => Boolean(asset))
      .map(({ blob: _blob, ...asset }) => asset);
    return migrateDocument({
      schemaVersion: notebook.schemaVersion,
      notebook,
      pages,
      objects,
      assets
    });
  }

  async list(): Promise<readonly NotebookSummary[]> {
    const notebooks = await getDatabase().notebooks.orderBy("updatedAt").reverse().toArray();
    return notebooks.map(({ id, title, mode, updatedAt }) => ({ id, title, mode, updatedAt }));
  }

  async remove(notebookId: string): Promise<void> {
    await this.removeInternal(notebookId, true);
  }

  async removeLocal(notebookId: string): Promise<void> {
    await this.removeInternal(notebookId, false);
  }

  private async removeInternal(notebookId: string, queueCloudDelete: boolean): Promise<void> {
    const db = getDatabase();
    const now = Date.now();
    await db.transaction(
      "rw",
      db.notebooks,
      db.pages,
      db.objects,
      db.snapshots,
      db.assets,
      db.assetRefs,
      db.syncQueue,
      async () => {
        const refs = await db.assetRefs.where("notebookId").equals(notebookId).toArray();
        await db.syncQueue.where("notebookId").equals(notebookId).delete();
        if (queueCloudDelete) {
          await db.syncQueue.put({
            id: deletionQueueId(notebookId),
            notebookId,
            type: "delete",
            payload: { deletedAt: now },
            createdAt: now
          });
        }
        await db.notebooks.delete(notebookId);
        await db.pages.where("notebookId").equals(notebookId).delete();
        await db.objects.where("notebookId").equals(notebookId).delete();
        await db.snapshots.where("notebookId").equals(notebookId).delete();
        await db.assetRefs.where("notebookId").equals(notebookId).delete();
        for (const ref of refs) {
          const stillReferenced = await db.assetRefs.where("assetId").equals(ref.assetId).count();
          if (!stillReferenced) await db.assets.delete(ref.assetId);
        }
      }
    );
  }

  async attach(
    assetInput: Omit<Asset, "id" | "createdAt" | "localBlobId">,
    blob: Blob
  ): Promise<Asset> {
    const asset: StoredAsset = {
      ...assetInput,
      id: createId("asset"),
      createdAt: Date.now(),
      localBlobId: createId("blob"),
      blob
    };
    await getDatabase().assets.put(asset);
    const { blob: _blob, ...meta } = asset;
    return meta;
  }

  async getAsset(id: string): Promise<StoredAsset | undefined> {
    return getDatabase().assets.get(id);
  }
  async putAsset(asset: Asset, blob: Blob): Promise<void> {
    await getDatabase().assets.put({ ...asset, blob });
  }
  async snapshot(document: NotebookDocument): Promise<void> {
    await getDatabase().snapshots.put({
      id: createId("snap"),
      notebookId: document.notebook.id,
      document,
      createdAt: Date.now()
    });
  }
  async latestSnapshot(notebookId: string): Promise<NotebookDocument | undefined> {
    return (
      await getDatabase()
        .snapshots.where("notebookId")
        .equals(notebookId)
        .reverse()
        .sortBy("createdAt")
    )[0]?.document;
  }
  async putPage(page: Page): Promise<void> {
    await getDatabase().pages.put(page);
  }
  async putObject(object: DocumentObject): Promise<void> {
    await getDatabase().objects.put(object);
  }
}
