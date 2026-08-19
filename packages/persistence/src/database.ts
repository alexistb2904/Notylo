import Dexie, { type EntityTable } from "dexie";
import type {
  Asset,
  DocumentObject,
  Notebook,
  NotebookDocument,
  Page
} from "@notylo/document-model";

export interface StoredAsset extends Asset {
  readonly blob: Blob;
}
export interface AssetReference {
  readonly key: string;
  readonly notebookId: string;
  readonly assetId: string;
}
export interface Snapshot {
  readonly id: string;
  readonly notebookId: string;
  readonly document: NotebookDocument;
  readonly createdAt: number;
}
export interface Preference {
  readonly key: string;
  readonly value: unknown;
  readonly updatedAt: number;
}
export interface SyncQueueItem {
  readonly id: string;
  readonly notebookId: string;
  readonly type: "document" | "asset" | "delete";
  readonly payload: unknown;
  readonly createdAt: number;
  readonly scopeId?: string;
}

export interface NotebookScope {
  readonly notebookId: string;
  readonly scopeId: string;
}

export const anonymousScope = "anonymous";

export class NotyloDatabase extends Dexie {
  notebooks!: EntityTable<Notebook, "id">;
  pages!: EntityTable<Page, "id">;
  objects!: EntityTable<DocumentObject, "id">;
  assets!: EntityTable<StoredAsset, "id">;
  assetRefs!: EntityTable<AssetReference, "key">;
  snapshots!: EntityTable<Snapshot, "id">;
  preferences!: EntityTable<Preference, "key">;
  syncQueue!: EntityTable<SyncQueueItem, "id">;
  notebookScopes!: EntityTable<NotebookScope, "notebookId">;

  constructor() {
    super("notylo-notes");
    this.version(1).stores({
      notebooks: "id, updatedAt, mode, title",
      pages: "id, notebookId, [notebookId+index]",
      objects: "id, notebookId, pageId, type, [notebookId+zIndex]",
      assets: "id, hash, mimeType",
      snapshots: "id, notebookId, createdAt",
      preferences: "key, updatedAt",
      syncQueue: "id, notebookId, createdAt"
    });
    this.version(2).stores({ assetRefs: "key, notebookId, assetId, [notebookId+assetId]" });
    this.version(3).stores({
      notebookScopes: "notebookId, scopeId"
    });
  }
}

let database: NotyloDatabase | undefined;
export function getDatabase(): NotyloDatabase {
  database ??= new NotyloDatabase();
  return database;
}
