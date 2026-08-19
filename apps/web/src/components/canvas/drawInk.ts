import type { Point, Rect } from "@notylo/canvas-engine";
import type { InkDynamics, InkObject, InkPoint } from "@notylo/document-model";

type RenderPoint = Pick<
  InkPoint,
  "x" | "y" | "pressure" | "tiltX" | "tiltY" | "timestamp"
>;
type BrushKind =
  | "ink"
  | "nib"
  | "graphite"
  | "graphite-soft"
  | "marker"
  | "paint"
  | "highlighter";
export type InkRenderQuality = "economy" | "full";

interface StrokeSample extends RenderPoint {
  readonly halfWidth: number;
  readonly opacity: number;
  readonly angle: number;
  readonly nx: number;
  readonly ny: number;
}
interface StrokeGeometry {
  readonly samples: readonly StrokeSample[];
  readonly body?: Path2D;
  readonly texture?: Path2D;
  readonly bristles?: readonly Path2D[];
}

const DEFAULT_DYNAMICS: InkDynamics = {
  pressureSensitivity: 0.5,
  pressureAffectsWidth: true,
  pressureAffectsOpacity: false,
  tiltAffectsAngle: false
};
const preparedCache = new WeakMap<object, { readonly key: string; readonly samples: RenderPoint[] }>();
const geometryCache = new WeakMap<object, { readonly key: string; readonly geometry: StrokeGeometry }>();

/** Finished strokes compile to cached continuous Path2D geometry. */
export function drawInk(
  context: CanvasRenderingContext2D,
  object: Pick<InkObject, "color" | "size" | "tool" | "smoothing" | "brushId" | "dynamics"> & {
    readonly points: readonly RenderPoint[];
  },
  offset: Point,
  isComplete: boolean,
  alpha = 1,
  _visibleBounds?: Rect,
  quality: InkRenderQuality = "full"
) {
  if (!object.points.length) return;
  const kind = brushKind(object.brushId, object.tool);
  const dynamics = object.dynamics ?? DEFAULT_DYNAMICS;
  const geometry = isComplete
    ? completeGeometry(object, kind, dynamics, quality)
    : buildGeometry(
        prepareStrokeSamples(object.points, object.smoothing ?? 0.55, object.size, false, quality),
        object.size,
        dynamics,
        kind,
        quality
      );
  if (!geometry.samples.length) return;

  context.save();
  context.translate(offset.x, offset.y);
  context.fillStyle = object.color;
  context.strokeStyle = object.color;
  context.lineJoin = "round";
  context.lineCap = "round";

  if (dynamics.pressureAffectsOpacity) {
    drawVariableOpacityRibbon(context, geometry.samples, baseAlpha(kind) * alpha, isFlat(kind));
  } else if (geometry.body) {
    context.globalAlpha = baseAlpha(kind) * alpha;
    context.fill(geometry.body);
  }
  if (geometry.texture) {
    context.globalAlpha = alpha * (kind === "graphite-soft" ? 0.18 : 0.13);
    context.lineWidth = Math.max(0.22, object.size * (kind === "graphite-soft" ? 0.06 : 0.045));
    context.stroke(geometry.texture);
  }
  if (geometry.bristles) {
    geometry.bristles.forEach((path, index) => {
      context.globalAlpha = alpha * (index === 0 ? 0.2 : 0.13);
      context.lineWidth = Math.max(0.3, object.size * (index === 0 ? 0.07 : 0.05));
      context.stroke(path);
    });
  }
  context.restore();
}

function completeGeometry(
  object: Pick<InkObject, "points" | "size" | "smoothing" | "brushId" | "tool" | "dynamics">,
  kind: BrushKind,
  dynamics: InkDynamics,
  quality: InkRenderQuality
): StrokeGeometry {
  const key = geometryKey(object, kind, dynamics, quality);
  const cacheKey = object.points as object;
  const cached = geometryCache.get(cacheKey);
  if (cached?.key === key) return cached.geometry;
  const samples = prepareStrokeSamples(
    object.points,
    object.smoothing ?? 0.55,
    object.size,
    true,
    quality
  );
  const geometry = buildGeometry(samples, object.size, dynamics, kind, quality);
  geometryCache.set(cacheKey, { key, geometry });
  return geometry;
}
function geometryKey(
  object: Pick<InkObject, "size" | "smoothing" | "brushId" | "tool">,
  kind: BrushKind,
  dynamics: InkDynamics,
  quality: InkRenderQuality
): string {
  return [
    kind,
    object.brushId ?? object.tool,
    object.size.toFixed(3),
    (object.smoothing ?? 0.55).toFixed(3),
    dynamics.pressureSensitivity.toFixed(3),
    dynamics.pressureAffectsWidth ? 1 : 0,
    dynamics.pressureAffectsOpacity ? 1 : 0,
    dynamics.tiltAffectsAngle ? 1 : 0,
    quality
  ].join(":");
}
function buildGeometry(
  points: readonly RenderPoint[],
  size: number,
  dynamics: InkDynamics,
  kind: BrushKind,
  quality: InkRenderQuality
): StrokeGeometry {
  const samples = buildStrokeSamples(points, size, dynamics, kind);
  if (!samples.length) return { samples };
  const body = dynamics.pressureAffectsOpacity ? undefined : createRibbonPath(samples, isFlat(kind));
  const texture =
    kind === "graphite" || kind === "graphite-soft"
      ? createGraphiteTexture(samples, quality, kind === "graphite-soft")
      : undefined;
  const bristles = kind === "paint" ? createPaintBristles(samples, quality) : undefined;
  return {
    samples,
    ...(body ? { body } : {}),
    ...(texture ? { texture } : {}),
    ...(bristles?.length ? { bristles } : {})
  };
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
    case "ink-fineliner":
      return "ink";
    default:
      return tool === "pencil" ? "graphite" : tool === "highlighter" ? "highlighter" : "ink";
  }
}
function baseAlpha(kind: BrushKind): number {
  switch (kind) {
    case "graphite":
      return 0.45;
    case "graphite-soft":
      return 0.56;
    case "paint":
      return 0.58;
    case "highlighter":
      return 0.24;
    case "marker":
      return 0.7;
    case "nib":
      return 0.94;
    default:
      return 0.98;
  }
}
function isFlat(kind: BrushKind): boolean {
  return kind === "marker" || kind === "highlighter";
}

export function visibleInkRuns(
  points: readonly RenderPoint[],
  bounds: Rect,
  padding: number
): readonly (readonly RenderPoint[])[] {
  if (points.length < 2) return points.length ? [points] : [];
  const expanded = {
    x: bounds.x - padding,
    y: bounds.y - padding,
    width: bounds.width + padding * 2,
    height: bounds.height + padding * 2
  };
  const kept = new Uint8Array(points.length);
  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index]!;
    const end = points[index + 1]!;
    const left = Math.min(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const right = Math.max(start.x, end.x);
    const bottom = Math.max(start.y, end.y);
    if (
      left <= expanded.x + expanded.width &&
      right >= expanded.x &&
      top <= expanded.y + expanded.height &&
      bottom >= expanded.y
    ) {
      kept[index] = 1;
      kept[index + 1] = 1;
    }
  }
  const runs: RenderPoint[][] = [];
  let index = 0;
  while (index < points.length) {
    while (index < points.length && !kept[index]) index++;
    if (index >= points.length) break;
    const start = Math.max(0, index - 1);
    while (index < points.length && kept[index]) index++;
    const end = Math.min(points.length, index + 1);
    runs.push(points.slice(start, end));
  }
  return runs;
}

export function applyPressureCurve(pressure: number, sensitivity: number): number {
  const input = Math.min(1, Math.max(0, pressure));
  const setting = Math.min(1, Math.max(0, sensitivity));
  return Math.pow(input, Math.pow(2, 1 - setting * 2));
}
export function getDabDynamics(
  point: Pick<InkPoint, "pressure" | "tiltX" | "tiltY">,
  dynamics: InkDynamics,
  fallbackAngle = 0
): { width: number; opacity: number; angle: number } {
  const pressure = applyPressureCurve(point.pressure, dynamics.pressureSensitivity);
  const tiltX = point.tiltX ?? 0;
  const tiltY = point.tiltY ?? 0;
  const hasTilt = Math.hypot(tiltX, tiltY) >= 3;
  return {
    width: dynamics.pressureAffectsWidth ? 0.14 + pressure * 0.86 : 1,
    opacity: dynamics.pressureAffectsOpacity ? 0.08 + pressure * 0.92 : 1,
    angle: dynamics.tiltAffectsAngle && hasTilt ? Math.atan2(tiltY, tiltX) : fallbackAngle
  };
}

/** Non-predictive, speed-adaptive smoothing: no overshoot and exact last tip position. */
export function stabilizeInkPath(
  points: readonly RenderPoint[],
  smoothing: number,
  _complete = false
): RenderPoint[] {
  if (points.length < 3 || smoothing <= 0) return points.map((point) => ({ ...point }));
  const amount = Math.min(1, Math.max(0, smoothing));
  const baseStrength = 0.16 + amount * 0.56;
  const result: RenderPoint[] = [{ ...points[0]! }];
  for (let index = 1; index < points.length - 1; index++) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    const next = points[index + 1]!;
    const dt = Math.max(1, next.timestamp - previous.timestamp);
    const speed = Math.hypot(next.x - previous.x, next.y - previous.y) / dt;
    const speedFactor = Math.min(1, speed / 1.6);
    const strength = baseStrength * (1 - speedFactor * 0.42);
    const localTarget = interpolatePoint(
      midpointPoint(previous, current),
      midpointPoint(current, next),
      0.5
    );
    result.push(interpolatePoint(current, localTarget, strength));
  }
  result.push({ ...points.at(-1)! });
  return result;
}

export function prepareStrokeSamples(
  points: readonly RenderPoint[],
  smoothing: number,
  size: number,
  complete: boolean,
  quality: InkRenderQuality = "full"
): RenderPoint[] {
  if (points.length <= 1) return points.map((point) => ({ ...point }));
  const last = points.at(-1)!;
  const cacheKey = `${points.length}:${last.x.toFixed(2)}:${last.y.toFixed(2)}:${smoothing.toFixed(3)}:${size.toFixed(2)}:${complete ? 1 : 0}:${quality}`;
  const sourceKey = points as object;
  const cached = preparedCache.get(sourceKey);
  if (cached?.key === cacheKey) return cached.samples;
  const inputLimit = complete
    ? quality === "economy"
      ? 3200
      : 5000
    : quality === "economy"
      ? 700
      : 1100;
  const boundedInput = capRenderInput(points, inputLimit);
  const stabilized = stabilizeInkPath(boundedInput, smoothing, complete);
  const length = pathLength(stabilized);
  const baseSpacing =
    quality === "economy"
      ? Math.max(0.55, Math.min(1.8, size * 0.16))
      : Math.max(0.38, Math.min(1.5, size * 0.12));
  const sampleLimit = complete
    ? quality === "economy"
      ? 560
      : 900
    : quality === "economy"
      ? 260
      : 420;
  const samples = resampleInkPath(stabilized, Math.max(baseSpacing, length / sampleLimit));
  preparedCache.set(sourceKey, { key: cacheKey, samples });
  return samples;
}
function capRenderInput(points: readonly RenderPoint[], maximum: number): RenderPoint[] {
  if (points.length <= maximum) return points.map((point) => ({ ...point }));
  const result: RenderPoint[] = [{ ...points[0]! }];
  const stride = (points.length - 1) / (maximum - 1);
  for (let index = 1; index < maximum - 1; index++)
    result.push({ ...points[Math.min(points.length - 2, Math.round(index * stride))]! });
  result.push({ ...points.at(-1)! });
  return result;
}
function buildStrokeSamples(
  points: readonly RenderPoint[],
  size: number,
  dynamics: InkDynamics,
  kind: BrushKind
): StrokeSample[] {
  return points.map((point, index) => {
    const previous = points[Math.max(0, index - 1)]!;
    const next = points[Math.min(points.length - 1, index + 1)]!;
    let tx = next.x - previous.x;
    let ty = next.y - previous.y;
    const length = Math.hypot(tx, ty) || 1;
    tx /= length;
    ty /= length;
    const direction = Math.atan2(ty, tx);
    const fallbackAngle = kind === "nib" ? Math.PI / 4 : direction + Math.PI / 2;
    const dab = getDabDynamics(point, dynamics, fallbackAngle);
    const projected = tipProjection(kind, dab.angle, direction);
    return {
      ...point,
      halfWidth: Math.max(0.14, (size * dab.width * projected) / 2),
      opacity: dab.opacity,
      angle: dab.angle,
      nx: -ty,
      ny: tx
    };
  });
}
function tipProjection(kind: BrushKind, tipAngle: number, direction: number): number {
  if (kind !== "nib" && kind !== "marker" && kind !== "highlighter") return 1;
  const ratio = kind === "nib" ? 0.34 : kind === "highlighter" ? 0.5 : 0.64;
  const delta = direction - tipAngle;
  return Math.max(ratio, Math.sqrt(Math.sin(delta) ** 2 + ratio * ratio * Math.cos(delta) ** 2));
}

function createRibbonPath(samples: readonly StrokeSample[], flatCaps: boolean): Path2D {
  const path = new Path2D();
  if (samples.length === 1) {
    const point = samples[0]!;
    if (flatCaps)
      path.rect(
        point.x - point.halfWidth,
        point.y - point.halfWidth * 0.45,
        point.halfWidth * 2,
        point.halfWidth * 0.9
      );
    else path.arc(point.x, point.y, point.halfWidth, 0, Math.PI * 2);
    return path;
  }
  const left = samples.map((point) => ({
    x: point.x + point.nx * point.halfWidth,
    y: point.y + point.ny * point.halfWidth
  }));
  const right = samples.map((point) => ({
    x: point.x - point.nx * point.halfWidth,
    y: point.y - point.ny * point.halfWidth
  }));
  path.moveTo(left[0]!.x, left[0]!.y);
  traceSmoothEdge(path, left);
  const reverse = [...right].reverse();
  path.lineTo(reverse[0]!.x, reverse[0]!.y);
  traceSmoothEdge(path, reverse);
  path.closePath();
  if (!flatCaps) {
    const first = samples[0]!;
    const last = samples.at(-1)!;
    path.moveTo(first.x + first.halfWidth, first.y);
    path.arc(first.x, first.y, first.halfWidth, 0, Math.PI * 2);
    path.moveTo(last.x + last.halfWidth, last.y);
    path.arc(last.x, last.y, last.halfWidth, 0, Math.PI * 2);
  }
  return path;
}
function traceSmoothEdge(path: Path2D, points: readonly Point[]): void {
  if (points.length < 2) return;
  for (let index = 1; index < points.length - 1; index++) {
    const point = points[index]!;
    const next = points[index + 1]!;
    path.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
  }
  const last = points.at(-1)!;
  path.lineTo(last.x, last.y);
}
function drawVariableOpacityRibbon(
  context: CanvasRenderingContext2D,
  samples: readonly StrokeSample[],
  alpha: number,
  flatCaps: boolean
): void {
  if (samples.length === 1) {
    drawOpacityCap(context, samples[0]!, alpha, flatCaps);
    return;
  }
  for (let index = 0; index < samples.length - 1; index++) {
    const a = samples[index]!;
    const b = samples[index + 1]!;
    context.globalAlpha = alpha * (a.opacity + b.opacity) * 0.5;
    context.beginPath();
    context.moveTo(a.x + a.nx * a.halfWidth, a.y + a.ny * a.halfWidth);
    context.lineTo(b.x + b.nx * b.halfWidth, b.y + b.ny * b.halfWidth);
    context.lineTo(b.x - b.nx * b.halfWidth, b.y - b.ny * b.halfWidth);
    context.lineTo(a.x - a.nx * a.halfWidth, a.y - a.ny * a.halfWidth);
    context.closePath();
    context.fill();
  }
  if (!flatCaps) {
    drawOpacityCap(context, samples[0]!, alpha, false);
    drawOpacityCap(context, samples.at(-1)!, alpha, false);
  }
}
function drawOpacityCap(
  context: CanvasRenderingContext2D,
  point: StrokeSample,
  alpha: number,
  flat: boolean
) {
  context.globalAlpha = alpha * point.opacity;
  context.beginPath();
  if (flat)
    context.rect(
      point.x - point.halfWidth,
      point.y - point.halfWidth * 0.45,
      point.halfWidth * 2,
      point.halfWidth * 0.9
    );
  else context.arc(point.x, point.y, point.halfWidth, 0, Math.PI * 2);
  context.fill();
}

function createGraphiteTexture(
  samples: readonly StrokeSample[],
  quality: InkRenderQuality,
  soft: boolean
): Path2D | undefined {
  if (samples.length < 2) return undefined;
  const path = new Path2D();
  const targetMarks = quality === "economy" ? (soft ? 26 : 20) : soft ? 58 : 44;
  const stride = Math.max(2, Math.ceil(samples.length / targetMarks));
  let marks = 0;
  for (let index = 1; index < samples.length - 1; index += stride) {
    const point = samples[index]!;
    const noise = pseudoRandom(index * 37 + Math.round(point.x * 3) + Math.round(point.y * 5));
    const across = (noise - 0.5) * point.halfWidth * 1.45;
    const length = Math.max(0.7, point.halfWidth * (0.45 + pseudoRandom(index * 71) * 0.6));
    const tangentX = point.ny;
    const tangentY = -point.nx;
    path.moveTo(
      point.x + point.nx * across - tangentX * length * 0.5,
      point.y + point.ny * across - tangentY * length * 0.5
    );
    path.lineTo(
      point.x + point.nx * across + tangentX * length * 0.5,
      point.y + point.ny * across + tangentY * length * 0.5
    );
    marks++;
  }
  return marks ? path : undefined;
}
function createPaintBristles(
  samples: readonly StrokeSample[],
  quality: InkRenderQuality
): readonly Path2D[] {
  if (samples.length < 2) return [];
  const lanes = quality === "economy" ? [0] : [-0.48, 0.48];
  return lanes.map((lane, laneIndex) => {
    const path = new Path2D();
    samples.forEach((point, index) => {
      const wobble = (pseudoRandom(index * 53 + laneIndex * 101) - 0.5) * 0.08;
      const offset = point.halfWidth * (lane + wobble);
      const x = point.x + point.nx * offset;
      const y = point.y + point.ny * offset;
      if (!index) path.moveTo(x, y);
      else if (index < samples.length - 1) {
        const next = samples[index + 1]!;
        const nextOffset = next.halfWidth * (lane + wobble);
        path.quadraticCurveTo(
          x,
          y,
          (x + next.x + next.nx * nextOffset) / 2,
          (y + next.y + next.ny * nextOffset) / 2
        );
      } else path.lineTo(x, y);
    });
    return path;
  });
}
function pseudoRandom(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}
function pathLength(points: readonly RenderPoint[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index++)
    total += Math.hypot(points[index]!.x - points[index - 1]!.x, points[index]!.y - points[index - 1]!.y);
  return total;
}
function resampleInkPath(points: readonly RenderPoint[], spacing: number): RenderPoint[] {
  const result: RenderPoint[] = [{ ...points[0]! }];
  let segmentStart: RenderPoint = { ...points[0]! };
  let carried = 0;
  for (let index = 1; index < points.length; index++) {
    const target = points[index]!;
    let distance = Math.hypot(target.x - segmentStart.x, target.y - segmentStart.y);
    while (distance + carried >= spacing && distance > 1e-9) {
      const ratio = (spacing - carried) / distance;
      segmentStart = interpolatePoint(segmentStart, target, ratio);
      result.push(segmentStart);
      carried = 0;
      distance = Math.hypot(target.x - segmentStart.x, target.y - segmentStart.y);
    }
    carried += distance;
    segmentStart = { ...target };
  }
  const finalPoint = points.at(-1)!;
  const last = result.at(-1)!;
  if (Math.hypot(finalPoint.x - last.x, finalPoint.y - last.y) > 0.001)
    result.push({ ...finalPoint });
  return result;
}
function midpointPoint(a: RenderPoint, b: RenderPoint): RenderPoint {
  return interpolatePoint(a, b, 0.5);
}
function interpolatePoint(start: RenderPoint, end: RenderPoint, ratio: number): RenderPoint {
  const mix = (a: number | undefined, b: number | undefined) =>
    (a ?? 0) + ((b ?? 0) - (a ?? 0)) * ratio;
  return {
    x: mix(start.x, end.x),
    y: mix(start.y, end.y),
    pressure: mix(start.pressure, end.pressure),
    tiltX: mix(start.tiltX, end.tiltX),
    tiltY: mix(start.tiltY, end.tiltY),
    timestamp: mix(start.timestamp, end.timestamp)
  };
}
