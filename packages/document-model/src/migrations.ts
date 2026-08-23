import type { NotebookDocument } from "./types";
import { DOCUMENT_SCHEMA_VERSION } from "./types";

type UnknownDocument = Record<string, unknown>;

export function migrateDocument(input: UnknownDocument): NotebookDocument {
  const version = Number(input.schemaVersion ?? 0);
  if (version > DOCUMENT_SCHEMA_VERSION) {
    throw new Error("This notebook was created by a newer version of Notylo.");
  }
  if (version === DOCUMENT_SCHEMA_VERSION) return input as unknown as NotebookDocument;
  throw new Error("This notebook uses the retired ink engine and cannot be opened.");
}
