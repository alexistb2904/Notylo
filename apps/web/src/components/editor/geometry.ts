import type { CSSProperties } from "react";
import type { Point, Rect } from "@notylo/canvas-engine";
import type { NotebookDocument, Page, PageBackground, ShapeObject } from "@notylo/document-model";
import { newShape } from "../../lib/factories";
import type { IconShape } from "./workspaceConstants";
import type { ResizeHandle, ViewSize } from "./types";

export function normalizeRect(start: Point, end: Point): Rect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y)
  };
}

export function iconShapeBetween(
  start: Point,
  end: Point,
  shape: IconShape,
  notebookId: string,
  pageId: string | undefined,
  zIndex: number,
  stroke: string
): ShapeObject {
  const constrained = shape === "square" || shape === "circle";
  const side = Math.max(1, Math.abs(end.x - start.x), Math.abs(end.y - start.y));
  const x = constrained ? (end.x >= start.x ? start.x : start.x - side) : Math.min(start.x, end.x);
  const y = constrained ? (end.y >= start.y ? start.y : start.y - side) : Math.min(start.y, end.y);
  const width = constrained ? side : Math.max(1, Math.abs(end.x - start.x));
  const height = constrained ? side : Math.max(1, Math.abs(end.y - start.y));
  const from = { x: start.x - x, y: start.y - y };
  const to = { x: end.x - x, y: end.y - y };
  const base = newShape({
    notebookId,
    ...(pageId ? { pageId } : {}),
    x,
    y,
    width,
    height,
    zIndex,
    shape
  });
  return {
    ...base,
    stroke,
    ...(shape === "poly-arrow"
      ? {
          points: [
            from,
            { x: from.x + (to.x - from.x) / 3, y: from.y + (to.y - from.y) / 3 },
            { x: from.x + ((to.x - from.x) * 2) / 3, y: from.y + ((to.y - from.y) * 2) / 3 },
            to
          ]
        }
      : {})
  };
}

export function resizeTransform(bounds: Rect, point: Point, handle: ResizeHandle) {
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  const keepsLeft = handle === "ne" || handle === "se";
  const keepsTop = handle === "sw" || handle === "se";
  const nextWidth = Math.max(8, keepsLeft ? point.x - bounds.x : right - point.x);
  const nextHeight = Math.max(8, keepsTop ? point.y - bounds.y : bottom - point.y);
  const scaleX = nextWidth / Math.max(1, bounds.width);
  const scaleY = nextHeight / Math.max(1, bounds.height);
  return {
    scaleX,
    scaleY,
    dx: keepsLeft ? bounds.x - bounds.x * scaleX : right - right * scaleX,
    dy: keepsTop ? bounds.y - bounds.y * scaleY : bottom - bottom * scaleY
  };
}

export function getDocumentOrigin(
  document: NotebookDocument,
  page: NotebookDocument["pages"][number] | undefined,
  size: ViewSize
): Point {
  return document.notebook.mode === "book" && page
    ? {
        x: Math.max(28, (size.width - Math.max(...document.pages.map((item) => item.width))) / 2),
        y: 32
      }
    : { x: size.width / 2, y: size.height / 2 };
}

/** Every notebook page has its own local coordinates; this lays them out vertically. */
export function getBookPageOffsets(
  pages: readonly Page[],
  gap: number
): Readonly<Record<string, number>> {
  let y = 0;
  return Object.fromEntries(
    [...pages]
      .sort((a, b) => a.index - b.index)
      .map((page) => {
        const entry: [string, number] = [page.id, y];
        y += page.height + gap;
        return entry;
      })
  );
}

export function bookHeight(pages: readonly Page[], gap: number): number {
  return pages.reduce((height, page, index) => height + page.height + (index ? gap : 0), 0);
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function whiteboardStyle(background?: PageBackground): CSSProperties {
  const value = background ?? { kind: "dots", color: "#ededeb", lineColor: "#a4a4a133" };
  const line = value.lineColor ?? "#a4a4a1";
  const pattern =
    value.kind === "grid-5"
      ? `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`
      : value.kind === "ruled"
        ? `linear-gradient(to bottom, transparent 31px, ${line} 32px)`
        : value.kind === "dots"
          ? `radial-gradient(${line} 0.7px, transparent 0.7px)`
          : "none";
  return {
    backgroundColor: value.color,
    backgroundImage: pattern,
    backgroundSize: value.kind === "ruled" ? "100% 32px" : "16px 16px"
  };
}
