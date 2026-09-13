import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { createNotebook, type NotebookDocument } from "@notylo/document-model";
import { createNotezip, readNotezip } from "../src";

describe(".notezip", () => {
  it("preserves the document", async () => {
    const document = createNotebook({ title: "Sauvegarde", mode: "book" });
    const output = await readNotezip(await createNotezip(document, []));
    expect(output.document.notebook.title).toBe("Sauvegarde");
  });

  it("rejects an archive without document.json", async () => {
    const archive = new JSZip();
    archive.file("manifest.json", JSON.stringify({ format: "notylo.notezip", version: 1 }));
    await expect(readNotezip(await archive.generateAsync({ type: "blob" }))).rejects.toThrow(
      /notezip/i
    );
  });

  it("rejects an unsupported archive manifest", async () => {
    const document = createNotebook({ title: "Sauvegarde", mode: "book" });
    const archive = await customArchive(document, { format: "other-format", version: 1 });
    await expect(readNotezip(archive)).rejects.toThrow(/notezip/i);
  });

  it("rejects unsafe asset identifiers before extraction", async () => {
    const base = createNotebook({ title: "Sauvegarde", mode: "book" });
    const document: NotebookDocument = {
      ...base,
      assets: [
        {
          id: "../escape",
          type: "attachment",
          mimeType: "text/plain",
          size: 1,
          hash: "invalid",
          createdAt: Date.now()
        }
      ]
    };
    await expect(readNotezip(await customArchive(document))).rejects.toThrow(/notezip|asset/i);
  });
});

async function customArchive(
  document: NotebookDocument,
  manifest: Record<string, unknown> = { format: "notylo.notezip", version: 1 }
): Promise<Blob> {
  const archive = new JSZip();
  archive.file("manifest.json", JSON.stringify(manifest));
  archive.file(
    "document.json",
    JSON.stringify({ schemaVersion: document.schemaVersion, exportedAt: Date.now(), document })
  );
  return archive.generateAsync({ type: "blob" });
}
