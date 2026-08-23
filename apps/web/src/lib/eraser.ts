import type { Point, Rect } from "@notylo/canvas-engine";
import type { DocumentObject, InkObject, InkPoint } from "@notylo/document-model";
import { compactInkPoints } from "./ink";

export type EraserMode = "object" | "precision";

export interface EraserResult {
  readonly before: readonly DocumentObject[];
  readonly after: readonly DocumentObject[];
}

/**
 * Builds one reversible replacement operation for an entire eraser gesture.
 * `source` is the immutable surface state captured at pointer-down. Rebuilding
 * from that source on every preview prevents cumulative floating-point cuts and
 * keeps the whole held gesture as one undoable operation.
 */
export function eraseObjects(
  source: readonly DocumentObject[],
  path: readonly Point[],
  diameter: number,
  mode: EraserMode
): EraserResult {
  if (!path.length) return { before: [], after: [] };
  const radius = Math.max(1, diameter / 2);
  const gestureBounds = eraserGestureBounds(path, diameter, 24);
  const before: DocumentObject[] = [];
  const after: DocumentObject[] = [];

  for (const object of source) {
    if (object.hidden || object.locked || !rectsIntersect(objectBounds(object), gestureBounds)) continue;
    const localPath = pathNearRect(
      path,
      expandRect(objectBounds(object), radius + (object.type === "ink" ? object.size : 0))
    );
    if (!localPath.length) continue;

    if (mode === "object") {
      if (objectIntersectsEraser(object, localPath, radius)) before.push(object);
      continue;
    }

    if (object.type !== "ink") continue;
    const fragments = eraseInkStroke(object, localPath, radius);
    if (fragments.length === 1 && fragments[0] === object) continue;
    before.push(object);
    after.push(...fragments);
  }

  return { before, after };
}

/** Bounding box suitable for querying a spatial index for one held gesture. */
export function eraserGestureBounds(
  path: readonly Point[],
  diameter: number,
  extraPadding = 64
): Rect {
  if (!path.length) return { x: 0, y: 0, width: 0, height: 0 };
  return boundsForPath(path, Math.max(1, diameter / 2) + Math.max(0, extraPadding));
}

/** Splits one ink object into the portions that remain outside the eraser. */
export function eraseInkStroke(
  ink: InkObject,
  eraserPath: readonly Point[],
  radius: number
): readonly InkObject[] {
  if (!ink.points.length || !eraserPath.length) return [ink];
  const samples = localizedInkSamples(ink, eraserPath, Math.max(1, radius));
  if (!samples.length) return [ink];

  const erased = samples.map((point) =>
    distanceToPolyline(point, eraserPath) <= radius + inkHalfWidth(ink, point)
  );
  if (!erased.some(Boolean)) return [ink];
  if (erased.every(Boolean)) return [];

  const runs: InkPoint[][] = [];
  let current: InkPoint[] = [];
  for (let index = 0; index < samples.length; index++) {
    if (!erased[index]) {
      current.push(samples[index]!);
      continue;
    }
    if (current.length) {
      runs.push(current);
      current = [];
    }
  }
  if (current.length) runs.push(current);

  const tolerance = Math.max(0.16, Math.min(0.5, ink.size * 0.055));
  return runs
    .map((run) => compactInkPoints(run, tolerance))
    .filter((run) => run.length >= 2 || (run.length === 1 && ink.points.length === 1))
    .map((run, index) => fragmentInk(ink, run, index));
}

function localizedInkSamples(
  ink: InkObject,
  eraserPath: readonly Point[],
  radius: number
): InkPoint[] {
  if (ink.points.length <= 1) return [...ink.points];
  const result: InkPoint[] = [{ ...ink.points[0]! }];
  const preferredSpacing = Math.max(0.55, Math.min(2.4, radius * 0.18));
  const gestureBounds = boundsForPath(eraserPath, radius + ink.size);

  for (let index = 1; index < ink.points.length; index++) {
    const start = ink.points[index - 1]!;
    const end = ink.points[index]!;
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    if (length < 1e-9) {
      appendDistinct(result, end);
      continue;
    }

    const segmentRect = expandRect(segmentBounds(start, end), radius + ink.size);
    if (!rectsIntersect(segmentRect, gestureBounds)) {
      appendDistinct(result, end);
      continue;
    }
    const localPath = pathNearRect(eraserPath, segmentRect);
    if (!localPath.length) {
      appendDistinct(result, end);
      continue;
    }

    let minimumT = 1;
    let maximumT = 0;
    for (const point of localPath) {
      const projection = projectParameter(point, start, end);
      minimumT = Math.min(minimumT, projection);
      maximumT = Math.max(maximumT, projection);
    }
    const margin =
      (radius + Math.max(inkHalfWidth(ink, start), inkHalfWidth(ink, end))) / length;
    const fromT = Math.max(0, minimumT - margin);
    const toT = Math.min(1, maximumT + margin);
    if (toT <= fromT) {
      appendDistinct(result, end);
      continue;
    }

    if (fromT > 0) appendDistinct(result, interpolateInkPoint(start, end, fromT));
    const localLength = length * (toT - fromT);
    const steps = Math.max(1, Math.min(96, Math.ceil(localLength / preferredSpacing)));
    for (let step = 1; step < steps; step++) {
      const t = fromT + ((toT - fromT) * step) / steps;
      appendDistinct(result, interpolateInkPoint(start, end, t));
    }
    appendDistinct(result, interpolateInkPoint(start, end, toT));
    if (toT < 1) appendDistinct(result, end);
  }
  return result;
}

function fragmentInk(ink: InkObject, points: readonly InkPoint[], index: number): InkObject {
  const bounds = pointsBounds(points);
  return {
    ...ink,
    // Fragment zero keeps the original identity. Siblings include the source
    // stroke version, preventing collisions when the same stroke is cut again
    // in a later gesture while remaining stable throughout the current preview.
    id: index === 0 ? ink.id : `${ink.id}_cut_${ink.updatedAt}_${index}`,
    points,
    ...bounds,
    updatedAt: Date.now()
  };
}

function objectIntersectsEraser(
  object: DocumentObject,
  path: readonly Point[],
  radius: number
): boolean {
  if (object.type === "ink") {
    return localizedInkSamples(object, path, radius).some(
      (point) => distanceToPolyline(point, path) <= radius + inkHalfWidth(object, point)
    );
  }
  const rect = expandRect(objectBounds(object), radius);
  if (path.some((point) => pointInRect(point, rect))) return true;
  for (let index = 1; index < path.length; index++) {
    if (segmentIntersectsRect(path[index - 1]!, path[index]!, rect)) return true;
  }
  return false;
}

function inkHalfWidth(ink: InkObject, point: Pick<InkPoint, "pressure">): number {
  const dynamics = ink.brush.dynamics;
  if (!dynamics.pressureAffectsWidth) return ink.size / 2;
  const pressure = pressureCurve(point.pressure, dynamics.pressureSensitivity);
  return (ink.size * (0.2 + pressure * 0.8)) / 2;
}
function pressureCurve(pressure: number, sensitivity: number): number {
  const input = Math.min(1, Math.max(0, pressure));
  const setting = Math.min(1, Math.max(0, sensitivity));
  return Math.pow(input, Math.pow(2, 1 - setting * 2));
}

export function appendEraserPoint(path: Point[], point: Point, diameter: number): void {
  const previous = path.at(-1);
  const minimum = Math.max(0.6, Math.min(4, diameter * 0.12));
  if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) >= minimum)
    path.push(point);
}

export function distanceToPolyline(point: Point, path: readonly Point[]): number {
  if (!path.length) return Number.POSITIVE_INFINITY;
  if (path.length === 1) return Math.hypot(point.x - path[0]!.x, point.y - path[0]!.y);
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 1; index < path.length; index++)
    minimum = Math.min(minimum, distanceToSegment(point, path[index - 1]!, path[index]!));
  return minimum;
}

function pathNearRect(path: readonly Point[], rect: Rect): Point[] {
  if (!path.length) return [];
  if (path.length === 1) return pointInRect(path[0]!, rect) ? [{ ...path[0]! }] : [];
  let first = -1;
  let last = -1;
  for (let index = 1; index < path.length; index++) {
    const start = path[index - 1]!;
    const end = path[index]!;
    if (!rectsIntersect(segmentBounds(start, end), rect)) continue;
    if (first < 0) first = index - 1;
    last = index;
  }
  if (first < 0 || last < 0) return [];
  return path.slice(first, last + 1).map((point) => ({ ...point }));
}

function projectParameter(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return 0;
  return Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)
  );
}
function distanceToSegment(point: Point, start: Point, end: Point): number {
  const t = projectParameter(point, start, end);
  return Math.hypot(
    point.x - (start.x + (end.x - start.x) * t),
    point.y - (start.y + (end.y - start.y) * t)
  );
}
function appendDistinct(points: InkPoint[], point: InkPoint): void {
  const previous = points.at(-1);
  if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) > 1e-6)
    points.push(point);
}
function interpolateInkPoint(start: InkPoint, end: InkPoint, ratio: number): InkPoint {
  const mix = (a: number | undefined, b: number | undefined) =>
    (a ?? 0) + ((b ?? 0) - (a ?? 0)) * ratio;
  return {
    x: mix(start.x, end.x),
    y: mix(start.y, end.y),
    pressure: mix(start.pressure, end.pressure),
    tiltX: mix(start.tiltX, end.tiltX),
    tiltY: mix(start.tiltY, end.tiltY),
    timestamp: mix(start.timestamp, end.timestamp)
  };
}
function pointsBounds(points: readonly Point[]): Rect {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    left = Math.min(left, point.x);
    top = Math.min(top, point.y);
    right = Math.max(right, point.x);
    bottom = Math.max(bottom, point.y);
  }
  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top)
  };
}
function segmentBounds(start: Point, end: Point): Rect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.max(0.001, Math.abs(end.x - start.x)),
    height: Math.max(0.001, Math.abs(end.y - start.y))
  };
}
function boundsForPath(path: readonly Point[], padding: number): Rect {
  return expandRect(pointsBounds(path), padding);
}
function objectBounds(object: DocumentObject): Rect {
  return { x: object.x, y: object.y, width: object.width, height: object.height };
}
function expandRect(rect: Rect, amount: number): Rect {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2
  };
}
function rectsIntersect(a: Rect, b: Rect): boolean {
  return (
    a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y
  );
}
function pointInRect(point: Point, rect: Rect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}
function segmentIntersectsRect(start: Point, end: Point, rect: Rect): boolean {
  if (pointInRect(start, rect) || pointInRect(end, rect)) return true;
  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height }
  ];
  for (let index = 0; index < 4; index++) {
    if (segmentsIntersect(start, end, corners[index]!, corners[(index + 1) % 4]!)) return true;
  }
  return false;
}
function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const cross = (p: Point, q: Point, r: Point) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  return (
    ((abC <= 0 && abD >= 0) || (abC >= 0 && abD <= 0)) &&
    ((cdA <= 0 && cdB >= 0) || (cdA >= 0 && cdB <= 0))
  );
}
