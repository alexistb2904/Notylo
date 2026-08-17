import type { MutableRefObject } from "react";
import type { DocumentObject, NotebookDocument } from "@notylo/document-model";
import { NotebookRepository } from "@notylo/persistence";

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
  add: (object: DocumentObject) => void
): Promise<void> {
  if (!selected.some((object) => object.type === "image")) {
    alert("Sélectionnez une image ou une écriture avant de lancer l’OCR.");
    return;
  }
  alert(
    "La sélection d’une zone OCR et le résultat seront proposés dans la prochaine itération de l’éditeur."
  );
  void add;
}
