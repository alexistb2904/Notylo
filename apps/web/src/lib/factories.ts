import {
  createId,
  type BaseObject,
  type DocumentObject,
  type InkObject,
  type InkDynamics,
  type InkPoint,
  type MathObject,
  type ShapeObject,
  type TableObject,
  type TextObject
} from "@notylo/document-model";
import { t } from "../i18n";

type ObjectBaseInput = Pick<
  BaseObject,
  "notebookId" | "pageId" | "x" | "y" | "width" | "height" | "zIndex"
>;
const common = (input: ObjectBaseInput): Omit<BaseObject, "type"> => {
  const now = Date.now();
  return {
    id: createId(),
    notebookId: input.notebookId,
    ...(input.pageId ? { pageId: input.pageId } : {}),
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    rotation: 0,
    zIndex: input.zIndex,
    opacity: 1,
    locked: false,
    hidden: false,
    createdAt: now,
    updatedAt: now
  };
};

export function newInk(
  input: ObjectBaseInput & {
    points: readonly InkPoint[];
    color: string;
    size: number;
    tool: InkObject["tool"];
    smoothing?: number;
    captureZoom?: number;
    brushId?: string;
    dynamics?: InkDynamics;
  }
): InkObject {
  return {
    ...common(input),
    type: "ink",
    points: input.points,
    color: input.color,
    size: input.size,
    tool: input.tool,
    smoothing: input.smoothing ?? 0.48,
    ...(input.captureZoom !== undefined ? { captureZoom: input.captureZoom } : {}),
    ...(input.brushId ? { brushId: input.brushId } : {}),
    ...(input.dynamics ? { dynamics: input.dynamics } : {})
  };
}
export function newText(input: ObjectBaseInput & { text?: string }): TextObject {
  const text = input.text ?? t("factory.writeHere");
  return {
    ...common(input),
    type: "text",
    html: text,
    plainText: text,
    fontFamily: "Newsreader, serif",
    fontSize: 22,
    color: "#292927",
    align: "left",
    bold: false,
    italic: false,
    underline: false
  };
}
export function newMath(input: ObjectBaseInput & { latex?: string }): MathObject {
  return {
    ...common(input),
    type: "math",
    latex: input.latex ?? "x^2",
    displayMode: true,
    color: "#292927"
  };
}
export function newShape(input: ObjectBaseInput & { shape?: ShapeObject["shape"] }): ShapeObject {
  const shape = input.shape ?? "rectangle";
  return {
    ...common(input),
    type: "shape",
    shape,
    ...(shape === "poly-arrow"
      ? {
          points: [
            { x: 0, y: input.height * 0.72 },
            { x: input.width * 0.3, y: input.height * 0.72 },
            { x: input.width * 0.3, y: input.height * 0.25 },
            { x: input.width, y: input.height * 0.25 }
          ]
        }
      : {}),
    fill: "transparent",
    stroke: "#30302e",
    strokeWidth: 2
  };
}
export function newTable(input: ObjectBaseInput): TableObject {
  return {
    ...common(input),
    type: "table",
    rows: Array.from({ length: 3 }, (_, row) =>
      Array.from({ length: 3 }, () => ({
        id: createId("cell"),
        text: row === 0 ? t("factory.tableHeader") : ""
      }))
    ),
    style: { borderColor: "#b5b5b0", headerBackground: "#eeeeea", textColor: "#30302e" }
  };
}
export function objectBoundsFromPoints(points: readonly InkPoint[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(1, Math.max(...xs) - x),
    height: Math.max(1, Math.max(...ys) - y)
  };
}
export function defaultPosition(count: number): { x: number; y: number } {
  return { x: 86 + (count % 4) * 24, y: 90 + (count % 4) * 24 };
}
export function isRenderableObject(value: DocumentObject): boolean {
  return !value.hidden;
}
