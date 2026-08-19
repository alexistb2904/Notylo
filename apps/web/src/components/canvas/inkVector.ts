import { getStroke } from "perfect-freehand";
import type { InkDynamics, InkObject, InkPoint } from "@notylo/document-model";
import type { Point } from "@notylo/canvas-engine";

export type InkRenderQuality = "economy" | "full";

type RenderPoint = Pick<InkPoint, "x" | "y" | "pressure" | "tiltX" | "tiltY" | "timestamp">;
type InkLike = Pick<
  InkObject,
  "color" | "size" | "tool" | "smoothing" | "brushId" | "dynamics" | "opacity"
> & { readonly points: readonly RenderPoint[] };
type BrushKind =
  | "ink"
  | "nib"
  | "graphite"
  | "graphite-soft"
  | "marker"
  | "paint"
  | "highlighter";

export interface PressureMaskSegment {
  readonly from: Point;
  readonly to: Point;
  readonly opacity: number;
}

const DEFAULT_DYNAMICS: InkDynamics = {
  pressureSensitivity: 0.5,
  pressureAffectsWidth: true,
  pressureAffectsOpacity: false,
  tiltAffectsAngle: false
};

const pathCache = new WeakMap<object, { readonly key: string; readonly path: string }>();

/**
 * Returns a resolution-independent SVG outline for one stroke. The common path
 * uses perfect-freehand; the tilt-aware nib fallback keeps Notylo's existing
 * stylus-angle behaviour without turning the stroke into bitmap dabs.
 */
export function getInkSvgPathData(
  object: InkLike,
  complete = true,
  quality: InkRenderQuality = "full"
): string {
  if (!object.points.length) return "";
  const points = boundedInput(object.points, complete, quality);
  const last = points.at(-1)!;
  const dynamics = object.dynamics ?? DEFAULT_DYNAMICS;
  const kind = brushKind(object.brushId, object.tool);
  const key = [
    points.length,
    last.x.toFixed(2),
    last.y.toFixed(2),
    last.pressure.toFixed(3),
    object.size.toFixed(2),
    (object.smoothing ?? 0.55).toFixed(3),
    dynamics.pressureSensitivity.toFixed(3),
    dynamics.pressureAffectsWidth ? 1 : 0,
    dynamics.tiltAffectsAngle ? 1 : 0,
    kind,
    complete ? 1 : 0,
    quality
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

/** Canvas preview using exactly the same vector outline as the committed SVG. */
export function drawInkVectorPreview(
  context: CanvasRenderingContext2D,
  object: InkLike,
  offset: Point,
  complete: boolean,
  alpha = 1,
  quality: InkRenderQuality = "full"
): void {
  const pathData = getInkSvgPathData(object, complete, quality);
  if (!pathData) return;
  context.save();
  context.translate(offset.x, offset.y);
  context.fillStyle = object.color;
  context.globalAlpha =
    getInkBaseAlpha(object) * object.opacity * alpha * previewPressureOpacity(object);
  context.fill(new Path2D(pathData));
  context.restore();
}

export function getInkBaseAlpha(object: Pick<InkObject, "brushId" | "tool">): number {
  switch (brushKind(object.brushId, object.tool)) {
    case "graphite":
      return 0.5;
    case "graphite-soft":
      return 0.62;
    case "paint":
      return 0.62;
    case "highlighter":
      return 0.24;
    case "marker":
      return 0.76;
    case "nib":
      return 0.96;
    default:
      return 0.99;
  }
}

/**
 * Vector pressure mask for the optional pressure->opacity mode. It is bounded
 * to a small number of segments so the rarely-used effect stays cheap in SVG.
 */
export function getPressureMaskSegments(
  object: Pick<InkObject, "points" | "dynamics">,
  maximum = 40
): readonly PressureMaskSegment[] {
  const dynamics = object.dynamics ?? DEFAULT_DYNAMICS;
  if (!dynamics.pressureAffectsOpacity || object.points.length < 2) return [];
  const segmentCount = Math.max(1, object.points.length - 1);
  const stride = Math.max(1, Math.ceil(segmentCount / Math.max(1, maximum)));
  const result: PressureMaskSegment[] = [];
  for (let index = 0; index < object.points.length - 1; index += stride) {
    const endIndex = Math.min(object.points.length - 1, index + stride);
    const from = object.points[index]!;
    const to = object.points[endIndex]!;
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
    smoothing: 0.58 + smooth * 0.38,
    streamline: 0.12 + smooth * 0.5,
    simulatePressure: false,
    easing: (pressure) => applyPressureCurve(pressure, dynamics.pressureSensitivity),
    start: { cap: !flat, taper: 0 },
    end: { cap: !flat, taper: 0 },
    last: true
  }) as [number, number][];
  return svgPathFromOutline(outline);
}

function svgPathFromOutline(points: readonly (readonly [number, number])[]): string {
  if (points.length < 4) return "";
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
    const tipAngle =
      Math.hypot(tiltX, tiltY) >= 3 ? Math.atan2(tiltY, tiltX) : Math.PI / 4;
    const projected = tipProjection(kind, tipAngle, direction);
    return {
      x: point.x,
      y: point.y,
      nx: -ty,
      ny: tx,
      halfWidth: Math.max(
        0.14,
        (size * pressureWidth(point.pressure, dynamics) * projected) / 2
      )
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

function previewPressureOpacity(object: InkLike): number {
  const dynamics = object.dynamics ?? DEFAULT_DYNAMICS;
  if (!dynamics.pressureAffectsOpacity || !object.points.length) return 1;
  const start = Math.max(0, object.points.length - 8);
  let total = 0;
  for (let index = start; index < object.points.length; index++)
    total += applyPressureCurve(object.points[index]!.pressure, dynamics.pressureSensitivity);
  return 0.08 + (total / (object.points.length - start)) * 0.92;
}

function boundedInput(
  points: readonly RenderPoint[],
  complete: boolean,
  quality: InkRenderQuality
): readonly RenderPoint[] {
  if (complete) return points;
  const maximum = quality === "economy" ? 420 : 760;
  if (points.length <= maximum) return points;
  const result: RenderPoint[] = [{ ...points[0]! }];
  const stride = (points.length - 1) / (maximum - 1);
  for (let index = 1; index < maximum - 1; index++)
    result.push({ ...points[Math.min(points.length - 2, Math.round(index * stride))]! });
  result.push({ ...points.at(-1)! });
  return result;
}

function thinningForKind(kind: BrushKind): number {
  switch (kind) {
    case "highlighter":
      return 0.12;
    case "marker":
      return 0.35;
    case "graphite":
    case "graphite-soft":
      return 0.72;
    case "nib":
      return 0.78;
    case "paint":
      return 0.68;
    default:
      return 0.58;
  }
}

function brushKind(brushId: string | undefined, tool: InkObject["tool"]): BrushKind {
  switch (brushId) {
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
      return tool === "pencil" ? "graphite" : tool === "highlighter" ? "highlighter" : "ink";
  }
}

function fmt(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "0";
}
function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
