import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { WebsocketProvider } from "y-websocket";
import type { NotebookDocument } from "@notylo/document-model";

export interface SyncController {
  readonly ydoc: Y.Doc;
  readonly whenLocalReady: Promise<unknown>;
  connect(): void;
  disconnect(): void;
  destroy(): void;
  write(document: NotebookDocument): void;
  read(): NotebookDocument | undefined;
}

/** Yjs is deliberately an adapter around our JSON format—not the source schema itself. */
export function createSyncController(options: {
  readonly notebookId: string;
  readonly websocketUrl?: string;
  readonly enabled: boolean;
}): SyncController {
  const ydoc = new Y.Doc();
  const root = ydoc.getMap<unknown>("notylo-document");
  const local = new IndexeddbPersistence(`notylo-yjs-${options.notebookId}`, ydoc);
  const remote =
    options.enabled && options.websocketUrl
      ? new WebsocketProvider(options.websocketUrl, options.notebookId, ydoc, { connect: false })
      : undefined;
  return {
    ydoc,
    whenLocalReady: local.whenSynced,
    connect: () => remote?.connect(),
    disconnect: () => remote?.disconnect(),
    destroy: () => {
      remote?.destroy();
      local.destroy();
      ydoc.destroy();
    },
    write: (document) => ydoc.transact(() => root.set("value", document)),
    read: () => root.get("value") as NotebookDocument | undefined
  };
}
