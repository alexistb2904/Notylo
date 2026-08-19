import { getStroke } from "perfect-freehand";
import type { InkDynamics, InkObject } from "@notylo/document-model";
import type { Point } from "@notylo/canvas-engine";
import { stabilizeInkPoints, type RenderInkPoint } from "../../lib/ink";

export type InkRenderQuality = "economy" | "full";
export type BrushKind = "ink" | "graphite" | "highlighter";

type RenderPoint = RenderInkPoint;
type InkLike = Pick<
  InkObject,
  | "color"
  | "size"
  | "tool"
  | "smoothing"
  | "captureZoom"
  | "brushId"
  | "dynamics"
  | "opacity"
> & { readonly points: readonly RenderPoint[] };

export interface PressureMaskSegment {
  readonly from: Point;
  readonly to: Point;
  readonly opacity: number;
}

export interface BrushVisual {
  readonly kind: BrushKind;
  readonly baseAlpha: number;
  readonly multiply: boolean;
}

export interface InkTexture {
  readonly d: string;
  readonly opacity: number;
  readonly strokeWidth: number;
}

interface StrokeProfile {
  readonly thinning: number;
  readonly smoothingBase: number;
  readonly smoothingRange: number;
  readonly streamlineBase: number;
  readonly streamlineRange: number;
  readonly roundCaps: boolean;
}

const DEFAULT_DYNAMICS: InkDynamics = {
  pressureSensitivity: 0.5,
  pressureAffectsWidth: true,
  pressureAffectsOpacity: false,
  tiltAffectsAngle: false
};

const preparedCache = new WeakMap<
  object,
  { readonly key: string; readonly points: readonly RenderPoint[] }
>();
const pathCache = new WeakMap<object, { readonly key: string; readonly path: string }>();

export { stabilizeInkPoints } from "../../lib/ink";

/**
 * Resolution-independent vector outline.
 *
 * There is intentionally only one positional smoothing stage: perfect-freehand.
 * The sensor preparation step may soften pressure/tilt but keeps x/y untouched.
 * Live SVG and committed SVG therefore share the exact same trajectory pipeline.
 */
export function getInkSvgPathData(
  object: InkLike,
  _complete = true,
  _quality: InkRenderQuality = "full"
): string {
  if (!object.points.length) return "";
  const points = preparedInkPoints(object);
  const last = points.at(-1)!;
  const dynamics = object.dynamics ?? DEFAULT_DYNAMICS;
  const kind = getInkBrushKind(object);
  const key = [
    points.length,
    last.x.toFixed(3),
    last.y.toFixed(3),
    last.pressure.toFixed(3),
    (last.tiltX ?? 0).toFixed(2),
    (last.tiltY ?? 0).toFixed(2),
    object.size.toFixed(3),
    (object.smoothing ?? 0.55).toFixed(3),
    (object.captureZoom ?? 1).toFixed(3),
    dynamics.pressureSensitivity.toFixed(3),
    dynamics.pressureAffectsWidth ? 1 : 0,
    kind
  ].join(":");
  const cacheKey = object.points as object;
  const cached = pathCache.get(cacheKey);
  if (cached?.key === key) return cached.path;

  const path = perfectFreehandPath(
    points,
    object.size,
    object.smoothing ?? 0.55,
    object.captureZoom,
    dynamics,
    kind
  );
  pathCache.set(cacheKey, { key, path });
  return path;
}

/** Used by OCR/export code paths that require a bitmap surface. */
export function drawInkToCanvas(
  context: CanvasRenderingContext2D,
  object: InkLike,
  offset: Point,
  alpha = 1
): void {
  const pathData = getInkSvgPathData(object);
  if (!pathData) return;
  context.save();
  context.translate(offset.x, offset.y);
  context.fillStyle = object.color;
  context.globalAlpha =
    getInkBaseAlpha(object) * object.opacity * alpha * averagePressureOpacity(object);
  context.fill(new Path2D(pathData));
  context.restore();
}

/** Backward-compatible preview helper; geometry is identical to committed SVG. */
export function drawInkVectorPreview(
  context: CanvasRenderingContext2D,
  object: InkLike,
  offset: Point,
  _complete: boolean,
  alpha = 1,
  _quality: InkRenderQuality = "full"
): void {
  drawInkToCanvas(context, object, offset, alpha);
}

/**
 * Three real note-taking styles. Legacy ids map to the nearest style so old
 * notebooks remain visually valid after removing the fake paint/marker presets.
 */
export function getInkBrushKind(object: Pick<InkObject, "brushId" | "tool">): BrushKind {
  switch (object.brushId) {
    case "pencil-sketch":
    case "pencil-2b":
      return "graphite";
    case "highlighter-flat":
      return "highlighter";
    case "ink-calligraphy":
    case "marker-medium":
    case "wet-paint":
    case "ink-fineliner":
      return object.tool === "pencil"
        ? "graphite"
        : object.tool === "highlighter"
          ? "highlighter"
          : "ink";
    default:
      return object.tool === "pencil"
        ? "graphite"
        : object.tool === "highlighter"
          ? "highlighter"
          : "ink";
  }
}

export function getInkVisual(object: Pick<InkObject, "brushId" | "tool">): BrushVisual {
  const kind = getInkBrushKind(object);
  switch (kind) {
    case "graphite":
      return { kind, baseAlpha: 0.76, multiply: true };
    case "highlighter":
      return { kind, baseAlpha: 0.22, multiply: true };
    default:
      return { kind, baseAlpha: 1, multiply: false };
  }
}

/**
 * Pencil gets a deterministic vector graphite grain. The pen stays clean and the
 * highlighter stays translucent; no raster dabs are required for any tool.
 */
export function getInkTexture(object: InkLike): InkTexture | undefined {
  if (getInkBrushKind(object) !== "graphite") return undefined;
  const points = preparedInkPoints(object);
  if (points.length < 2) return undefined;
  const d = graphiteTexturePath(
    points,
    object.size,
    Boolean((object.dynamics ?? DEFAULT_DYNAMICS).tiltAffectsAngle)
  );
  return d
    ? {
        d,
        opacity: 0.3,
        strokeWidth: Math.max(0.22, object.size * 0.065)
      }
    : undefined;
}

export function getInkBaseAlpha(object: Pick<InkObject, "brushId" | "tool">): number {
  return getInkVisual(object).baseAlpha;
}

export function getLiveInkOpacity(object: InkLike): number {
  return getInkBaseAlpha(object) * object.opacity * averagePressureOpacity(object);
}

/**
 * Optional pressure->opacity mask. It follows the same raw x/y centre line while
 * using the sensor-smoothed pressure channel.
 */
export function getPressureMaskSegments(
  object: Pick<InkObject, "points" | "dynamics" | "smoothing" | "size">,
  maximum = 40
): readonly PressureMaskSegment[] {
  const dynamics = object.dynamics ?? DEFAULT_DYNAMICS;
  if (!dynamics.pressureAffectsOpacity || object.points.length < 2) return [];
  const points = stabilizeInkPoints(object.points, object.smoothing ?? 0.55, object.size);
  const segmentCount = Math.max(1, points.length - 1);
  const stride = Math.max(1, Math.ceil(segmentCount / Math.max(1, maximum)));
  const result: PressureMaskSegment[] = [];
  for (let index = 0; index < points.length - 1; index += stride) {
    const endIndex = Math.min(points.length - 1, index + stride);
    const from = points[index]!;
    const to = points[endIndex]!;
    const pressure =
      (applyPressureCurve(from.pressure, dynamics.pressureSensitivity) +
        applyPressureCurve(to.pressure, dynamics.pressureSensitivity)) /
      2;
    result.push({
      from: { x: from.x, y: from.y },
      to: { x: to.x, y: to.y },
      opacity: 0.08 + pressure * 0.92
    });
  }
  return result;
}

export function applyPressureCurve(pressure: number, sensitivity: number): number {
  const input = clamp01(pressure);
  const setting = clamp01(sensitivity);
  return Math.pow(input, Math.pow(2, 1 - setting * 2));
}

/**
 * High zoom is used for tiny handwriting where positional latency is far more
 * noticeable than on large strokes. Reduce only perfect-freehand's streamline
 * at capture time; outline smoothing stays unchanged. The scale is stored with
 * the stroke through captureZoom, so reopening or zooming the page never changes
 * a finished line's geometry.
 */
export function streamlineScaleForCapture(captureZoom: number | undefined): number {
  const zoom = Math.max(0.05, Math.min(10, captureZoom ?? 1));
  if (zoom <= 1) return 1;
  return Math.max(0.32, 1 / Math.sqrt(zoom));
}

function preparedInkPoints(object: InkLike): readonly RenderPoint[] {
  const points = object.points;
  const last = points.at(-1)!;
  const key = [
    points.length,
    last.x.toFixed(3),
    last.y.toFixed(3),
    last.pressure.toFixed(3),
    (last.tiltX ?? 0).toFixed(2),
    (last.tiltY ?? 0).toFixed(2),
    last.timestamp.toFixed(1),
    (object.smoothing ?? 0.55).toFixed(3),
    object.size.toFixed(3)
  ].join(":");
  const cacheKey = points as object;
  const cached = preparedCache.get(cacheKey);
  if (cached?.key === key) return cached.points;
  const prepared = stabilizeInkPoints(points, object.smoothing ?? 0.55, object.size);
  preparedCache.set(cacheKey, { key, points: prepared });
  return prepared;
}

function perfectFreehandPath(
  points: readonly RenderPoint[],
  size: number,
  smoothing: number,
  captureZoom: number | undefined,
  dynamics: InkDynamics,
  kind: BrushKind
): string {
  const input = points.map(
    (point): [number, number, number] => [point.x, point.y, clamp01(point.pressure)]
  );
  const smooth = clamp01(smoothing);
  const profile = strokeProfile(kind);
  const streamlineScale = streamlineScaleForCapture(captureZoom);
  const outline = getStroke(input, {
    size,
    thinning: dynamics.pressureAffectsWidth ? profile.thinning : 0,
    smoothing: profile.smoothingBase + smooth * profile.smoothingRange,
    streamline:
      (profile.streamlineBase + smooth * profile.streamlineRange) * streamlineScale,
    simulatePressure: false,
    easing: (pressure) => applyPressureCurve(pressure, dynamics.pressureSensitivity),
    start: { cap: profile.roundCaps, taper: 0 },
    end: { cap: profile.roundCaps, taper: 0 },
    last: true
  }) as [number, number][];
  return svgPathFromOutline(outline, Math.max(0.35, size / 2));
}

function strokeProfile(kind: BrushKind): StrokeProfile {
  switch (kind) {
    case "graphite":
      return {
        thinning: 0.62,
        smoothingBase: 0.5,
        smoothingRange: 0.25,
        streamlineBase: 0.14,
        streamlineRange: 0.22,
        roundCaps: true
      };
    case "highlighter":
      return {
        thinning: 0.08,
        smoothingBase: 0.68,
        smoothingRange: 0.2,
        streamlineBase: 0.18,
        streamlineRange: 0.2,
        roundCaps: false
      };
    default:
      return {
        thinning: 0.46,
        smoothingBase: 0.56,
        smoothingRange: 0.28,
        streamlineBase: 0.18,
        streamlineRange: 0.26,
        roundCaps: true
      };
  }
}

/** Official perfect-freehand SVG conversion pattern (quadratic midpoint spline). */
function svgPathFromOutline(
  points: readonly (readonly [number, number])[],
  fallbackRadius: number
): string {
  if (!points.length) return "";
  if (points.length < 4) {
    const [x, y] = points[0]!;
    return circlePath(x, y, fallbackRadius);
  }
  const first = points[0]!;
  const second = points[1]!;
  const third = points[2]!;
  let result = `M${fmt(first[0])},${fmt(first[1])} Q${fmt(second[0])},${fmt(second[1])} ${fmt((second[0] + third[0]) / 2)},${fmt((second[1] + third[1]) / 2)} T`;
  for (let index = 2; index < points.length - 1; index++) {
    const a = points[index]!;
    const b = points[index + 1]!;
    result += `${fmt((a[0] + b[0]) / 2)},${fmt((a[1] + b[1]) / 2)} `;
  }
  return `${result}Z`;
}

function circlePath(x: number, y: number, radius: number): string {
  return `M${fmt(x - radius)},${fmt(y)} A${fmt(radius)},${fmt(radius)} 0 1 0 ${fmt(x + radius)},${fmt(y)} A${fmt(radius)},${fmt(radius)} 0 1 0 ${fmt(x - radius)},${fmt(y)} Z`;
}

function averagePressureOpacity(object: InkLike): number {
  const dynamics = object.dynamics ?? DEFAULT_DYNAMICS;
  if (!dynamics.pressureAffectsOpacity || !object.points.length) return 1;
  const points = preparedInkPoints(object);
  const start = Math.max(0, points.length - 10);
  let total = 0;
  for (let index = start; index < points.length; index++)
    total += applyPressureCurve(points[index]!.pressure, dynamics.pressureSensitivity);
  return 0.08 + (total / Math.max(1, points.length - start)) * 0.92;
}

/**
 * Pencil texture is sampled by geometric distance, never event count. With tilt
 * enabled, graphite marks follow the stylus azimuth; otherwise they follow travel.
 */
function graphiteTexturePath(
  points: readonly RenderPoint[],
  size: number,
  useTilt: boolean
): string {
  const samples = resampleTexturePath(points, Math.max(3.6, size * 1.55));
  if (samples.length < 3) return "";
  let d = "";
  for (let index = 1; index < samples.length - 1; index++) {
    const previous = samples[index - 1]!;
    const point = samples[index]!;
    const next = samples[index + 1]!;
    let tx = next.x - previous.x;
    let ty = next.y - previous.y;
    const travelLength = Math.hypot(tx, ty) || 1;
    tx /= travelLength;
    ty /= travelLength;

    if (useTilt && Math.hypot(point.tiltX ?? 0, point.tiltY ?? 0) >= 3) {
      const angle = Math.atan2(point.tiltY ?? 0, point.tiltX ?? 0);
      tx = Math.cos(angle);
      ty = Math.sin(angle);
    }

    const nx = -ty;
    const ny = tx;
    const noise = pseudoRandom(index * 37 + Math.round(point.x * 3) + Math.round(point.y * 5));
    const across = (noise - 0.5) * size * 0.82;
    const pressure = 0.35 + clamp01(point.pressure) * 0.65;
    const markLength = Math.max(
      0.65,
      size * pressure * (0.17 + pseudoRandom(index * 71) * 0.24)
    );
    const x1 = point.x + nx * across - tx * markLength;
    const y1 = point.y + ny * across - ty * markLength;
    const x2 = point.x + nx * across + tx * markLength;
    const y2 = point.y + ny * across + ty * markLength;
    d += `M${fmt(x1)},${fmt(y1)} L${fmt(x2)},${fmt(y2)} `;
  }
  return d.trim();
}

function resampleTexturePath(
  points: readonly RenderPoint[],
  spacing: number
): readonly RenderPoint[] {
  if (points.length < 2) return points;
  const safeSpacing = Math.max(0.5, spacing);
  const result: RenderPoint[] = [{ ...points[0]! }];
  let segmentStart: RenderPoint = { ...points[0]! };
  let distanceUntilNext = safeSpacing;

  for (let index = 1; index < points.length; index++) {
    const target = points[index]!;
    let remaining = Math.hypot(target.x - segmentStart.x, target.y - segmentStart.y);
    while (remaining >= distanceUntilNext && remaining > 1e-9) {
      const ratio = distanceUntilNext / remaining;
      segmentStart = interpolateRenderPoint(segmentStart, target, ratio);
      result.push(segmentStart);
      remaining = Math.hypot(target.x - segmentStart.x, target.y - segmentStart.y);
      distanceUntilNext = safeSpacing;
    }
    distanceUntilNext -= remaining;
    segmentStart = { ...target };
  }

  return result;
}

function interpolateRenderPoint(
  start: RenderPoint,
  end: RenderPoint,
  ratio: number
): RenderPoint {
  const mix = (from: number | undefined, to: number | undefined) =>
    (from ?? 0) + ((to ?? 0) - (from ?? 0)) * ratio;
  return {
    x: mix(start.x, end.x),
    y: mix(start.y, end.y),
    pressure: mix(start.pressure, end.pressure),
    tiltX: mix(start.tiltX, end.tiltX),
    tiltY: mix(start.tiltY, end.tiltY),
    timestamp: mix(start.timestamp, end.timestamp)
  };
}

function pseudoRandom(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function fmt(value: number): string {
  return Number.isFinite(value) ? value.toFixed(3) : "0";
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
