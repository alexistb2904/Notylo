import type { InkPoint } from "@notylo/document-model";

export function captureSpacingForZoom(zoom: number, brushSize: number): number {
  const safeZoom = Math.max(0.05, zoom);
  return Math.max(0.035, Math.min(2, Math.max(0.14 / safeZoom, brushSize * 0.01)));
}

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
  const sensorChange =
    Math.abs(point.pressure - previous.pressure) +
    Math.hypot((point.tiltX ?? 0) - (previous.tiltX ?? 0), (point.tiltY ?? 0) - (previous.tiltY ?? 0)) / 80;
  if (movement >= minimumDistance || sensorChange >= 0.012) points.push(point);
}

export interface InkStabilizer {
  push(point: InkPoint): InkPoint;
}

/**
 * Causal, speed-adaptive handwriting stabilizer.
 * Slow motion gets stronger noise rejection; fast strokes stay close to the nib.
 * Filtering happens once during capture, so live and committed geometry cannot diverge.
 */
export function createInkStabilizer(amount: number): InkStabilizer {
  const strength = clamp01(amount);
  let previousRaw: InkPoint | undefined;
  let filtered: InkPoint | undefined;
  let velocityX = 0;
  let velocityY = 0;

  return {
    push(point) {
      if (!previousRaw || !filtered || strength <= 0.001) {
        previousRaw = point;
        filtered = { ...point };
        return filtered;
      }

      const dt = sampleDeltaSeconds(previousRaw.timestamp, point.timestamp);
      const rawVelocityX = (point.x - previousRaw.x) / dt;
      const rawVelocityY = (point.y - previousRaw.y) / dt;
      const velocityAlpha = 0.28 + (1 - strength) * 0.34;
      velocityX = mix(velocityX, rawVelocityX, velocityAlpha);
      velocityY = mix(velocityY, rawVelocityY, velocityAlpha);
      const speed = Math.hypot(velocityX, velocityY);

      const quietAlpha = mix(0.84, 0.24, strength);
      const speedResponse = Math.min(0.68, speed / 1_250) * strength;
      const positionAlpha = clamp(quietAlpha + speedResponse, 0.2, 1);
      const sensorAlpha = mix(0.72, 0.3, strength);
      filtered = {
        x: mix(filtered.x, point.x, positionAlpha),
        y: mix(filtered.y, point.y, positionAlpha),
        pressure: mix(filtered.pressure, clamp01(point.pressure), sensorAlpha),
        tiltX: mix(filtered.tiltX ?? 0, point.tiltX ?? 0, sensorAlpha),
        tiltY: mix(filtered.tiltY ?? 0, point.tiltY ?? 0, sensorAlpha),
        timestamp: point.timestamp
      };
      previousRaw = point;
      return filtered;
    }
  };
}

export function compactInkPoints(points: readonly InkPoint[], _tolerance = 0.35): InkPoint[] {
  if (points.length <= 1) return [...points];
  const result: InkPoint[] = [{ ...points[0]! }];
  for (let index = 1; index < points.length; index++) {
    const point = points[index]!;
    const previous = result.at(-1)!;
    if (
      Math.hypot(point.x - previous.x, point.y - previous.y) < 0.001 &&
      Math.abs(point.pressure - previous.pressure) < 0.001
    ) continue;
    result.push({ ...point });
  }
  return result;
}

function sampleDeltaSeconds(previous: number, current: number): number {
  const raw = (current - previous) / 1000;
  if (!Number.isFinite(raw) || raw <= 0 || raw > 0.05) return 1 / 120;
  return clamp(raw, 1 / 240, 1 / 30);
}
function mix(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
function clamp01(value: number): number {
  return clamp(value, 0, 1);
}
