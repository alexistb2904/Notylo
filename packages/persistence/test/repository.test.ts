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
});
