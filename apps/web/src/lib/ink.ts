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
  finish(): readonly InkPoint[];
}

export interface InkStabilizerOptions {
  /** World-to-screen scale used to keep speed and delay consistent while zooming. */
  readonly zoom?: number;
}

/**
 * Krita-inspired stabilizer with separate sample windows for slow and fast input.
 * It averages position and pen sensors, keeps a small zoom-adaptive dead zone,
 * and drains the pending sample window on release so the line reaches the nib.
 * Filtering happens once during capture, keeping live and committed ink identical.
 */
export function createInkStabilizer(
  amount: number,
  options: InkStabilizerOptions = {}
): InkStabilizer {
  const strength = clamp01(amount);
  const zoom = Math.max(0.05, options.zoom ?? 1);
  // Krita's stabilizer needs at least three samples. Slow movements benefit
  // from a much longer history, while fast gestures use a short window.
  const slowSampleCount = 3 + Math.round(21 * Math.pow(strength, 1.2));
  const fastSampleCount = 3 + Math.round(strength);
  const delayRadius = (2.75 * Math.pow(strength, 1.7)) / zoom;
  const history: InkPoint[] = [];
  let previousRaw: InkPoint | undefined;
  let filtered: InkPoint | undefined;
  let smoothedSpeed = 0;
  let hasSpeed = false;
  let finished = false;

  const pushHistory = (point: InkPoint) => {
    history.push({ ...point });
    while (history.length > slowSampleCount) history.shift();
  };

  const sample = (point: InkPoint, speedFactor: number, applyDelay: boolean): InkPoint => {
    const slowPosition = weightedPosition(history, slowSampleCount);
    const fastPosition = weightedPosition(history, fastSampleCount);
    let x = mix(slowPosition.x, fastPosition.x, speedFactor);
    let y = mix(slowPosition.y, fastPosition.y, speedFactor);

    // At speed the stroke should stay close to the nib instead of feeling
    // rubber-banded. Slow strokes keep the full long-window smoothing.
    const rawFollow = speedFactor * mix(0.88, 0.68, strength);
    x = mix(x, point.x, rawFollow);
    y = mix(y, point.y, rawFollow);

    if (applyDelay && filtered && delayRadius > 0.01) {
      const dx = x - filtered.x;
      const dy = y - filtered.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= delayRadius) {
        x = filtered.x;
        y = filtered.y;
      } else {
        x -= (dx / distance) * delayRadius;
        y -= (dy / distance) * delayRadius;
      }
    }

    const sensorCount = Math.max(
      2,
      Math.round(mix(slowSampleCount, fastSampleCount, speedFactor) * 0.6)
    );
    const sensors = averageSensors(history, sensorCount);
    return {
      x,
      y,
      pressure: sensors.pressure,
      ...(sensors.tiltX !== undefined ? { tiltX: sensors.tiltX } : {}),
      ...(sensors.tiltY !== undefined ? { tiltY: sensors.tiltY } : {}),
      timestamp: point.timestamp
    };
  };

  return {
    push(point) {
      if (!previousRaw || !filtered) {
        previousRaw = point;
        filtered = { ...point };
        for (let index = 0; index < slowSampleCount; index++) pushHistory(point);
        return filtered;
      }

      const dt = sampleDeltaSeconds(previousRaw.timestamp, point.timestamp);
      const rawSpeed = (Math.hypot(point.x - previousRaw.x, point.y - previousRaw.y) * zoom) / dt;
      const speedAlpha = 1 - Math.exp(-dt * 14);
      smoothedSpeed = hasSpeed ? mix(smoothedSpeed, rawSpeed, speedAlpha) : rawSpeed;
      hasSpeed = true;
      const speedFactor = smoothStep(35, 900, smoothedSpeed);

      pushHistory(point);
      filtered = sample(point, speedFactor, true);
      previousRaw = point;
      return filtered;
    },
    finish() {
      if (finished || !previousRaw || !filtered) return [];
      finished = true;
      const result: InkPoint[] = [];

      // Repeating the final input drains the rolling window just like Krita's
      // Finish Line option. The resulting tail follows the filtered trajectory
      // and ends exactly at the last known nib position.
      for (let index = 0; index < slowSampleCount; index++) {
        const finishingPoint = { ...previousRaw, timestamp: previousRaw.timestamp + index + 1 };
        pushHistory(finishingPoint);
        const next = sample(finishingPoint, 0, false);
        if (inkPointChanged(filtered, next)) result.push(next);
        filtered = next;
      }

      const endpoint = {
        ...previousRaw,
        timestamp: previousRaw.timestamp + slowSampleCount + 1
      };
      if (
        filtered.x !== endpoint.x ||
        filtered.y !== endpoint.y ||
        filtered.pressure !== endpoint.pressure ||
        filtered.tiltX !== endpoint.tiltX ||
        filtered.tiltY !== endpoint.tiltY
      )
        result.push(endpoint);
      filtered = endpoint;
      history.splice(0, history.length, ...Array.from({ length: slowSampleCount }, () => endpoint));
      return result;
    }
  };
}

export function compactInkPoints(points: readonly InkPoint[], _tolerance = 0.35): InkPoint[] {
  if (points.length <= 1) return [...points];
  const result: InkPoint[] = [{ ...points[0]! }];
  for (let index = 1; index < points.length; index++) {
    const point = points[index]!;
    const previous = result.at(-1)!;
    const nearlyIdentical =
      Math.hypot(point.x - previous.x, point.y - previous.y) < 0.001 &&
      Math.abs(point.pressure - previous.pressure) < 0.001;
    const exactlyIdentical =
      point.x === previous.x &&
      point.y === previous.y &&
      point.pressure === previous.pressure &&
      point.tiltX === previous.tiltX &&
      point.tiltY === previous.tiltY;
    if (nearlyIdentical && (index < points.length - 1 || exactlyIdentical)) continue;
    result.push({ ...point });
  }
  return result;
}

function sampleDeltaSeconds(previous: number, current: number): number {
  const raw = (current - previous) / 1000;
  if (!Number.isFinite(raw) || raw <= 0 || raw > 0.05) return 1 / 120;
  return clamp(raw, 1 / 240, 1 / 30);
}
function weightedPosition(points: readonly InkPoint[], count: number): { x: number; y: number } {
  const start = Math.max(0, points.length - count);
  let weightTotal = 0;
  let x = 0;
  let y = 0;
  for (let index = start; index < points.length; index++) {
    const recency = index - start + 1;
    const weight = recency * recency * recency;
    weightTotal += weight;
    x += points[index]!.x * weight;
    y += points[index]!.y * weight;
  }
  return weightTotal ? { x: x / weightTotal, y: y / weightTotal } : { x: 0, y: 0 };
}
function averageSensors(
  points: readonly InkPoint[],
  count: number
): { pressure: number; tiltX?: number; tiltY?: number } {
  const start = Math.max(0, points.length - count);
  const sampleCount = points.length - start;
  if (!sampleCount) return { pressure: 0.5 };
  let pressure = 0;
  let tiltX = 0;
  let tiltY = 0;
  let tiltXCount = 0;
  let tiltYCount = 0;
  for (let index = start; index < points.length; index++) {
    const point = points[index]!;
    pressure += point.pressure;
    if (point.tiltX !== undefined) {
      tiltX += point.tiltX;
      tiltXCount++;
    }
    if (point.tiltY !== undefined) {
      tiltY += point.tiltY;
      tiltYCount++;
    }
  }
  return {
    pressure: clamp01(pressure / sampleCount),
    ...(tiltXCount ? { tiltX: tiltX / tiltXCount } : {}),
    ...(tiltYCount ? { tiltY: tiltY / tiltYCount } : {})
  };
}
function inkPointChanged(previous: InkPoint, next: InkPoint): boolean {
  return (
    Math.hypot(next.x - previous.x, next.y - previous.y) > 0.001 ||
    Math.abs(next.pressure - previous.pressure) > 0.001 ||
    Math.abs((next.tiltX ?? 0) - (previous.tiltX ?? 0)) > 0.01 ||
    Math.abs((next.tiltY ?? 0) - (previous.tiltY ?? 0)) > 0.01
  );
}
function smoothStep(minimum: number, maximum: number, value: number): number {
  const normalized = clamp01((value - minimum) / (maximum - minimum));
  return normalized * normalized * (3 - 2 * normalized);
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
