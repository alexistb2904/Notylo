import JSZip from "jszip";
import {
  migrateDocument,
  type Asset,
  type DocumentObject,
  type NotebookDocument,
  type SerializedNotebookExport
} from "@notylo/document-model";

export interface NativeAsset {
  readonly metadata: Asset;
  readonly blob: Blob;
}
export interface ImportedNotezip {
  readonly document: NotebookDocument;
  readonly assets: readonly NativeAsset[];
}

const MiB = 1024 * 1024;
const MAX_ARCHIVE_BYTES = 250 * MiB;
const MAX_DOCUMENT_JSON_CHARS = 25 * MiB;
const MAX_ARCHIVE_ENTRIES = 5_000;
const MAX_ASSETS = 2_000;
const MAX_ASSET_BYTES = 100 * MiB;
const MAX_TOTAL_ASSET_BYTES = 750 * MiB;
const MAX_PAGES = 10_000;
const MAX_OBJECTS = 100_000;
const SAFE_ID = /^[A-Za-z0-9._:-]{1,200}$/;
const ASSET_TYPES = new Set(["image", "pdf", "docx", "spreadsheet", "attachment"]);
const OBJECT_TYPES = new Set([
  "ink",
  "text",
  "math",
  "image",
  "pdf",
  "docx",
  "table",
  "spreadsheet",
  "shape",
  "group",
  "calculation"
]);

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
  if (file.size > MAX_ARCHIVE_BYTES) invalidArchive("Archive .notezip trop volumineuse.");

  let archive: JSZip;
  try {
    archive = await JSZip.loadAsync(await file.arrayBuffer());
  } catch {
    invalidArchive();
  }

  const entries = Object.values(archive.files);
  if (entries.length > MAX_ARCHIVE_ENTRIES) invalidArchive("Archive .notezip trop complexe.");
  for (const entry of entries) {
    if (!isSafeArchivePath(entry.name)) invalidArchive("Chemin invalide dans l’archive .notezip.");
  }

  const manifestEntry = archive.file("manifest.json");
  const documentEntry = archive.file("document.json");
  if (!manifestEntry || !documentEntry) invalidArchive();

  const manifest = parseRecord(await manifestEntry.async("text"));
  if (manifest.format !== "notylo.notezip" || manifest.version !== 1) invalidArchive();

  const documentJson = await documentEntry.async("text");
  if (documentJson.length > MAX_DOCUMENT_JSON_CHARS)
    invalidArchive("Document .notezip trop volumineux.");

  const parsed = parseSerializedExport(documentJson);
  const document = validateDocument(parsed.document);
  if (parsed.schemaVersion !== document.schemaVersion) invalidArchive();

  const assetIds = new Set<string>();
  let declaredAssetBytes = 0;
  for (const metadata of document.assets) {
    validateAsset(metadata);
    if (assetIds.has(metadata.id)) invalidArchive("Identifiant d’asset dupliqué.");
    assetIds.add(metadata.id);
    if (metadata.size > MAX_ASSET_BYTES) invalidArchive("Pièce jointe .notezip trop volumineuse.");
    declaredAssetBytes += metadata.size;
    if (declaredAssetBytes > MAX_TOTAL_ASSET_BYTES)
      invalidArchive("Volume total des pièces jointes trop élevé.");
  }
  if (document.assets.length > MAX_ASSETS) invalidArchive("Trop de pièces jointes dans l’archive.");

  validateAssetReferences(document.objects, assetIds);

  const allowedFiles = new Set([
    "manifest.json",
    "document.json",
    ...document.assets.map((asset) => `assets/${asset.id}`)
  ]);
  for (const entry of entries) {
    if (!entry.dir && !allowedFiles.has(entry.name)) invalidArchive("Fichier inattendu dans l’archive .notezip.");
  }

  const assets = await Promise.all(
    document.assets.map(async (metadata) => {
      const entry = archive.file(`assets/${metadata.id}`);
      if (!entry) throw new Error(`Asset manquant : ${metadata.originalName ?? metadata.id}`);
      const blob = await entry.async("blob");
      if (blob.size > MAX_ASSET_BYTES || blob.size !== metadata.size)
        invalidArchive("Taille de pièce jointe incohérente dans l’archive .notezip.");
      return { metadata, blob };
    })
  );

  return { document, assets };
}

function parseSerializedExport(value: string): SerializedNotebookExport {
  const parsed = parseRecord(value);
  if (!isFiniteNumber(parsed.schemaVersion) || !isFiniteNumber(parsed.exportedAt) || !isRecord(parsed.document))
    invalidArchive();
  return parsed as unknown as SerializedNotebookExport;
}

function validateDocument(value: NotebookDocument): NotebookDocument {
  if (!isRecord(value)) invalidArchive();
  if (!isFiniteNumber(value.schemaVersion) || !isRecord(value.notebook)) invalidArchive();
  if (!Array.isArray(value.pages) || !Array.isArray(value.objects) || !Array.isArray(value.assets))
    invalidArchive();
  if (value.pages.length > MAX_PAGES || value.objects.length > MAX_OBJECTS) invalidArchive("Document .notezip trop complexe.");

  const notebook = value.notebook;
  if (
    !isSafeId(notebook.id) ||
    typeof notebook.title !== "string" ||
    !["book", "whiteboard"].includes(notebook.mode) ||
    !isFiniteNumber(notebook.createdAt) ||
    !isFiniteNumber(notebook.updatedAt) ||
    !isRecord(notebook.settings)
  )
    invalidArchive();

  const pageIds = new Set<string>();
  for (const page of value.pages) {
    if (
      !isRecord(page) ||
      !isSafeId(page.id) ||
      page.notebookId !== notebook.id ||
      !isFiniteNumber(page.index) ||
      !isFiniteNumber(page.width) ||
      !isFiniteNumber(page.height) ||
      !Array.isArray(page.objectIds)
    )
      invalidArchive();
    if (pageIds.has(page.id)) invalidArchive("Identifiant de page dupliqué.");
    pageIds.add(page.id);
  }

  const objectIds = new Set<string>();
  for (const object of value.objects) {
    validateObject(object, notebook.id, pageIds);
    if (objectIds.has(object.id)) invalidArchive("Identifiant d’objet dupliqué.");
    objectIds.add(object.id);
  }

  try {
    return migrateDocument(value as unknown as Record<string, unknown>);
  } catch (error) {
    throw error instanceof Error ? error : new Error("Cette archive .notezip est invalide.");
  }
}

function validateObject(object: DocumentObject, notebookId: string, pageIds: ReadonlySet<string>): void {
  if (!isRecord(object)) invalidArchive();
  if (
    !isSafeId(object.id) ||
    object.notebookId !== notebookId ||
    !OBJECT_TYPES.has(object.type) ||
    !isFiniteNumber(object.x) ||
    !isFiniteNumber(object.y) ||
    !isFiniteNumber(object.width) ||
    !isFiniteNumber(object.height) ||
    object.width < 0 ||
    object.height < 0 ||
    !isFiniteNumber(object.rotation) ||
    !isFiniteNumber(object.zIndex) ||
    !isFiniteNumber(object.opacity) ||
    typeof object.locked !== "boolean" ||
    typeof object.hidden !== "boolean" ||
    !isFiniteNumber(object.createdAt) ||
    !isFiniteNumber(object.updatedAt)
  )
    invalidArchive();
  if (object.pageId !== undefined && (!isSafeId(object.pageId) || !pageIds.has(object.pageId)))
    invalidArchive("Objet rattaché à une page inconnue.");

  switch (object.type) {
    case "ink":
      if (!Array.isArray(object.points) || typeof object.color !== "string" || !isFiniteNumber(object.size) || !isRecord(object.brush))
        invalidArchive();
      break;
    case "text":
      if (
        typeof object.html !== "string" ||
        typeof object.plainText !== "string" ||
        typeof object.fontFamily !== "string" ||
        !isFiniteNumber(object.fontSize) ||
        typeof object.color !== "string"
      )
        invalidArchive();
      break;
    case "math":
      if (typeof object.latex !== "string" || typeof object.displayMode !== "boolean" || typeof object.color !== "string")
        invalidArchive();
      break;
    case "image":
      if (!isSafeId(object.assetId) || typeof object.alt !== "string") invalidArchive();
      break;
    case "pdf":
      if (!isSafeId(object.assetId) || !isFiniteNumber(object.pageNumber) || !isFiniteNumber(object.pageCount)) invalidArchive();
      break;
    case "docx":
      if (!isSafeId(object.assetId) || typeof object.html !== "string" || typeof object.plainText !== "string") invalidArchive();
      break;
    case "table":
      if (!Array.isArray(object.rows) || !isRecord(object.style)) invalidArchive();
      break;
    case "spreadsheet":
      if (!isSafeId(object.assetId) || typeof object.sheetName !== "string" || !isRecord(object.cells)) invalidArchive();
      break;
    case "shape":
      if (typeof object.shape !== "string" || typeof object.fill !== "string" || typeof object.stroke !== "string" || !isFiniteNumber(object.strokeWidth))
        invalidArchive();
      break;
    case "group":
      if (!Array.isArray(object.childIds) || !object.childIds.every((id) => typeof id === "string")) invalidArchive();
      break;
    case "calculation":
      if (
        typeof object.sourceLatex !== "string" ||
        typeof object.resultLatex !== "string" ||
        typeof object.exact !== "boolean" ||
        typeof object.accepted !== "boolean"
      )
        invalidArchive();
      break;
  }
}

function validateAsset(asset: Asset): void {
  if (
    !isRecord(asset) ||
    !isSafeId(asset.id) ||
    !ASSET_TYPES.has(asset.type) ||
    typeof asset.mimeType !== "string" ||
    !isFiniteNumber(asset.size) ||
    asset.size < 0 ||
    typeof asset.hash !== "string" ||
    !isFiniteNumber(asset.createdAt)
  )
    invalidArchive();
}

function validateAssetReferences(objects: readonly DocumentObject[], assetIds: ReadonlySet<string>): void {
  for (const object of objects) {
    if (
      (object.type === "image" || object.type === "pdf" || object.type === "docx" || object.type === "spreadsheet") &&
      !assetIds.has(object.assetId)
    )
      invalidArchive("Objet rattaché à une pièce jointe inconnue.");
  }
}

function parseRecord(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed)) invalidArchive();
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Cette archive")) throw error;
    invalidArchive();
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isSafeId(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID.test(value) && value !== "." && value !== "..";
}

function isSafeArchivePath(value: string): boolean {
  if (!value || value.startsWith("/") || value.includes("\\") || value.includes("\0")) return false;
  return !value.split("/").some((segment) => segment === ".." || segment === ".");
}

function invalidArchive(message = "Cette archive .notezip est invalide."): never {
  throw new Error(message);
}
