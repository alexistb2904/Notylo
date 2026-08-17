import JSZip from "jszip";
import type { Asset, NotebookDocument, SerializedNotebookExport } from "@notylo/document-model";

export interface NativeAsset {
  readonly metadata: Asset;
  readonly blob: Blob;
}
export interface ImportedNotezip {
  readonly document: NotebookDocument;
  readonly assets: readonly NativeAsset[];
}

export async function createNotezip(
  document: NotebookDocument,
  assets: readonly NativeAsset[]
): Promise<Blob> {
  const archive = new JSZip();
  const manifest: SerializedNotebookExport = {
    schemaVersion: document.schemaVersion,
    exportedAt: Date.now(),
    document
  };
  archive.file("manifest.json", JSON.stringify({ format: "notylo.notezip", version: 1 }, null, 2));
  archive.file("document.json", JSON.stringify(manifest, null, 2));
  for (const asset of assets) archive.file(`assets/${asset.metadata.id}`, asset.blob);
  return archive.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 }
  });
}

export async function readNotezip(file: Blob): Promise<ImportedNotezip> {
  const archive = await JSZip.loadAsync(await file.arrayBuffer());
  const parsed = JSON.parse(
    await archive.file("document.json")!.async("text")
  ) as SerializedNotebookExport;
  if (!parsed.document?.notebook || !Array.isArray(parsed.document.objects))
    throw new Error("Cette archive .notezip est invalide.");
  const assets = await Promise.all(
    parsed.document.assets.map(async (metadata) => {
      const entry = archive.file(`assets/${metadata.id}`);
      if (!entry) throw new Error(`Asset manquant : ${metadata.originalName ?? metadata.id}`);
      return { metadata, blob: await entry.async("blob") };
    })
  );
  return { document: parsed.document, assets };
}
