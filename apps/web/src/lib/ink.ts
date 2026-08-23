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
  // Even 0% removes raw sensor chatter; the slider controls the additional
  // calligraphic stabilization rather than switching filtering off entirely.
  const strength = 0.18 + clamp01(amount) * 0.74;
  let previousRaw: InkPoint | undefined;
  let filtered: InkPoint | undefined;
  let velocityX = 0;
  let velocityY = 0;

  return {
    push(point) {
      if (!previousRaw || !filtered) {
        previousRaw = point;
        filtered = { ...point };
        return filtered;
      }

      const dt = sampleDeltaSeconds(previousRaw.timestamp, point.timestamp);
      const rawVelocityX = (point.x - previousRaw.x) / dt;
      const rawVelocityY = (point.y - previousRaw.y) / dt;
      const velocityAlpha = mix(0.55, 0.16, strength);
      velocityX = mix(velocityX, rawVelocityX, velocityAlpha);
      velocityY = mix(velocityY, rawVelocityY, velocityAlpha);
      const speed = Math.hypot(velocityX, velocityY);

      const deltaX = point.x - filtered.x;
      const deltaY = point.y - filtered.y;
      const directionLength = Math.hypot(velocityX, velocityY);
      const directionX = directionLength > 0.001 ? velocityX / directionLength : 1;
      const directionY = directionLength > 0.001 ? velocityY / directionLength : 0;
      const parallel = deltaX * directionX + deltaY * directionY;
      const perpendicularX = deltaX - parallel * directionX;
      const perpendicularY = deltaY - parallel * directionY;

      // Follow the direction of travel almost immediately, while filtering the
      // side-to-side component that makes handwriting look shaky.
      const parallelAlpha = clamp(0.94 + speed / 5_000, 0.94, 0.995);
      const perpendicularAlpha = clamp(
        mix(0.94, 0.3, strength) + Math.min(0.15, speed / 3_000) * strength,
        0.28,
        0.94
      );
      const sensorAlpha = mix(0.74, 0.36, strength);
      filtered = {
        x: filtered.x + directionX * parallel * parallelAlpha + perpendicularX * perpendicularAlpha,
        y: filtered.y + directionY * parallel * parallelAlpha + perpendicularY * perpendicularAlpha,
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
