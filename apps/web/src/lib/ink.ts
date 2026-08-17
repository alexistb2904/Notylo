import type { InkPoint } from "@notylo/document-model";

/**
 * Keeps the full-resolution pointer stream useful without storing repeated
 * browser samples at the same position. The threshold is deliberately far
 * below one screen pixel: it removes noise, not handwriting detail.
 */
export function appendInkPoint(points: InkPoint[], point: InkPoint): void {
  const previous = points.at(-1);
  if (!previous) {
    points.push(point);
    return;
  }

  const movement = Math.hypot(point.x - previous.x, point.y - previous.y);
  const pressureChange = Math.abs(point.pressure - previous.pressure);
  if (movement < 0.02 && pressureChange < 0.01) return;
  points.push(point);
}

/**
 * Produces a compact persisted path after the pen is lifted. It uses a tiny
 * geometric tolerance so corners and pressure changes remain intact while
 * high-frequency, straight-line samples do not bloat the document.
 */
export function compactInkPoints(points: readonly InkPoint[], tolerance = 0.35): InkPoint[] {
  if (points.length <= 2) return [...points];
  const squaredTolerance = tolerance * tolerance;
  const retained: InkPoint[] = [points[0]!];
  let lastRetained = points[0]!;

  // First pass bounds the amount of work for the recursive simplifier while
  // retaining any visible pressure variation.
  for (let index = 1; index < points.length - 1; index++) {
    const point = points[index]!;
    const distanceSquared = (point.x - lastRetained.x) ** 2 + (point.y - lastRetained.y) ** 2;
    if (
      distanceSquared >= squaredTolerance ||
      Math.abs(point.pressure - lastRetained.pressure) >= 0.06
    ) {
      retained.push(point);
      lastRetained = point;
    }
  }
  retained.push(points.at(-1)!);

  const keep = new Uint8Array(retained.length);
  keep[0] = 1;
  keep[retained.length - 1] = 1;
  simplifySegment(retained, 0, retained.length - 1, squaredTolerance, keep);
  return retained.filter((_, index) => keep[index]);
}

function simplifySegment(
  points: readonly InkPoint[],
  startIndex: number,
  endIndex: number,
  squaredTolerance: number,
  keep: Uint8Array
): void {
  if (endIndex - startIndex < 2) return;
  const start = points[startIndex]!;
  const end = points[endIndex]!;
  let greatestDistance = squaredTolerance;
  let greatestIndex = -1;

  for (let index = startIndex + 1; index < endIndex; index++) {
    const point = points[index]!;
    const distance = squaredDistanceToSegment(point, start, end);
    const pressureChanged =
      Math.abs(
        point.pressure -
          (start.pressure +
            (end.pressure - start.pressure) * ((index - startIndex) / (endIndex - startIndex)))
      ) >= 0.08;
    if (distance > greatestDistance || pressureChanged) {
      greatestDistance = distance;
      greatestIndex = index;
    }
  }
  if (greatestIndex < 0) return;
  keep[greatestIndex] = 1;
  simplifySegment(points, startIndex, greatestIndex, squaredTolerance, keep);
  simplifySegment(points, greatestIndex, endIndex, squaredTolerance, keep);
}

function squaredDistanceToSegment(point: InkPoint, start: InkPoint, end: InkPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const position = lengthSquared
    ? Math.max(
        0,
        Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)
      )
    : 0;
  const x = start.x + dx * position;
  const y = start.y + dy * position;
  return (point.x - x) ** 2 + (point.y - y) ** 2;
}
