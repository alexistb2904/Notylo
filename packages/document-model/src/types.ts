export const DOCUMENT_SCHEMA_VERSION = 1 as const;

export type NotebookMode = "book" | "whiteboard";
export type PageSize = "a4" | "a5" | "letter" | "tablet" | "custom";
export type BackgroundKind = "blank" | "ruled" | "grid-5" | "grid-10" | "dots" | "seyes" | "custom";
export type ObjectType =
  | "ink"
  | "text"
  | "math"
  | "image"
  | "pdf"
  | "docx"
  | "table"
  | "spreadsheet"
  | "shape"
  | "group"
  | "calculation";

export interface NotebookSettings {
  readonly autoCalculate: boolean;
  readonly palmRejection: "auto" | "off";
  readonly preferredBackground: BackgroundKind;
  readonly darkPaper: boolean;
  /** Vertical breathing room between pages in notebook mode, in document pixels. */
  readonly pageGap?: number;
  /** Appearance of the infinite surface; only used by whiteboards. */
  readonly whiteboardBackground?: PageBackground;
}

export interface Notebook {
  readonly id: string;
  readonly title: string;
  readonly mode: NotebookMode;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly settings: NotebookSettings;
  readonly schemaVersion: number;
  readonly coverColor: string;
}

/** Metadata used by library views; it intentionally excludes notebook settings and content. */
export type NotebookSummary = Pick<Notebook, "id" | "title" | "mode" | "updatedAt">;

export interface PageBackground {
  readonly kind: BackgroundKind;
  readonly color: string;
  readonly lineColor?: string;
  readonly assetId?: string;
}

export interface Page {
  readonly id: string;
  readonly notebookId: string;
  readonly index: number;
  readonly width: number;
  readonly height: number;
  readonly format: PageSize;
  readonly background: PageBackground;
  readonly objectIds: readonly string[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface Asset {
  readonly id: string;
  readonly type: "image" | "pdf" | "docx" | "spreadsheet" | "attachment";
  readonly mimeType: string;
  readonly size: number;
  readonly hash: string;
  readonly localBlobId?: string;
  readonly remoteUrl?: string;
  readonly originalName?: string;
  readonly createdAt: number;
}

export interface BaseObject {
  readonly id: string;
  readonly notebookId: string;
  readonly pageId?: string;
  readonly type: ObjectType;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly zIndex: number;
  readonly opacity: number;
  readonly locked: boolean;
  readonly hidden: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface InkPoint {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly tiltX?: number;
  readonly tiltY?: number;
  readonly timestamp: number;
}

export interface InkDynamics {
  /** 0 = firm curve, 0.5 = linear, 1 = very sensitive. */
  readonly pressureSensitivity: number;
  readonly pressureAffectsWidth: boolean;
  readonly pressureAffectsOpacity: boolean;
  readonly tiltAffectsAngle: boolean;
}

export interface InkObject extends BaseObject {
  readonly type: "ink";
  readonly points: readonly InkPoint[];
  readonly color: string;
  readonly size: number;
  readonly tool: "pen" | "pencil" | "highlighter";
  readonly smoothing: number;
  /** Zoom at pointer-down. New ink uses it only to reduce streamline lag for precision writing. */
  readonly captureZoom?: number;
  /** Brush preset used by the web renderer. Missing means a legacy tool preset. */
  readonly brushId?: string;
  /** Stored with the stroke so later preference changes do not alter old ink. */
  readonly dynamics?: InkDynamics;
}

export interface TextRun {
  readonly text: string;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly underline?: boolean;
  readonly color?: string;
}

export interface TextObject extends BaseObject {
  readonly type: "text";
  readonly html: string;
  readonly plainText: string;
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly color: string;
  readonly align: "left" | "center" | "right";
  /** Optional for backward compatibility with notebooks created before rich text controls. */
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly underline?: boolean;
}

export interface MathObject extends BaseObject {
  readonly type: "math";
  readonly latex: string;
  readonly displayMode: boolean;
  /** Optional so notebooks created before equation typography remain readable. */
  readonly fontFamily?: string;
  /** Rendered equation size in document pixels. */
  readonly fontSize?: number;
  readonly color: string;
}

export interface ImageObject extends BaseObject {
  readonly type: "image";
  readonly assetId: string;
  readonly crop?: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly alt: string;
}

export interface PdfObject extends BaseObject {
  readonly type: "pdf";
  readonly assetId: string;
  readonly pageNumber: number;
  readonly pageCount: number;
  readonly zoom: number;
}

export interface DocxObject extends BaseObject {
  readonly type: "docx";
  readonly assetId: string;
  readonly html: string;
  readonly plainText: string;
}

export interface TableCell {
  readonly id: string;
  readonly text: string;
  readonly colspan?: number;
  readonly rowspan?: number;
  readonly background?: string;
}

export interface TableObject extends BaseObject {
  readonly type: "table";
  readonly rows: readonly (readonly TableCell[])[];
  readonly style: {
    readonly borderColor: string;
    readonly headerBackground: string;
    readonly textColor: string;
  };
}

export interface SpreadsheetObject extends BaseObject {
  readonly type: "spreadsheet";
  readonly assetId: string;
  readonly sheetName: string;
  readonly cells: Readonly<Record<string, string | number>>;
  readonly columnWidths: Readonly<Record<string, number>>;
  readonly rowHeights: Readonly<Record<string, number>>;
}

export interface ShapeObject extends BaseObject {
  readonly type: "shape";
  readonly shape:
    | "square"
    | "rectangle"
    | "circle"
    | "ellipse"
    | "triangle"
    | "line"
    | "arrow"
    | "double-arrow"
    | "poly-arrow";
  /** Local path nodes, used by a modular arrow. The last node carries the arrow head. */
  readonly points?: readonly { readonly x: number; readonly y: number }[];
  readonly fill: string;
  readonly stroke: string;
  readonly strokeWidth: number;
}

export interface GroupObject extends BaseObject {
  readonly type: "group";
  readonly childIds: readonly string[];
}

export interface CalculationObject extends BaseObject {
  readonly type: "calculation";
  readonly sourceLatex: string;
  readonly resultLatex: string;
  readonly exact: boolean;
  readonly accepted: boolean;
}

export type DocumentObject =
  | InkObject
  | TextObject
  | MathObject
  | ImageObject
  | PdfObject
  | DocxObject
  | TableObject
  | SpreadsheetObject
  | ShapeObject
  | GroupObject
  | CalculationObject;

export interface NotebookDocument {
  readonly schemaVersion: number;
  readonly notebook: Notebook;
  readonly pages: readonly Page[];
  readonly objects: readonly DocumentObject[];
  readonly assets: readonly Asset[];
}

export interface SerializedNotebookExport {
  readonly schemaVersion: number;
  readonly exportedAt: number;
  readonly document: NotebookDocument;
}
