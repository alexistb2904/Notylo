import { getStroke } from "perfect-freehand";
import type { InkDynamics, InkObject } from "@notylo/document-model";
import type { Point } from "@notylo/canvas-engine";
import { stabilizeInkPoints, type RenderInkPoint } from "../../lib/ink";

export type InkRenderQuality = "economy" | "full";
export type BrushKind =
  | "ink"
  | "nib"
  | "graphite"
  | "graphite-soft"
  | "marker"
  | "paint"
  | "highlighter";

type RenderPoint = RenderInkPoint;
type InkLike = Pick<
  InkObject,
  "color" | "size" | "tool" | "smoothing" | "brushId" | "dynamics" | "opacity"
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

const DEFAULT_DYNAMICS: InkDynamics = {
  pressureSensitivity: 0.5,
  pressureAffectsWidth: true,
  pressureAffectsOpacity: false,
  tiltAffectsAngle: false
};

const preparedCache = new WeakMap<object, { readonly key: string; readonly points: readonly RenderPoint[] }>();
const pathCache = new WeakMap<object, { readonly key: string; readonly path: string }>();

export { stabilizeInkPoints } from "../../lib/ink";

/**
 * Resolution-independent vector outline. `complete` and `quality` are retained in
 * the signature for old callers, but neither is allowed to change the geometry.
 * Performance profiles may simplify secondary texture, never the actual handwriting.
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
    object.size.toFixed(3),
    (object.smoothing ?? 0.55).toFixed(3),
    dynamics.pressureSensitivity.toFixed(3),
    dynamics.pressureAffectsWidth ? 1 : 0,
    dynamics.tiltAffectsAngle ? 1 : 0,
    kind
  ].join(":");
  const cacheKey = object.points as object;
  const cached = pathCache.get(cacheKey);
  if (cached?.key === key) return cached.path;

  const tiltAware =
    dynamics.tiltAffectsAngle &&
    (kind === "nib" || kind === "marker" || kind === "highlighter");
  const path = tiltAware
    ? tiltAwareRibbonPath(points, object.size, dynamics, kind)
    : perfectFreehandPath(points, object.size, object.smoothing ?? 0.55, dynamics, kind);
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
  context.globalAlpha = getInkBaseAlpha(object) * object.opacity * alpha * averagePressureOpacity(object);
  context.fill(new Path2D(pathData));
  context.restore();
}

/** Backward-compatible live helper. Shape is exactly the same as committed SVG. */
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

export function getInkBrushKind(object: Pick<InkObject, "brushId" | "tool">): BrushKind {
  switch (object.brushId) {
    case "ink-calligraphy":
      return "nib";
    case "pencil-sketch":
      return "graphite";
    case "pencil-2b":
      return "graphite-soft";
    case "marker-medium":
      return "marker";
    case "wet-paint":
      return "paint";
    case "highlighter-flat":
      return "highlighter";
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
      return { kind, baseAlpha: 0.5, multiply: true };
    case "graphite-soft":
      return { kind, baseAlpha: 0.62, multiply: true };
    case "paint":
      return { kind, baseAlpha: 0.64, multiply: true };
    case "highlighter":
      return { kind, baseAlpha: 0.24, multiply: true };
    case "marker":
      return { kind, baseAlpha: 0.76, multiply: false };
    case "nib":
      return { kind, baseAlpha: 0.96, multiply: false };
    default:
      return { kind, baseAlpha: 0.99, multiply: false };
  }
}

export function getInkTexture(object: InkLike): InkTexture | undefined {
  const kind = getInkBrushKind(object);
  const points = preparedInkPoints(object);
  if (points.length < 2) return undefined;
  if (kind === "graphite" || kind === "graphite-soft") {
    const d = graphiteTexturePath(points, object.size, kind === "graphite-soft");
    return d
      ? {
          d,
          opacity: kind === "graphite-soft" ? 0.22 : 0.18,
          strokeWidth: Math.max(0.2, object.size * (kind === "graphite-soft" ? 0.065 : 0.05))
        }
      : undefined;
  }
  if (kind === "paint") {
    const d = paintBristlePath(points, object.size);
    return d
      ? { d, opacity: 0.2, strokeWidth: Math.max(0.28, object.size * 0.07) }
      : undefined;
  }
  return undefined;
}

export function getInkBaseAlpha(object: Pick<InkObject, "brushId" | "tool">): number {
  return getInkVisual(object).baseAlpha;
}

export function getLiveInkOpacity(object: InkLike): number {
  return getInkBaseAlpha(object) * object.opacity * averagePressureOpacity(object);
}

/**
 * Vector pressure mask for optional pressure->opacity. Complexity is capped while
 * following the same stabilised centre line as the visible stroke.
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

function preparedInkPoints(object: InkLike): readonly RenderPoint[] {
  const points = object.points;
  const last = points.at(-1)!;
  const key = [
    points.length,
    last.x.toFixed(3),
    last.y.toFixed(3),
    last.pressure.toFixed(3),
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
  dynamics: InkDynamics,
  kind: BrushKind
): string {
  const input = points.map(
    (point): [number, number, number] => [point.x, point.y, clamp01(point.pressure)]
  );
  const smooth = clamp01(smoothing);
  const flat = kind === "marker" || kind === "highlighter";
  const outline = getStroke(input, {
    size,
    thinning: dynamics.pressureAffectsWidth ? thinningForKind(kind) : 0,
    smoothing: 0.62 + smooth * 0.34,
    streamline: 0.08 + smooth * 0.24,
    simulatePressure: false,
    easing: (pressure) => applyPressureCurve(pressure, dynamics.pressureSensitivity),
    start: { cap: !flat, taper: 0 },
    end: { cap: !flat, taper: 0 },
    last: true
  }) as [number, number][];
  return svgPathFromOutline(outline);
}

function svgPathFromOutline(points: readonly (readonly [number, number])[]): string {
  if (!points.length) return "";
  if (points.length < 4) {
    const [x, y] = points[0]!;
    return circlePath(x, y, 0.35);
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

function tiltAwareRibbonPath(
  points: readonly RenderPoint[],
  size: number,
  dynamics: InkDynamics,
  kind: BrushKind
): string {
  if (points.length === 1) {
    const point = points[0]!;
    const width = Math.max(0.2, (size * pressureWidth(point.pressure, dynamics)) / 2);
    return circlePath(point.x, point.y, width);
  }
  const samples = points.map((point, index) => {
    const previous = points[Math.max(0, index - 1)]!;
    const next = points[Math.min(points.length - 1, index + 1)]!;
    let tx = next.x - previous.x;
    let ty = next.y - previous.y;
    const length = Math.hypot(tx, ty) || 1;
    tx /= length;
    ty /= length;
    const direction = Math.atan2(ty, tx);
    const tiltX = point.tiltX ?? 0;
    const tiltY = point.tiltY ?? 0;
    const tipAngle = Math.hypot(tiltX, tiltY) >= 3 ? Math.atan2(tiltY, tiltX) : Math.PI / 4;
    const projected = tipProjection(kind, tipAngle, direction);
    return {
      x: point.x,
      y: point.y,
      nx: -ty,
      ny: tx,
      halfWidth: Math.max(0.14, (size * pressureWidth(point.pressure, dynamics) * projected) / 2)
    };
  });
  const left = samples.map((sample) => ({
    x: sample.x + sample.nx * sample.halfWidth,
    y: sample.y + sample.ny * sample.halfWidth
  }));
  const right = samples.map((sample) => ({
    x: sample.x - sample.nx * sample.halfWidth,
    y: sample.y - sample.ny * sample.halfWidth
  }));
  const flat = kind === "marker" || kind === "highlighter";
  let d = `M${fmt(left[0]!.x)},${fmt(left[0]!.y)} `;
  d += smoothEdge(left);
  const last = samples.at(-1)!;
  if (flat) d += `L${fmt(right.at(-1)!.x)},${fmt(right.at(-1)!.y)} `;
  else
    d += `A${fmt(last.halfWidth)},${fmt(last.halfWidth)} 0 0 1 ${fmt(right.at(-1)!.x)},${fmt(right.at(-1)!.y)} `;
  d += smoothEdge([...right].reverse());
  const first = samples[0]!;
  if (flat) d += `L${fmt(left[0]!.x)},${fmt(left[0]!.y)} `;
  else
    d += `A${fmt(first.halfWidth)},${fmt(first.halfWidth)} 0 0 1 ${fmt(left[0]!.x)},${fmt(left[0]!.y)} `;
  return `${d}Z`;
}

function smoothEdge(points: readonly Point[]): string {
  if (points.length < 2) return "";
  let result = "";
  for (let index = 1; index < points.length - 1; index++) {
    const point = points[index]!;
    const next = points[index + 1]!;
    result += `Q${fmt(point.x)},${fmt(point.y)} ${fmt((point.x + next.x) / 2)},${fmt((point.y + next.y) / 2)} `;
  }
  const last = points.at(-1)!;
  return `${result}L${fmt(last.x)},${fmt(last.y)} `;
}

function circlePath(x: number, y: number, radius: number): string {
  return `M${fmt(x - radius)},${fmt(y)} A${fmt(radius)},${fmt(radius)} 0 1 0 ${fmt(x + radius)},${fmt(y)} A${fmt(radius)},${fmt(radius)} 0 1 0 ${fmt(x - radius)},${fmt(y)} Z`;
}

function pressureWidth(pressure: number, dynamics: InkDynamics): number {
  if (!dynamics.pressureAffectsWidth) return 1;
  return 0.14 + applyPressureCurve(pressure, dynamics.pressureSensitivity) * 0.86;
}

function tipProjection(kind: BrushKind, tipAngle: number, direction: number): number {
  const ratio = kind === "nib" ? 0.34 : kind === "highlighter" ? 0.5 : 0.64;
  const delta = direction - tipAngle;
  return Math.max(
    ratio,
    Math.sqrt(Math.sin(delta) ** 2 + ratio * ratio * Math.cos(delta) ** 2)
  );
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

function graphiteTexturePath(
  points: readonly RenderPoint[],
  size: number,
  soft: boolean
): string {
  const targetMarks = soft ? 54 : 40;
  const stride = Math.max(2, Math.ceil(points.length / targetMarks));
  let d = "";
  for (let index = 1; index < points.length - 1; index += stride) {
    const previous = points[index - 1]!;
    const point = points[index]!;
    const next = points[index + 1]!;
    let tx = next.x - previous.x;
    let ty = next.y - previous.y;
    const length = Math.hypot(tx, ty) || 1;
    tx /= length;
    ty /= length;
    const nx = -ty;
    const ny = tx;
    const noise = pseudoRandom(index * 37 + Math.round(point.x * 3) + Math.round(point.y * 5));
    const across = (noise - 0.5) * size * 0.7;
    const markLength = Math.max(0.65, size * (0.18 + pseudoRandom(index * 71) * 0.22));
    const x1 = point.x + nx * across - tx * markLength;
    const y1 = point.y + ny * across - ty * markLength;
    const x2 = point.x + nx * across + tx * markLength;
    const y2 = point.y + ny * across + ty * markLength;
    d += `M${fmt(x1)},${fmt(y1)} L${fmt(x2)},${fmt(y2)} `;
  }
  return d.trim();
}

function paintBristlePath(points: readonly RenderPoint[], size: number): string {
  const lanes = [-0.38, 0.38];
  let d = "";
  lanes.forEach((lane, laneIndex) => {
    points.forEach((point, index) => {
      const previous = points[Math.max(0, index - 1)]!;
      const next = points[Math.min(points.length - 1, index + 1)]!;
      let tx = next.x - previous.x;
      let ty = next.y - previous.y;
      const length = Math.hypot(tx, ty) || 1;
      tx /= length;
      ty /= length;
      const nx = -ty;
      const ny = tx;
      const wobble = (pseudoRandom(index * 53 + laneIndex * 101) - 0.5) * 0.12;
      const offset = size * 0.5 * (lane + wobble);
      const x = point.x + nx * offset;
      const y = point.y + ny * offset;
      d += `${index ? "L" : "M"}${fmt(x)},${fmt(y)} `;
    });
  });
  return d.trim();
}

function pseudoRandom(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function thinningForKind(kind: BrushKind): number {
  switch (kind) {
    case "highlighter":
      return 0.1;
    case "marker":
      return 0.32;
    case "graphite":
    case "graphite-soft":
      return 0.7;
    case "nib":
      return 0.78;
    case "paint":
      return 0.66;
    default:
      return 0.56;
  }
}

function fmt(value: number): string {
  return Number.isFinite(value) ? value.toFixed(3) : "0";
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
