import type { InkPoint } from "@notylo/document-model";

/**
 * Returns whether a freehand stroke is straight enough to safely snap without
 * surprising the writer. Both the travelled distance and the worst sideways
 * drift are checked: a short dash or a curved mark must remain freehand.
 */
export function isApproximatelyStraight(
  points: readonly InkPoint[],
  minimumLength: number
): boolean {
  if (points.length < 2) return false;
  const start = points[0]!;
  const end = points.at(-1)!;
  const directLength = Math.hypot(end.x - start.x, end.y - start.y);
  if (directLength < minimumLength) return false;

  const travelledLength = points
    .slice(1)
    .reduce(
      (total, point, index) =>
        total + Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y),
      0
    );
  // A mostly straight pen stroke should not need more than 12% extra travel.
  if (directLength / Math.max(travelledLength, 1) < 0.88) return false;

  const tolerance = Math.max(minimumLength * 0.2, directLength * 0.09);
  return points.every((point) => distanceToSegment(point, start, end) <= tolerance);
}

function distanceToSegment(point: InkPoint, start: InkPoint, end: InkPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const position = lengthSquared
    ? Math.max(
        0,
        Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)
      )
    : 0;
  return Math.hypot(point.x - (start.x + dx * position), point.y - (start.y + dy * position));
}
