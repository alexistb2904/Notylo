import type { DocumentObject, NotebookDocument, Page } from "./types";

export type DocumentOperation =
  | { readonly kind: "add-object"; readonly object: DocumentObject; readonly label: string }
  | {
      readonly kind: "update-objects";
      readonly before: readonly DocumentObject[];
      readonly after: readonly DocumentObject[];
      readonly label: string;
    }
  | { readonly kind: "delete-objects"; readonly objects: readonly DocumentObject[]; readonly label: string }
  | { readonly kind: "add-page"; readonly page: Page; readonly label: string }
  | {
      readonly kind: "delete-page";
      readonly page: Page;
      readonly objects: readonly DocumentObject[];
      readonly label: string;
    }
  | {
      readonly kind: "restore-page";
      readonly page: Page;
      readonly objects: readonly DocumentObject[];
      readonly label: string;
    };

export function applyOperation(
  document: NotebookDocument,
  operation: DocumentOperation
): NotebookDocument {
  const now = Date.now();
  switch (operation.kind) {
    case "add-object":
      return touch(
        {
          ...document,
          objects: [...document.objects, operation.object],
          pages: operation.object.pageId
            ? document.pages.map((page) =>
                page.id === operation.object.pageId
                  ? {
                      ...page,
                      objectIds: [...page.objectIds, operation.object.id],
                      updatedAt: now
                    }
                  : page
              )
            : document.pages
        },
        now
      );
    case "update-objects":
      return touch(replaceObjects(document, operation.before, operation.after, now), now);
    case "delete-objects": {
      const ids = new Set(operation.objects.map((object) => object.id));
      return touch(
        {
          ...document,
          objects: document.objects.filter((object) => !ids.has(object.id)),
          pages: document.pages.map((page) => ({
            ...page,
            objectIds: page.objectIds.filter((id) => !ids.has(id)),
            updatedAt: now
          }))
        },
        now
      );
    }
    case "add-page":
      return touch({ ...document, pages: [...document.pages, operation.page] }, now);
    case "delete-page": {
      const ids = new Set(operation.objects.map((object) => object.id));
      return touch(
        {
          ...document,
          pages: document.pages.filter((page) => page.id !== operation.page.id),
          objects: document.objects.filter((object) => !ids.has(object.id))
        },
        now
      );
    }
    case "restore-page":
      return touch(
        {
          ...document,
          pages: [...document.pages, operation.page].sort((a, b) => a.index - b.index),
          objects: [...document.objects, ...operation.objects]
        },
        now
      );
  }
}

function replaceObjects(
  document: NotebookDocument,
  before: readonly DocumentObject[],
  after: readonly DocumentObject[],
  now: number
): NotebookDocument {
  const beforeIds = new Set(before.map((object) => object.id));
  const afterIds = new Set(after.map((object) => object.id));
  const replacedIds = new Set([...beforeIds, ...afterIds]);
  const objects = [
    ...document.objects.filter((object) => !replacedIds.has(object.id)),
    ...after
  ];

  const pages = document.pages.map((page) => {
    const additions = after
      .filter((object) => object.pageId === page.id)
      .map((object) => object.id);
    const existing = page.objectIds.filter((id) => !replacedIds.has(id));
    if (!additions.length && existing.length === page.objectIds.length) return page;
    return {
      ...page,
      objectIds: [...existing, ...additions],
      updatedAt: now
    };
  });

  return { ...document, objects, pages };
}

export function invertOperation(operation: DocumentOperation): DocumentOperation {
  switch (operation.kind) {
    case "add-object":
      return {
        kind: "delete-objects",
        objects: [operation.object],
        label: `Annuler ${operation.label}`
      };
    case "delete-objects":
      return {
        kind: "update-objects",
        before: [],
        after: operation.objects,
        label: `Annuler ${operation.label}`
      };
    case "update-objects":
      return {
        kind: "update-objects",
        before: operation.after,
        after: operation.before,
        label: `Annuler ${operation.label}`
      };
    case "add-page":
      return {
        kind: "delete-page",
        page: operation.page,
        objects: [],
        label: `Annuler ${operation.label}`
      };
    case "delete-page":
      return {
        kind: "restore-page",
        page: operation.page,
        objects: operation.objects,
        label: `Annuler ${operation.label}`
      };
    case "restore-page":
      return {
        kind: "delete-page",
        page: operation.page,
        objects: operation.objects,
        label: `Annuler ${operation.label}`
      };
  }
}

function touch(document: NotebookDocument, updatedAt: number): NotebookDocument {
  return { ...document, notebook: { ...document.notebook, updatedAt } };
}

export class TransactionHistory {
  private past: DocumentOperation[] = [];
  private future: DocumentOperation[] = [];
  constructor(private readonly maximum = 1000) {}

  commit(operation: DocumentOperation): void {
    this.past.push(operation);
    if (this.past.length > this.maximum) this.past.shift();
    this.future = [];
  }

  undo(document: NotebookDocument): { document: NotebookDocument; operation?: DocumentOperation } {
    const operation = this.past.pop();
    if (!operation) return { document };
    this.future.push(operation);
    return { document: applyOperation(document, invertOperation(operation)), operation };
  }

  redo(document: NotebookDocument): { document: NotebookDocument; operation?: DocumentOperation } {
    const operation = this.future.pop();
    if (!operation) return { document };
    this.past.push(operation);
    return { document: applyOperation(document, operation), operation };
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }
  get canRedo(): boolean {
    return this.future.length > 0;
  }
}
