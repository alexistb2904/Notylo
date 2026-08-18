import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createNotebook } from "@notylo/document-model";
import { getDatabase } from "./database";
import { NotebookRepository } from "./repository";

const repository = new NotebookRepository();

describe("offline notebook deletion", () => {
  it("removes the local notebook and queues a durable delete tombstone", async () => {
    const document = createNotebook({ title: "Offline delete", mode: "book" });
    await repository.save(document);

    await repository.remove(document.notebook.id);

    expect(await repository.load(document.notebook.id)).toBeUndefined();
    const queued = await getDatabase().syncQueue.get(`delete:${document.notebook.id}`);
    expect(queued?.type).toBe("delete");
    expect(queued?.notebookId).toBe(document.notebook.id);
    expect((queued?.payload as { deletedAt?: unknown })?.deletedAt).toEqual(expect.any(Number));
  });

  it("does not queue another cloud delete when applying a remote tombstone", async () => {
    const document = createNotebook({ title: "Remote delete", mode: "whiteboard" });
    await repository.save(document);

    await repository.removeLocal(document.notebook.id);

    expect(await repository.load(document.notebook.id)).toBeUndefined();
    expect(await getDatabase().syncQueue.get(`delete:${document.notebook.id}`)).toBeUndefined();
  });

  it("cancels a pending deletion when the same notebook id is explicitly saved again", async () => {
    const document = createNotebook({ title: "Restore", mode: "book" });
    await repository.save(document);
    await repository.remove(document.notebook.id);

    await repository.save({
      ...document,
      notebook: { ...document.notebook, updatedAt: Date.now() + 1 }
    });

    expect(await repository.load(document.notebook.id)).toBeDefined();
    expect(await getDatabase().syncQueue.get(`delete:${document.notebook.id}`)).toBeUndefined();
  });
});
