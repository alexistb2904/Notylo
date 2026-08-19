import type { Point, Rect } from "@notylo/canvas-engine";
import type { InkDynamics, InkObject, InkPoint } from "@notylo/document-model";

type RenderPoint = Pick<InkPoint, "x" | "y" | "pressure" | "tiltX" | "tiltY">;
type BrushKind = "ink" | "nib" | "graphite" | "graphite-soft" | "marker" | "paint" | "highlighter";

interface StrokeSample extends RenderPoint {
  readonly halfWidth: number;
  readonly opacity: number;
  readonly angle: number;
  readonly nx: number;
  readonly ny: number;
}

const DEFAULT_DYNAMICS: InkDynamics = {
  pressureSensitivity: 0.5,
  pressureAffectsWidth: true,
  pressureAffectsOpacity: false,
  tiltAffectsAngle: false
};

const LIVE_SAMPLE_LIMIT = 720;
const COMPLETE_SAMPLE_LIMIT = 1800;
const completeSampleCache = new WeakMap<object, { readonly key: string; readonly samples: RenderPoint[] }>();

/**
 * Renders handwriting as a continuous variable-width ribbon instead of a
 * sequence of brush-tip stamps. This keeps edges continuous at high zoom and
 * dramatically reduces Canvas draw calls on long notes.
 */
export function drawInk(
  context: CanvasRenderingContext2D,
  object: Pick<InkObject, "color" | "size" | "tool" | "smoothing" | "brushId" | "dynamics"> & {
    readonly points: readonly RenderPoint[];
  },
  offset: Point,
  isComplete: boolean,
  alpha = 1,
  visibleBounds?: Rect
) {
  if (!object.points.length) return;
  const kind = brushKind(object.brushId, object.tool);
  const dynamics = object.dynamics ?? DEFAULT_DYNAMICS;
  const preparedStroke = prepareStrokeSamples(
    object.points,
    object.smoothing ?? 0.55,
    object.size,
    isComplete
  );
  const sources = visibleBounds
    ? visibleInkRuns(preparedStroke, visibleBounds, object.size * 2.5)
    : [preparedStroke];

  context.save();
  context.fillStyle = object.color;
  context.strokeStyle = object.color;
  context.lineJoin = "round";
  context.lineCap = "round";

  for (const source of sources) {
    if (!source.length) continue;
    const samples = buildStrokeSamples(source, object.size, dynamics, kind, offset);
    if (!samples.length) continue;

    if (kind === "graphite" || kind === "graphite-soft") {
      drawRibbon(context, samples, alpha * (kind === "graphite-soft" ? 0.52 : 0.4), dynamics);
      drawGraphiteTexture(context, samples, object.size, alpha, kind === "graphite-soft");
    } else if (kind === "paint") {
      drawRibbon(context, samples, alpha * 0.5, dynamics);
      drawPaintBristles(context, samples, object.size, alpha);
    } else if (kind === "highlighter") {
      drawRibbon(context, samples, alpha * 0.24, dynamics, true);
    } else if (kind === "marker") {
      drawRibbon(context, samples, alpha * 0.68, dynamics, true);
    } else if (kind === "nib") {
      drawRibbon(context, samples, alpha * 0.92, dynamics);
    } else {
      drawRibbon(context, samples, alpha * 0.96, dynamics);
    }
  }
  context.restore();
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

/** Maps raw PointerEvent pressure through a symmetric firm-to-soft curve. */
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

/**
 * O(n) stabilizer that rounds corners without the old fixed-size moving window.
 * The algorithm stays inside the input's convex hull and always preserves the
 * final pointer position, so live ink does not lag behind the stylus.
 */
export function stabilizeInkPath(
  points: readonly RenderPoint[],
  smoothing: number,
  _complete = false
): RenderPoint[] {
  if (points.length < 3 || smoothing <= 0) return points.map((point) => ({ ...point }));
  const amount = Math.min(1, Math.max(0, smoothing));
  const strength = 0.18 + amount * 0.54;
  const result: RenderPoint[] = [{ ...points[0]! }];

  for (let index = 1; index < points.length - 1; index++) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    const next = points[index + 1]!;
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

/**
 * Adaptive renderer sampling. Long live strokes are capped so a multi-minute
 * lecture note cannot make every animation frame progressively more expensive.
 */
export function prepareStrokeSamples(
  points: readonly RenderPoint[],
  smoothing: number,
  size: number,
  complete: boolean
): RenderPoint[] {
  if (points.length <= 1) return points.map((point) => ({ ...point }));
  const cacheKey = `${smoothing.toFixed(4)}:${size.toFixed(3)}`;
  if (complete) {
    const cached = completeSampleCache.get(points as object);
    if (cached?.key === cacheKey) return cached.samples;
  }
  // Bound the *input* work as well as the output geometry. Pointer coalescing can
  // produce tens of thousands of raw samples during a very long held stroke;
  // reprocessing all of them every frame would make latency grow with stroke age.
  const boundedInput = capRenderInput(points, complete ? 6000 : 1600);
  const stabilized = stabilizeInkPath(boundedInput, smoothing, complete);
  const length = pathLength(stabilized);
  const baseSpacing = Math.max(0.55, Math.min(2.2, size * 0.2));
  const sampleLimit = complete ? COMPLETE_SAMPLE_LIMIT : LIVE_SAMPLE_LIMIT;
  const adaptiveSpacing = Math.max(baseSpacing, length / sampleLimit);
  const samples = resampleInkPath(stabilized, adaptiveSpacing);
  if (complete) completeSampleCache.set(points as object, { key: cacheKey, samples });
  return samples;
}

function capRenderInput(points: readonly RenderPoint[], maximum: number): RenderPoint[] {
  if (points.length <= maximum) return points.map((point) => ({ ...point }));
  const result: RenderPoint[] = [{ ...points[0]! }];
  const stride = (points.length - 1) / (maximum - 1);
  for (let index = 1; index < maximum - 1; index++) {
    const sourceIndex = Math.min(points.length - 2, Math.round(index * stride));
    result.push({ ...points[sourceIndex]! });
  }
  result.push({ ...points.at(-1)! });
  return result;
}

function buildStrokeSamples(
  points: readonly RenderPoint[],
  size: number,
  dynamics: InkDynamics,
  kind: BrushKind,
  offset: Point
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
      x: point.x + offset.x,
      y: point.y + offset.y,
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

function drawRibbon(
  context: CanvasRenderingContext2D,
  samples: readonly StrokeSample[],
  alpha: number,
  dynamics: InkDynamics,
  flatCaps = false
): void {
  if (samples.length === 1) {
    const point = samples[0]!;
    context.globalAlpha = alpha * point.opacity;
    context.beginPath();
    if (flatCaps) {
      context.rect(
        point.x - point.halfWidth,
        point.y - point.halfWidth * 0.45,
        point.halfWidth * 2,
        point.halfWidth * 0.9
      );
    } else {
      context.arc(point.x, point.y, point.halfWidth, 0, Math.PI * 2);
    }
    context.fill();
    return;
  }

  if (dynamics.pressureAffectsOpacity) {
    drawVariableOpacityRibbon(context, samples, alpha);
    return;
  }

  context.globalAlpha = alpha;
  const left = samples.map((point) => ({
    x: point.x + point.nx * point.halfWidth,
    y: point.y + point.ny * point.halfWidth
  }));
  const right = samples.map((point) => ({
    x: point.x - point.nx * point.halfWidth,
    y: point.y - point.ny * point.halfWidth
  }));
  fillSmoothPolygon(context, left, right);

  if (!flatCaps) {
    for (const point of [samples[0]!, samples.at(-1)!]) {
      context.beginPath();
      context.arc(point.x, point.y, point.halfWidth, 0, Math.PI * 2);
      context.fill();
    }
  }
}

function drawVariableOpacityRibbon(
  context: CanvasRenderingContext2D,
  samples: readonly StrokeSample[],
  alpha: number
): void {
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
  for (const point of [samples[0]!, samples.at(-1)!]) {
    context.globalAlpha = alpha * point.opacity;
    context.beginPath();
    context.arc(point.x, point.y, point.halfWidth, 0, Math.PI * 2);
    context.fill();
  }
}

function fillSmoothPolygon(
  context: CanvasRenderingContext2D,
  left: readonly Point[],
  right: readonly Point[]
): void {
  if (!left.length || !right.length) return;
  context.beginPath();
  context.moveTo(left[0]!.x, left[0]!.y);
  traceSmoothEdge(context, left);
  const reverse = [...right].reverse();
  context.lineTo(reverse[0]!.x, reverse[0]!.y);
  traceSmoothEdge(context, reverse);
  context.closePath();
  context.fill();
}

function traceSmoothEdge(context: CanvasRenderingContext2D, points: readonly Point[]): void {
  if (points.length < 2) return;
  for (let index = 1; index < points.length - 1; index++) {
    const point = points[index]!;
    const next = points[index + 1]!;
    context.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
  }
  const last = points.at(-1)!;
  context.lineTo(last.x, last.y);
}

function drawGraphiteTexture(
  context: CanvasRenderingContext2D,
  samples: readonly StrokeSample[],
  size: number,
  alpha: number,
  soft: boolean
): void {
  if (samples.length < 2) return;
  const stride = Math.max(3, Math.ceil(samples.length / (soft ? 150 : 110)));
  context.lineCap = "round";
  context.lineWidth = Math.max(0.22, size * (soft ? 0.055 : 0.045));
  for (let index = 1; index < samples.length - 1; index += stride) {
    const point = samples[index]!;
    const noise = pseudoRandom(index * 37 + Math.round(point.x * 3) + Math.round(point.y * 5));
    const across = (noise - 0.5) * point.halfWidth * 1.5;
    const length = Math.max(0.7, size * (0.22 + pseudoRandom(index * 71) * 0.35));
    const tangentX = point.ny;
    const tangentY = -point.nx;
    context.globalAlpha = alpha * point.opacity * (soft ? 0.22 : 0.16);
    context.beginPath();
    context.moveTo(
      point.x + point.nx * across - tangentX * length * 0.5,
      point.y + point.ny * across - tangentY * length * 0.5
    );
    context.lineTo(
      point.x + point.nx * across + tangentX * length * 0.5,
      point.y + point.ny * across + tangentY * length * 0.5
    );
    context.stroke();
  }
}

function drawPaintBristles(
  context: CanvasRenderingContext2D,
  samples: readonly StrokeSample[],
  size: number,
  alpha: number
): void {
  if (samples.length < 2) return;
  context.lineCap = "round";
  context.lineJoin = "round";
  for (const lane of [-0.58, 0, 0.58]) {
    context.globalAlpha = alpha * (lane === 0 ? 0.24 : 0.16);
    context.lineWidth = Math.max(0.32, size * (lane === 0 ? 0.075 : 0.055));
    context.beginPath();
    samples.forEach((point, index) => {
      const wobble = (pseudoRandom(index * 53 + Math.round((lane + 1) * 100)) - 0.5) * 0.12;
      const offset = point.halfWidth * (lane + wobble);
      const x = point.x + point.nx * offset;
      const y = point.y + point.ny * offset;
      if (!index) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
  }
}

function pseudoRandom(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function pathLength(points: readonly RenderPoint[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index++) {
    total += Math.hypot(points[index]!.x - points[index - 1]!.x, points[index]!.y - points[index - 1]!.y);
  }
  return total;
}

function resampleInkPath(points: readonly RenderPoint[], spacing: number): RenderPoint[] {
  const result: RenderPoint[] = [{ ...points[0]! }];
  let segmentStart: RenderPoint = { ...points[0]! };
  let carried = 0;

  for (let index = 1; index < points.length; index++) {
    const target = points[index]!;
    let dx = target.x - segmentStart.x;
    let dy = target.y - segmentStart.y;
    let distance = Math.hypot(dx, dy);

    while (distance + carried >= spacing && distance > 0) {
      const ratio = (spacing - carried) / distance;
      segmentStart = interpolatePoint(segmentStart, target, ratio);
      result.push(segmentStart);
      carried = 0;
      dx = target.x - segmentStart.x;
      dy = target.y - segmentStart.y;
      distance = Math.hypot(dx, dy);
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
    tiltY: mix(start.tiltY, end.tiltY)
  };
}
