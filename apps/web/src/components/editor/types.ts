import type { Point, Rect } from "@notylo/canvas-engine";
import type { DocumentObject, InkDynamics, InkPoint, ShapeObject } from "@notylo/document-model";

export type Tool =
  | "select"
  | "lasso"
  | "pen"
  | "pencil"
  | "highlighter"
  | "eraser"
  | "text"
  | "shape"
  | "icon"
  | "math"
  | "table"
  | "hand";

export type SidebarPosition = "left" | "right" | "hidden";
export type ResizeHandle = "nw" | "ne" | "se" | "sw";

export interface DraftInk {
  readonly points: InkPoint[];
  readonly tool: "pen" | "pencil" | "highlighter";
  readonly color: string;
  readonly size: number;
  readonly smoothing: number;
  readonly captureZoom: number;
  readonly brushId: string;
  readonly dynamics: InkDynamics;
  readonly recognizeShape?: boolean;
  straightLine?:
    { readonly points: readonly [InkPoint, InkPoint]; readonly startedAt: number } | undefined;
}

export interface StraightenGesture {
  readonly pointerId: number;
  lastMotionPoint: Point;
  timer?: number | undefined;
}

export interface DragState {
  readonly kind:
    | "draw"
    | "draw-icon"
    | "erase"
    | "move"
    | "select"
    | "lasso"
    | "pan"
    | "resize"
    | "arrow-point";
  readonly start: Point;
  readonly originals?: readonly DocumentObject[];
  readonly handle?: ResizeHandle;
  readonly bounds?: Rect;
  readonly arrow?: ShapeObject;
  readonly pointIndex?: number;
}

export interface ViewSize {
  readonly width: number;
  readonly height: number;
}
