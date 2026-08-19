import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { createNotebook } from "@notylo/document-model";
import { getDatabase, NotebookRepository } from "../src";

describe("NotebookRepository", () => {
  beforeEach(async () => {
    await getDatabase().delete();
    await getDatabase().open();
  });
  it("round-trips a local notebook", async () => {
    const repository = new NotebookRepository();
    const document = createNotebook({ title: "Physique", mode: "book" });
    await repository.save(document);
    expect((await repository.load(document.notebook.id))?.notebook.title).toBe("Physique");
  });

  it("keeps notebooks isolated between account scopes", async () => {
    const anonymous = new NotebookRepository();
    const accountA = new NotebookRepository("account-a");
    const accountB = new NotebookRepository("account-b");
    const legacy = createNotebook({ title: "Legacy", mode: "book" });
    await anonymous.save(legacy);
    await accountA.claimAnonymous("account-a");

    expect(await accountA.load(legacy.notebook.id)).toBeDefined();
    expect(await accountB.load(legacy.notebook.id)).toBeUndefined();
    expect((await accountB.list()).map((item) => item.id)).not.toContain(legacy.notebook.id);

    const privateDocument = createNotebook({ title: "Privé A", mode: "whiteboard" });
    await accountA.save(privateDocument);
    expect(await accountB.load(privateDocument.notebook.id)).toBeUndefined();
    await expect(accountB.save(privateDocument)).rejects.toThrow("autre espace");
  });
});
