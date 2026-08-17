import type {
  Notebook,
  NotebookDocument,
  NotebookMode,
  Page,
  PageBackground,
  PageSize
} from "./types";
import { DOCUMENT_SCHEMA_VERSION } from "./types";

export const DEFAULT_BACKGROUND: PageBackground = {
  kind: "grid-5",
  color: "#ffffff",
  lineColor: "#dedede"
};

export const PAGE_DIMENSIONS: Readonly<
  Record<Exclude<PageSize, "custom">, readonly [number, number]>
> = {
  a4: [794, 1123],
  a5: [559, 794],
  letter: [816, 1056],
  tablet: [1024, 1365]
};

export function createId(prefix = "obj"): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function createNotebook(input: {
  title: string;
  mode: NotebookMode;
  background?: PageBackground;
  format?: Exclude<PageSize, "custom">;
  coverColor?: string;
  now?: number;
}): NotebookDocument {
  const now = input.now ?? Date.now();
  const notebookId = createId("nb");
  const notebook: Notebook = {
    id: notebookId,
    title: input.title.trim() || "Sans titre",
    mode: input.mode,
    createdAt: now,
    updatedAt: now,
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    coverColor: input.coverColor ?? "#222222",
    settings: {
      autoCalculate: false,
      palmRejection: "auto",
      preferredBackground: input.background?.kind ?? DEFAULT_BACKGROUND.kind,
      darkPaper: false,
      pageGap: 48,
      whiteboardBackground: { kind: "dots", color: "#eeeeee", lineColor: "#0000001a" }
    }
  };
  const page =
    input.mode === "book"
      ? createPage(notebookId, 0, input.format ?? "a4", input.background, now)
      : undefined;
  return {
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    notebook,
    pages: page ? [page] : [],
    objects: [],
    assets: []
  };
}

export function createPage(
  notebookId: string,
  index: number,
  format: Exclude<PageSize, "custom"> = "a4",
  background: PageBackground = DEFAULT_BACKGROUND,
  now = Date.now()
): Page {
  const [width, height] = PAGE_DIMENSIONS[format];
  return {
    id: createId("page"),
    notebookId,
    index,
    width,
    height,
    format,
    background,
    objectIds: [],
    createdAt: now,
    updatedAt: now
  };
}
