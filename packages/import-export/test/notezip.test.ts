import { describe, expect, it } from "vitest";
import { createNotebook } from "@notylo/document-model";
import { createNotezip, readNotezip } from "../src";

describe(".notezip", () => {
  it("preserves the document", async () => {
    const document = createNotebook({ title: "Sauvegarde", mode: "book" });
    const output = await readNotezip(await createNotezip(document, []));
    expect(output.document.notebook.title).toBe("Sauvegarde");
  });
});
