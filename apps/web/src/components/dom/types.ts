import type { DocumentObject } from "@notylo/document-model";

export type DOMRenderableObject = Exclude<DocumentObject, { readonly type: "ink" | "shape" }>;
export type DOMObjectUpdate = (
  before: DocumentObject,
  after: DocumentObject,
  label?: string
) => void;
