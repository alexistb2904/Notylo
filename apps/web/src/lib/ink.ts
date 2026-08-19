import type { InkPoint } from "@notylo/document-model";

export type RenderInkPoint = Pick<
  InkPoint,
  "x" | "y" | "pressure" | "tiltX" | "tiltY" | "timestamp"
>;

/**
 * Capture spacing is expressed in document units. At low zoom we avoid storing
 * multiple browser samples that collapse to the same screen pixel; at high zoom
 * we retain enough detail for pressure/tilt-sensitive handwriting.
 */
export function captureSpacingForZoom(zoom: number, brushSize: number): number {
  const safeZoom = Math.max(0.05, zoom);
  const screenDriven = 0.2 / safeZoom;
  const brushDriven = Math.max(0.035, brushSize * 0.015);
  return Math.max(0.04, Math.min(4, Math.max(screenDriven, brushDriven)));
}

/**
 * Keep meaningful coalesced samples but discard exact browser noise. Geometry
 * smoothing belongs to the ink engine; stored points remain device input so
 * erasing, OCR, sync and future renderers are not locked to one visual filter.
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
  if (movement < minimumDistance && pressureChange < 0.012 && tiltChange < 1.25) return;
  points.push(point);
}

/**
 * Causal speed-adaptive low-pass filter inspired by Krita's weighted smoothing:
 * slow motion receives stronger stabilisation, fast handwriting stays responsive.
 * Because each output only depends on past samples, appending a new point never
 * changes already displayed parts of the line.
 */
export function stabilizeInkPoints(
  points: readonly RenderInkPoint[],
  smoothing: number,
  brushSize: number
): readonly RenderInkPoint[] {
  if (points.length < 2 || smoothing <= 0.001) return points;

  const amount = clamp01(smoothing);
  const first = points[0]!;
  const result: RenderInkPoint[] = [{ ...first }];
  let previousRaw = first;
  let previousFiltered: RenderInkPoint = { ...first };
  let velocityX = 0;
  let velocityY = 0;

  for (let index = 1; index < points.length; index++) {
    const raw = points[index]!;
    const dt = sampleDeltaSeconds(previousRaw.timestamp, raw.timestamp);
    const rawVelocityX = (raw.x - previousRaw.x) / dt;
    const rawVelocityY = (raw.y - previousRaw.y) / dt;
    const derivativeAlpha = lowPassAlpha(dt, 1.5);
    velocityX = lerp(velocityX, rawVelocityX, derivativeAlpha);
    velocityY = lerp(velocityY, rawVelocityY, derivativeAlpha);

    const normalizedSpeed = Math.hypot(velocityX, velocityY) / Math.max(1, brushSize);
    const minCutoff = lerp(25, 4.5, amount);
    const beta = lerp(0.35, 0.16, amount);
    const positionAlpha = lowPassAlpha(dt, minCutoff + beta * normalizedSpeed);
    const sensorAlpha = lowPassAlpha(dt, lerp(30, 8, amount) + normalizedSpeed * 0.04);

    const filtered: RenderInkPoint = {
      x: lerp(previousFiltered.x, raw.x, positionAlpha),
      y: lerp(previousFiltered.y, raw.y, positionAlpha),
      pressure: lerp(previousFiltered.pressure, clamp01(raw.pressure), sensorAlpha),
      tiltX: lerp(previousFiltered.tiltX ?? 0, raw.tiltX ?? 0, sensorAlpha),
      tiltY: lerp(previousFiltered.tiltY ?? 0, raw.tiltY ?? 0, sensorAlpha),
      timestamp: raw.timestamp
    };
    result.push(filtered);
    previousRaw = raw;
    previousFiltered = filtered;
  }

  return result;
}

/**
 * Finalisation must not visibly reshape a stroke after pointer-up. The previous
 * RDP pass could remove centre-line points and therefore change perfect-freehand's
 * spline only after release. We now perform storage-only duplicate cleanup with
 * a tiny epsilon; the visible geometry is effectively identical before/after.
 */
export function compactInkPoints(points: readonly InkPoint[], _tolerance = 0.35): InkPoint[] {
  if (points.length <= 1) return [...points];
  const result: InkPoint[] = [{ ...points[0]! }];
  for (let index = 1; index < points.length; index++) {
    const point = points[index]!;
    const previous = result.at(-1)!;
    const movement = Math.hypot(point.x - previous.x, point.y - previous.y);
    const pressureChange = Math.abs(point.pressure - previous.pressure);
    const tiltChange = Math.hypot(
      (point.tiltX ?? 0) - (previous.tiltX ?? 0),
      (point.tiltY ?? 0) - (previous.tiltY ?? 0)
    );
    if (movement < 0.001 && pressureChange < 0.001 && tiltChange < 0.05) continue;
    result.push({ ...point });
  }
  return result;
}

function sampleDeltaSeconds(previous: number, current: number): number {
  const raw = (current - previous) / 1000;
  // Date.now() and DOMHighResTimeStamp have different epochs in one older input
  // path. Treat discontinuities as a 120 Hz sample rather than producing a spike.
  if (!Number.isFinite(raw) || raw <= 0 || raw > 0.05) return 1 / 120;
  return Math.max(1 / 240, Math.min(1 / 30, raw));
}

function lowPassAlpha(dtSeconds: number, cutoffHz: number): number {
  const tau = 1 / (2 * Math.PI * Math.max(0.01, cutoffHz));
  return 1 / (1 + tau / dtSeconds);
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
