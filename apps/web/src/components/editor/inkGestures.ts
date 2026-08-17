import type { PointerEvent as ReactPointerEvent } from "react";
import type { Point } from "@notylo/canvas-engine";
import type { InkPoint, ShapeObject } from "@notylo/document-model";
import type { newInk } from "../../lib/factories";
import { appendInkPoint } from "../../lib/ink";
import { distance } from "./geometry";

export function toInkPoint(event: ReactPointerEvent, point: Point): InkPoint {
  return {
    x: point.x,
    y: point.y,
    pressure: pointerPressure(event),
    tiltX: event.tiltX,
    tiltY: event.tiltY,
    timestamp: Date.now()
  };
}

export function appendCoalescedInkPoints(
  points: InkPoint[],
  event: ReactPointerEvent<HTMLDivElement>,
  worldAt: (event: Pick<ReactPointerEvent, "clientX" | "clientY">) => Point
): void {
  const sourceEvents = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent];
  for (const source of sourceEvents) {
    const point = worldAt(source);
    appendInkPoint(points, {
      x: point.x,
      y: point.y,
      pressure: pointerPressure(source),
      tiltX: source.tiltX,
      tiltY: source.tiltY,
      timestamp: source.timeStamp
    });
  }
  const point = worldAt(event.nativeEvent);
  appendInkPoint(points, {
    x: point.x,
    y: point.y,
    pressure: pointerPressure(event),
    tiltX: event.tiltX,
    tiltY: event.tiltY,
    timestamp: event.timeStamp
  });
}

/** Mouse events commonly report zero; a pen reporting zero is a real tip lift. */
function pointerPressure(event: Pick<PointerEvent, "pressure" | "pointerType">): number {
  if (event.pointerType !== "pen") return event.pressure || 0.5;
  return Math.min(1, Math.max(0, event.pressure));
}

export function recognizeInkShape(ink: ReturnType<typeof newInk>): ShapeObject | undefined {
  const points = ink.points;
  if (points.length < 5) return undefined;
  const first = points[0]!;
  const last = points.at(-1)!;
  const path = pathLength(points);
  const diagonal = Math.hypot(ink.width, ink.height);
  const direct = distance(first, last);
  const closed = direct <= Math.max(16, diagonal * 0.22) && path > diagonal * 1.45;
  const simplified = simplifyPath(points, Math.max(5, diagonal * 0.045), closed);
  let shape: ShapeObject["shape"] | undefined;
  if (!closed && direct > 24 && direct / Math.max(path, 1) > 0.9) shape = "line";
  if (closed && simplified.length === 3 && triangleQuality(simplified) > 0.18) shape = "triangle";
  if (closed && !shape && isRectangle(simplified)) shape = "rectangle";
  if (closed && !shape && isCircular(points, ink)) shape = "ellipse";
  if (!shape) return undefined;
  return {
    id: ink.id,
    notebookId: ink.notebookId,
    ...(ink.pageId ? { pageId: ink.pageId } : {}),
    type: "shape",
    shape,
    x: ink.x,
    y: ink.y,
    width: Math.max(2, ink.width),
    height: Math.max(2, ink.height),
    rotation: 0,
    zIndex: ink.zIndex,
    opacity: ink.opacity,
    locked: ink.locked,
    hidden: ink.hidden,
    createdAt: ink.createdAt,
    updatedAt: Date.now(),
    fill: "transparent",
    stroke: ink.color,
    strokeWidth: Math.max(1.5, ink.size * 0.65)
  };
}

function pathLength(points: readonly InkPoint[]): number {
  return points
    .slice(1)
    .reduce((total, point, index) => total + distance(points[index]!, point), 0);
}
function simplifyPath(points: readonly InkPoint[], tolerance: number, closed: boolean): Point[] {
  const source = closed ? points.slice(0, -1) : points;
  const reduce = (segment: readonly InkPoint[]): InkPoint[] => {
    if (segment.length < 3) return [...segment];
    const start = segment[0]!;
    const end = segment.at(-1)!;
    let greatest = 0;
    let index = 0;
    for (let pointIndex = 1; pointIndex < segment.length - 1; pointIndex++) {
      const candidate = distanceToSegment(segment[pointIndex]!, start, end);
      if (candidate > greatest) {
        greatest = candidate;
        index = pointIndex;
      }
    }
    return greatest <= tolerance
      ? [start, end]
      : [...reduce(segment.slice(0, index + 1)), ...reduce(segment.slice(index)).slice(1)];
  };
  const reduced = reduce(source);
  return closed ? removeNearDuplicates(reduced) : reduced.map(({ x, y }) => ({ x, y }));
}
function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared
    ? Math.max(
        0,
        Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)
      )
    : 0;
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
}
function removeNearDuplicates(points: readonly Point[]): Point[] {
  return points
    .filter((point, index) => !index || distance(point, points[index - 1]!) > 4)
    .map(({ x, y }) => ({ x, y }));
}
function isCircular(points: readonly InkPoint[], ink: ReturnType<typeof newInk>): boolean {
  if (Math.min(ink.width, ink.height) < 18) return false;
  const center = { x: ink.x + ink.width / 2, y: ink.y + ink.height / 2 };
  const radii = points.map((point) => Math.hypot(point.x - center.x, point.y - center.y));
  const mean = radii.reduce((sum, value) => sum + value, 0) / radii.length;
  const deviation =
    Math.sqrt(radii.reduce((sum, value) => sum + (value - mean) ** 2, 0) / radii.length) / mean;
  const circumference = pathLength(points);
  const ellipsePerimeter =
    Math.PI *
    (3 * (ink.width / 2 + ink.height / 2) -
      Math.sqrt(((3 * ink.width) / 2 + ink.height / 2) * (ink.width / 2 + (3 * ink.height) / 2)));
  return (
    deviation < 0.16 &&
    circumference > ellipsePerimeter * 0.76 &&
    circumference < ellipsePerimeter * 1.34
  );
}
function isRectangle(points: readonly Point[]): boolean {
  if (points.length !== 4) return false;
  const vectors = points.map((point, index) => ({
    x: points[(index + 1) % 4]!.x - point.x,
    y: points[(index + 1) % 4]!.y - point.y
  }));
  if (vectors.some((vector) => Math.hypot(vector.x, vector.y) < 15)) return false;
  return vectors.every((vector, index) => {
    const next = vectors[(index + 1) % 4]!;
    return (
      Math.abs(
        (vector.x * next.x + vector.y * next.y) /
          (Math.hypot(vector.x, vector.y) * Math.hypot(next.x, next.y))
      ) < 0.38
    );
  });
}
function triangleQuality(points: readonly Point[]): number {
  const area =
    Math.abs(
      points.reduce((total, point, index) => {
        const next = points[(index + 1) % points.length]!;
        return total + point.x * next.y - point.y * next.x;
      }, 0)
    ) / 2;
  const bounds =
    Math.max(...points.map((point) => point.x)) - Math.min(...points.map((point) => point.x));
  const height =
    Math.max(...points.map((point) => point.y)) - Math.min(...points.map((point) => point.y));
  return area / Math.max(bounds * height, 1);
}
