import type { MutableRefObject } from "react";
import type { DocumentObject, NotebookDocument } from "@notylo/document-model";
import { NotebookRepository } from "@notylo/persistence";
import { newMath, newText } from "../../lib/factories";
import { mathOcrToLatex, recognizeImage, renderOcrSelection, type OcrMode } from "../../lib/ocr";

const repository = new NotebookRepository();

export function documentRefCount(ref: MutableRefObject<NotebookDocument>): number {
  return ref.current.objects.length;
}
export async function sha256(file: Blob): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
export async function attachToDocument(
  onReplace: (updater: (current: NotebookDocument) => NotebookDocument) => void,
  metadata: Parameters<NotebookRepository["attach"]>[0],
  file: File
) {
  const asset = await repository.attach(metadata, file);
  onReplace((document) =>
    document.assets.some((existing) => existing.id === asset.id)
      ? document
      : { ...document, assets: [...document.assets, asset] }
  );
  return asset;
}
export async function recognizeSelected(
  selected: readonly DocumentObject[],
  add: (object: DocumentObject) => void,
  mode: OcrMode
): Promise<number> {
  return recognizeSelectedInternal(selected, add, mode);
}

async function recognizeSelectedInternal(
  selected: readonly DocumentObject[],
  add: (object: DocumentObject) => void,
  mode: OcrMode
): Promise<number> {
  const source = selected.find((object) => object.type === "image" || object.type === "ink");
  if (!source) throw new Error("Sélectionnez une image ou une écriture manuscrite.");

  const result = await recognizeImage(await renderOcrSelection(selected), mode);
  const recognized = mode === "math" ? mathOcrToLatex(result.text) : result.text;
  if (!recognized) throw new Error("Aucun texte lisible n’a été trouvé dans la sélection.");

  const base = {
    notebookId: source.notebookId,
    ...(source.pageId ? { pageId: source.pageId } : {}),
    x: source.x,
    y: source.y + source.height + 20,
    width: Math.max(240, source.width),
    height: mode === "math" ? 86 : 120,
    zIndex: Math.max(...selected.map((object) => object.zIndex), 0) + 1
  };
  add(
    mode === "math"
      ? newMath({ ...base, latex: recognized })
      : newText({ ...base, text: recognized })
  );
  return result.confidence;
}
