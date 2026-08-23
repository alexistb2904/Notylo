import type { Point } from "@notylo/canvas-engine";
import type { InkBrush, InkObject, InkPoint } from "@notylo/document-model";

type BrushStroke = Pick<InkObject, "points" | "color" | "size" | "brush" | "opacity">;

export interface BrushDab {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly aspect: number;
  readonly angle: number;
  readonly opacity: number;
  readonly index: number;
}

interface GeometryCache {
  readonly recipe: string;
  readonly layers: Map<number, Path2D>;
  count: number;
  last?: InkPoint;
  distanceToNext: number;
  dabIndex: number;
  completed: boolean;
}

const geometryCache = new WeakMap<object, GeometryCache>();
const ALPHA_LEVELS = 16;

/** Distance-resampled dabs, independent from pointer event frequency. */
export function sampleBrushStroke(
  points: readonly InkPoint[],
  size: number,
  brush: InkBrush
): readonly BrushDab[] {
  if (!points.length) return [];
  const spacing = dabSpacing(size, brush);
  const result: BrushDab[] = [makeDab(points[0]!, points[0]!, size, brush, 0)];
  let previous = points[0]!;
  let distanceToNext = spacing;
  for (let index = 1; index < points.length; index++) {
    const target = points[index]!;
    let cursor = previous;
    let remaining = distance(cursor, target);
    while (remaining >= distanceToNext && remaining > 1e-9) {
      const sample = interpolate(cursor, target, distanceToNext / remaining);
      result.push(makeDab(sample, cursor, size, brush, result.length));
      cursor = sample;
      remaining = distance(cursor, target);
      distanceToNext = spacing;
    }
    distanceToNext -= remaining;
    previous = target;
  }
  const last = points.at(-1)!;
  if (distance(result.at(-1)!, last) > spacing * 0.35)
    result.push(makeDab(last, points.at(-2) ?? last, size, brush, result.length));
  return result;
}

/** Draws a complete stamp-mask stroke in a bounded number of Canvas fill calls. */
export function drawBrushStroke(
  context: CanvasRenderingContext2D,
  object: BrushStroke,
  offset: Point = { x: 0, y: 0 },
  complete = true,
  alpha = 1
): void {
  if (!object.points.length) return;
  const geometry = compileGeometry(object.points, object.size, object.brush, complete);
  context.save();
  context.translate(offset.x, offset.y);
  context.fillStyle = object.color;
  context.globalCompositeOperation = object.brush.blendMode === "normal" ? "source-over" : "multiply";
  const levels = [...geometry.layers.entries()].sort(([a], [b]) => a - b);
  for (const [level, path] of levels) {
    context.globalAlpha = (level / (ALPHA_LEVELS - 1)) * object.opacity * alpha;
    context.fill(path);
  }
  context.restore();
}

function compileGeometry(
  points: readonly InkPoint[],
  size: number,
  brush: InkBrush,
  complete: boolean
): GeometryCache {
  const recipe = recipeKey(size, brush);
  const cacheKey = points as object;
  let cache = geometryCache.get(cacheKey);
  if (!cache || cache.recipe !== recipe || cache.count > points.length || (cache.completed && cache.count < points.length)) {
    cache = {
      recipe,
      layers: new Map(),
      count: 0,
      distanceToNext: dabSpacing(size, brush),
      dabIndex: 0,
      completed: false
    };
    geometryCache.set(cacheKey, cache);
  }

  if (cache.count === 0 && points[0]) {
    addDab(cache, makeDab(points[0], points[0], size, brush, cache.dabIndex++), brush);
    cache.last = points[0];
    cache.count = 1;
  }

  const spacing = dabSpacing(size, brush);
  for (let index = cache.count; index < points.length; index++) {
    const target = points[index]!;
    let cursor = cache.last ?? target;
    let remaining = distance(cursor, target);
    while (remaining >= cache.distanceToNext && remaining > 1e-9) {
      const sample = interpolate(cursor, target, cache.distanceToNext / remaining);
      addDab(cache, makeDab(sample, cursor, size, brush, cache.dabIndex++), brush);
      cursor = sample;
      remaining = distance(cursor, target);
      cache.distanceToNext = spacing;
    }
    cache.distanceToNext -= remaining;
    cache.last = target;
    cache.count = index + 1;
  }

  if (complete && !cache.completed && cache.last) {
    addDab(
      cache,
      makeDab(cache.last, points.at(-2) ?? cache.last, size, brush, cache.dabIndex++),
      brush
    );
    cache.completed = true;
  }
  return cache;
}

function addDab(cache: GeometryCache, dab: BrushDab, brush: InkBrush): void {
  if (brush.tip === "graphite") {
    addEllipse(cache, dab, brush, 1, dab.opacity * 0.28, 0, 0);
    const particles = 3 + Math.round(brush.grain * 5);
    for (let index = 0; index < particles; index++) {
      const randomA = random(dab.index * 97 + index * 31);
      const randomB = random(dab.index * 53 + index * 71);
      const spread = dab.radius * brush.scatter * 2.8;
      const angle = randomA * Math.PI * 2;
      const extent = spread * Math.sqrt(randomB);
      addEllipse(
        cache,
        dab,
        brush,
        0.16 + random(dab.index * 17 + index) * 0.28,
        dab.opacity * (0.32 + brush.grain * 0.46),
        Math.cos(angle) * extent,
        Math.sin(angle) * extent
      );
    }
    return;
  }

  if (brush.tip === "bristle") {
    const strands = 5;
    for (let index = 0; index < strands; index++) {
      const across = ((index / (strands - 1)) * 2 - 1) * dab.radius * 0.7;
      addEllipse(cache, dab, brush, 0.22 + random(dab.index * 43 + index) * 0.12,
        dab.opacity * (0.46 + random(dab.index * 67 + index) * 0.38), 0, across);
    }
    return;
  }

  const softness = 1 - clamp01(brush.hardness);
  if (softness > 0.02) {
    addEllipse(cache, dab, brush, 1, dab.opacity * (0.08 + brush.hardness * 0.08), 0, 0);
    addEllipse(cache, dab, brush, 0.86 + brush.hardness * 0.1,
      dab.opacity * (0.2 + brush.hardness * 0.18), 0, 0);
  }
  addEllipse(cache, dab, brush, 0.58 + brush.hardness * 0.42, dab.opacity, 0, 0);
}

function addEllipse(
  cache: GeometryCache,
  dab: BrushDab,
  brush: InkBrush,
  scale: number,
  opacity: number,
  localX: number,
  localY: number
): void {
  const level = Math.max(1, Math.min(ALPHA_LEVELS - 1, Math.round(clamp01(opacity) * (ALPHA_LEVELS - 1))));
  let path = cache.layers.get(level);
  if (!path) {
    path = new Path2D();
    cache.layers.set(level, path);
  }
  const cosine = Math.cos(dab.angle);
  const sine = Math.sin(dab.angle);
  const x = dab.x + localX * cosine - localY * sine;
  const y = dab.y + localX * sine + localY * cosine;
  const aspect = brush.tip === "round" ? 1 : dab.aspect;
  const radiusX = Math.max(0.04, dab.radius * scale);
  const radiusY = Math.max(0.04, dab.radius * aspect * scale);
  // ellipse() otherwise connects its start to the previous dab's current point.
  path.moveTo(x + Math.cos(dab.angle) * radiusX, y + Math.sin(dab.angle) * radiusX);
  path.ellipse(x, y, radiusX, radiusY, dab.angle, 0, Math.PI * 2);
  path.closePath();
}

function makeDab(
  point: InkPoint,
  previous: InkPoint,
  size: number,
  brush: InkBrush,
  index: number
): BrushDab {
  const pressure = pressureCurve(point.pressure, brush.dynamics.pressureSensitivity);
  const sizeFactor = brush.dynamics.pressureAffectsWidth ? 0.2 + pressure * 0.8 : 1;
  const opacityFactor = brush.dynamics.pressureAffectsOpacity ? 0.1 + pressure * 0.9 : 1;
  const scatterAngle = random(index * 101 + 7) * Math.PI * 2;
  const scatterDistance = (random(index * 131 + 11) - 0.5) * size * brush.scatter;
  return {
    x: point.x + Math.cos(scatterAngle) * scatterDistance,
    y: point.y + Math.sin(scatterAngle) * scatterDistance,
    radius: Math.max(0.08, (size * sizeFactor) / 2),
    aspect: clamp(brush.aspect, 0.08, 1),
    angle: brushAngle(point, previous, brush),
    opacity: clamp01(brush.opacity * brush.flow * opacityFactor),
    index
  };
}

function brushAngle(point: InkPoint, previous: InkPoint, brush: InkBrush): number {
  const fixed = (brush.angle * Math.PI) / 180;
  if (brush.rotation === "direction")
    return Math.atan2(point.y - previous.y, point.x - previous.x) + fixed;
  if (
    brush.rotation === "tilt" && brush.dynamics.tiltAffectsAngle &&
    Math.hypot(point.tiltX ?? 0, point.tiltY ?? 0) > 2
  ) return Math.atan2(point.tiltY ?? 0, point.tiltX ?? 0) + fixed;
  return fixed;
}

function dabSpacing(size: number, brush: InkBrush): number {
  return Math.max(0.22, size * clamp(brush.spacing, 0.025, 1));
}
function recipeKey(size: number, brush: InkBrush): string {
  return [size, brush.id, brush.tip, brush.spacing, brush.hardness, brush.flow, brush.opacity,
    brush.aspect, brush.angle, brush.rotation, brush.scatter, brush.grain,
    brush.dynamics.pressureSensitivity, brush.dynamics.pressureAffectsWidth ? 1 : 0,
    brush.dynamics.pressureAffectsOpacity ? 1 : 0, brush.dynamics.tiltAffectsAngle ? 1 : 0].join(":");
}
function pressureCurve(pressure: number, sensitivity: number): number {
  return Math.pow(clamp01(pressure), Math.pow(2, 1 - clamp01(sensitivity) * 2));
}
function interpolate(start: InkPoint, end: InkPoint, ratio: number): InkPoint {
  const mix = (from: number | undefined, to: number | undefined) => (from ?? 0) + ((to ?? 0) - (from ?? 0)) * ratio;
  return { x: mix(start.x, end.x), y: mix(start.y, end.y), pressure: mix(start.pressure, end.pressure),
    tiltX: mix(start.tiltX, end.tiltX), tiltY: mix(start.tiltY, end.tiltY),
    timestamp: mix(start.timestamp, end.timestamp) };
}
function distance(a: Pick<Point, "x" | "y">, b: Pick<Point, "x" | "y">): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
function random(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
function clamp01(value: number): number {
  return clamp(value, 0, 1);
}
