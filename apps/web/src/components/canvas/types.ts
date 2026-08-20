import type { Camera, Point, Rect } from "@notylo/canvas-engine";
import type {
  DocumentObject,
  InkDynamics,
  InkPoint,
  NotebookDocument,
  ShapeObject,
  Transform
} from "@notylo/document-model";
import type { MutableRefObject } from "react";

export interface CanvasDraftInk {
  readonly points: readonly InkPoint[];
  readonly tool: "pen" | "pencil" | "highlighter";
  readonly color: string;
  readonly size: number;
  readonly smoothing: number;
  readonly captureZoom: number;
  readonly brushId: string;
  readonly dynamics: InkDynamics;
  readonly straightLine?:
    { readonly points: readonly InkPoint[]; readonly startedAt: number } | undefined;
}

export interface CanvasLayerProps {
  readonly documentRef: MutableRefObject<NotebookDocument>;
  readonly activePageId?: string | undefined;
  readonly pageOffsets?: Readonly<Record<string, number>> | undefined;
  readonly documentMode: "book" | "whiteboard";
  readonly origin: Point;
  readonly cameraRef: MutableRefObject<Camera>;
  readonly draftRef: MutableRefObject<CanvasDraftInk | undefined>;
  readonly shapeDraftRef: MutableRefObject<ShapeObject | undefined>;
  readonly selection: readonly DocumentObject[];
  readonly selectionTransform?: Transform | undefined;
  readonly selectionRect?: Rect | undefined;
  readonly lasso: readonly Point[];
  readonly dragOffset: Point;
  /** Keeps the canvas awake while refs are mutated by an active pen gesture. */
  readonly renderContinuously: boolean;
}
