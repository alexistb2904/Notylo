import type { InkPoint } from "@notylo/document-model";

export type RenderInkPoint = Pick<
  InkPoint,
  "x" | "y" | "pressure" | "tiltX" | "tiltY" | "timestamp"
>;

/**
 * Capture spacing is expressed in document units. At low zoom we avoid storing
 * browser samples that collapse to the same screen pixel; at high zoom we retain
 * enough detail for pressure-sensitive handwriting without tying shape quality to DPR.
 */
export function captureSpacingForZoom(zoom: number, brushSize: number): number {
  const safeZoom = Math.max(0.05, zoom);
  const screenDriven = 0.15 / safeZoom;
  const brushDriven = Math.max(0.03, brushSize * 0.012);
  return Math.max(0.035, Math.min(3, Math.max(screenDriven, brushDriven)));
}

/**
 * Keep meaningful coalesced samples but discard transport noise. Geometry
 * smoothing belongs to the stroke engine; stored points stay close to the device
 * input so erasing, OCR, sync and future renderers are not locked to one filter.
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
 * Sensor-only stabilisation.
 *
 * IMPORTANT: x/y are deliberately never low-pass filtered here. perfect-freehand
 * already owns centre-line streamlining; filtering the position a second time used
 * to create a delayed point that suddenly caught up when speed/direction changed,
 * perceived as a snap or teleport on sharp handwriting turns.
 *
 * Pressure and tilt are independent noisy tablet sensors, so those channels get a
 * small time-based low-pass filter. This follows the same separation used by mature
 * drawing software: trajectory smoothing and sensor smoothing are different jobs.
 */
export function stabilizeInkPoints(
  points: readonly RenderInkPoint[],
  smoothing: number,
  _brushSize: number
): readonly RenderInkPoint[] {
  if (points.length < 2) return points;

  const amount = clamp01(smoothing);
  if (amount <= 0.001) return points;

  const first = points[0]!;
  const result: RenderInkPoint[] = [{ ...first }];
  let previousRaw = first;
  let filteredPressure = clamp01(first.pressure);
  let filteredTiltX = first.tiltX ?? 0;
  let filteredTiltY = first.tiltY ?? 0;

  for (let index = 1; index < points.length; index++) {
    const raw = points[index]!;
    const dt = sampleDeltaSeconds(previousRaw.timestamp, raw.timestamp);
    const pressureAlpha = lowPassAlpha(dt, lerp(42, 12, amount));
    const tiltAlpha = lowPassAlpha(dt, lerp(28, 7, amount));

    filteredPressure = lerp(filteredPressure, clamp01(raw.pressure), pressureAlpha);
    filteredTiltX = lerp(filteredTiltX, raw.tiltX ?? 0, tiltAlpha);
    filteredTiltY = lerp(filteredTiltY, raw.tiltY ?? 0, tiltAlpha);

    result.push({
      x: raw.x,
      y: raw.y,
      pressure: filteredPressure,
      tiltX: filteredTiltX,
      tiltY: filteredTiltY,
      timestamp: raw.timestamp
    });
    previousRaw = raw;
  }

  return result;
}

/**
 * Finalisation must not visibly reshape a stroke after pointer-up. We only remove
 * exact transport duplicates; perfect-freehand receives essentially the same centre
 * line live and committed.
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
