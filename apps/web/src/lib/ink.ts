import type { InkPoint } from "@notylo/document-model";

/**
 * Capture spacing is expressed in document units but targets a fraction of a
 * physical screen pixel. Zooming out therefore avoids collecting thousands of
 * samples that rasterise onto the same pixel, while high zoom retains detail.
 */
export function captureSpacingForZoom(zoom: number, brushSize: number): number {
  const safeZoom = Math.max(0.05, zoom);
  const screenDriven = 0.24 / safeZoom;
  const brushDriven = Math.max(0.04, brushSize * 0.018);
  return Math.max(0.045, Math.min(5, Math.max(screenDriven, brushDriven)));
}

/**
 * Keeps coalesced pointer input useful without storing browser noise. Pressure
 * and tilt changes can still keep a sample even when the tip barely moved.
 */
export function appendInkPoint(
  points: InkPoint[],
  point: InkPoint,
  minimumDistance = 0.12
): void {
  const previous = points.at(-1);
  if (!previous) {
    points.push(point);
    return;
  }

  const movement = Math.hypot(point.x - previous.x, point.y - previous.y);
  const pressureChange = Math.abs(point.pressure - previous.pressure);
  const tiltChange = Math.hypot(
    (point.tiltX ?? 0) - (previous.tiltX ?? 0),
    (point.tiltY ?? 0) - (previous.tiltY ?? 0)
  );
  if (movement < minimumDistance && pressureChange < 0.015 && tiltChange < 1.5) return;
  points.push(point);
}

/**
 * Compacts a completed stroke with an iterative Ramer-Douglas-Peucker pass.
 * The iterative form avoids deep recursion on very long lecture strokes while
 * pressure and tilt deviations remain first-class reasons to keep a sample.
 */
export function compactInkPoints(points: readonly InkPoint[], tolerance = 0.35): InkPoint[] {
  if (points.length <= 2) return [...points];
  const safeTolerance = Math.max(0.05, tolerance);
  const squaredTolerance = safeTolerance * safeTolerance;
  const retained: InkPoint[] = [points[0]!];
  let lastRetained = points[0]!;

  for (let index = 1; index < points.length - 1; index++) {
    const point = points[index]!;
    const distanceSquared = (point.x - lastRetained.x) ** 2 + (point.y - lastRetained.y) ** 2;
    const pressureChange = Math.abs(point.pressure - lastRetained.pressure);
    const tiltChange = Math.hypot(
      (point.tiltX ?? 0) - (lastRetained.tiltX ?? 0),
      (point.tiltY ?? 0) - (lastRetained.tiltY ?? 0)
    );
    if (distanceSquared >= squaredTolerance || pressureChange >= 0.05 || tiltChange >= 3) {
      retained.push(point);
      lastRetained = point;
    }
  }
  retained.push(points.at(-1)!);

  if (retained.length <= 2) return retained;
  const keep = new Uint8Array(retained.length);
  keep[0] = 1;
  keep[retained.length - 1] = 1;
  const stack: Array<readonly [number, number]> = [[0, retained.length - 1]];

  while (stack.length) {
    const [startIndex, endIndex] = stack.pop()!;
    if (endIndex - startIndex < 2) continue;
    const start = retained[startIndex]!;
    const end = retained[endIndex]!;
    let greatestScore = 1;
    let greatestIndex = -1;

    for (let index = startIndex + 1; index < endIndex; index++) {
      const point = retained[index]!;
      const position = (index - startIndex) / (endIndex - startIndex);
      const geometryScore = squaredDistanceToSegment(point, start, end) / squaredTolerance;
      const expectedPressure = start.pressure + (end.pressure - start.pressure) * position;
      const pressureScore = Math.abs(point.pressure - expectedPressure) / 0.075;
      const expectedTiltX = (start.tiltX ?? 0) + ((end.tiltX ?? 0) - (start.tiltX ?? 0)) * position;
      const expectedTiltY = (start.tiltY ?? 0) + ((end.tiltY ?? 0) - (start.tiltY ?? 0)) * position;
      const tiltScore =
        Math.hypot((point.tiltX ?? 0) - expectedTiltX, (point.tiltY ?? 0) - expectedTiltY) / 5;
      const score = Math.max(geometryScore, pressureScore, tiltScore);
      if (score > greatestScore) {
        greatestScore = score;
        greatestIndex = index;
      }
    }

    if (greatestIndex < 0) continue;
    keep[greatestIndex] = 1;
    stack.push([startIndex, greatestIndex], [greatestIndex, endIndex]);
  }

  return retained.filter((_, index) => keep[index]);
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
