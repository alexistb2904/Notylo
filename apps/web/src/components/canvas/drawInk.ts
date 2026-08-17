import type { Point, Rect } from "@notylo/canvas-engine";
import type { InkDynamics, InkObject, InkPoint } from "@notylo/document-model";

type RenderPoint = Pick<InkPoint, "x" | "y" | "pressure" | "tiltX" | "tiltY">;
type BrushKind = "ink" | "nib" | "graphite" | "graphite-soft" | "marker" | "paint" | "highlighter";

const DEFAULT_DYNAMICS: InkDynamics = {
  pressureSensitivity: 0.5,
  pressureAffectsWidth: true,
  pressureAffectsOpacity: false,
  tiltAffectsAngle: false
};

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
  const sources = visibleBounds
    ? visibleInkRuns(object.points, visibleBounds, object.size * 2)
    : [object.points];
  context.save();
  context.fillStyle = object.color;
  context.strokeStyle = object.color;
  for (const source of sources) {
    const stabilized = stabilizeInkPath(source, object.smoothing ?? 0.55, isComplete);
    // Note-taking favors consistent latency over sub-pixel texture. Long live
    // strokes progressively reduce preview detail, then finish at normal quality.
    const liveDetailScale = isComplete ? 1 : Math.min(3, Math.max(1, source.length / 700));
    const spacing = brushRenderSpacing(kind, object.size) * liveDetailScale;
    const points = resampleInkPath(stabilized, spacing).map((point) => ({
      ...point,
      x: point.x + offset.x,
      y: point.y + offset.y
    }));
    for (let index = 0; index < points.length; index++) {
      const point = points[index]!;
      const previous = points[Math.max(0, index - 1)]!;
      const next = points[Math.min(points.length - 1, index + 1)]!;
      const direction = Math.atan2(next.y - previous.y, next.x - previous.x);
      const dab = getDabDynamics(point, dynamics, direction);
      const width = Math.max(0.24, object.size * dab.width);
      drawDab(context, kind, point, width, dab.angle, dab.opacity * alpha, index);
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

function brushRenderSpacing(kind: BrushKind, size: number): number {
  if (kind === "paint") return Math.max(3, size * 0.55);
  if (kind === "marker" || kind === "highlighter") return Math.max(2.2, size * 0.45);
  if (kind === "graphite" || kind === "graphite-soft") return Math.max(1.7, size * 0.5);
  if (kind === "nib") return Math.max(1.3, size * 0.4);
  return Math.max(1.05, size * 0.36);
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

function drawDab(
  context: CanvasRenderingContext2D,
  kind: BrushKind,
  point: RenderPoint,
  size: number,
  angle: number,
  opacity: number,
  index: number
): void {
  if (kind === "graphite" || kind === "graphite-soft") {
    drawGraphiteDab(context, point, size, angle, opacity, index, kind === "graphite-soft");
  } else if (kind === "paint") {
    drawPaintDab(context, point, size, angle, opacity, index);
  } else if (kind === "marker" || kind === "highlighter") {
    context.globalAlpha = opacity * (kind === "highlighter" ? 0.075 : 0.28);
    const ratio = kind === "highlighter" ? 0.34 : 0.48;
    context.beginPath();
    context.ellipse(point.x, point.y, size / 2, (size * ratio) / 2, angle, 0, Math.PI * 2);
    context.fill();
  } else {
    context.globalAlpha = opacity * (kind === "nib" ? 0.82 : 0.92);
    context.beginPath();
    context.ellipse(
      point.x,
      point.y,
      size / 2,
      size * (kind === "nib" ? 0.16 : 0.48),
      kind === "nib" ? angle + Math.PI / 4 : angle,
      0,
      Math.PI * 2
    );
    context.fill();
  }
}

function drawGraphiteDab(
  context: CanvasRenderingContext2D,
  point: RenderPoint,
  size: number,
  angle: number,
  opacity: number,
  index: number,
  soft: boolean
): void {
  const grains = soft ? 3 : 2;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  for (let grain = 0; grain < grains; grain++) {
    const noise = pseudoRandom(index * 17 + grain * 43);
    const second = pseudoRandom(index * 31 + grain * 71 + 9);
    const radius = size * (0.05 + pseudoRandom(index + grain * 13) * (soft ? 0.13 : 0.1));
    context.globalAlpha = opacity * (soft ? 0.16 : 0.12) * (0.55 + noise * 0.45);
    context.beginPath();
    const localX = (noise - 0.5) * size * 0.82;
    const localY = (second - 0.5) * size * 0.6;
    context.ellipse(
      point.x + localX * cosine - localY * sine,
      point.y + localX * sine + localY * cosine,
      Math.max(0.16, radius * 1.8),
      Math.max(0.12, radius),
      angle + noise * Math.PI,
      0,
      Math.PI * 2
    );
    context.fill();
  }
}

function drawPaintDab(
  context: CanvasRenderingContext2D,
  point: RenderPoint,
  size: number,
  angle: number,
  opacity: number,
  index: number
): void {
  const bristles = 3;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  for (let bristle = 0; bristle < bristles; bristle++) {
    const across = (bristle / (bristles - 1) - 0.5) * size;
    const dryGap = pseudoRandom(index * 19 + bristle * 101);
    if (dryGap < 0.12) continue;
    context.globalAlpha = opacity * (0.12 + dryGap * 0.13);
    context.beginPath();
    context.ellipse(
      point.x - across * sine,
      point.y + across * cosine,
      size * 0.28,
      Math.max(0.22, size * 0.055),
      angle,
      0,
      Math.PI * 2
    );
    context.fill();
  }
}

function pseudoRandom(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

/** Fixed-sample moving average modelled after Krita's freehand stabilizer. */
export function stabilizeInkPath(
  points: readonly RenderPoint[],
  smoothing: number,
  complete = false
): RenderPoint[] {
  if (points.length < 2 || smoothing <= 0) return points.map((point) => ({ ...point }));
  const amount = Math.min(1, Math.max(0, smoothing));
  const samples = resampleInkPath(points, 2);
  const sampleSize = 3 + Math.round(amount * amount * 29);
  const first = samples[0]!;
  const queue = Array.from({ length: sampleSize }, () => ({ ...first }));
  const result: RenderPoint[] = [{ ...first }];
  const pushSample = (sample: RenderPoint) => {
    let x = sample.x;
    let y = sample.y;
    let pressure = sample.pressure;
    let tiltX = sample.tiltX ?? 0;
    let tiltY = sample.tiltY ?? 0;
    for (let index = 1; index < queue.length; index++) {
      x += queue[index]!.x;
      y += queue[index]!.y;
      pressure += queue[index]!.pressure;
      tiltX += queue[index]!.tiltX ?? 0;
      tiltY += queue[index]!.tiltY ?? 0;
    }
    result.push({
      x: x / sampleSize,
      y: y / sampleSize,
      pressure: pressure / sampleSize,
      tiltX: tiltX / sampleSize,
      tiltY: tiltY / sampleSize
    });
    queue.shift();
    queue.push(sample);
  };
  for (let index = 1; index < samples.length; index++) pushSample(samples[index]!);
  if (complete) {
    const finalPoint = samples.at(-1)!;
    for (let index = 0; index < sampleSize; index++) pushSample(finalPoint);
  }
  return result;
}

function resampleInkPath(points: readonly RenderPoint[], spacing: number): RenderPoint[] {
  const result: RenderPoint[] = [{ ...points[0]! }];
  let previous: RenderPoint = { ...points[0]! };
  let remainder = 0;
  for (let index = 1; index < points.length; index++) {
    const target = points[index]!;
    let dx = target.x - previous.x;
    let dy = target.y - previous.y;
    let distance = Math.hypot(dx, dy);
    while (distance + remainder >= spacing && distance > 0) {
      const ratio = (spacing - remainder) / distance;
      previous = interpolatePoint(previous, target, ratio);
      result.push(previous);
      remainder = 0;
      dx = target.x - previous.x;
      dy = target.y - previous.y;
      distance = Math.hypot(dx, dy);
    }
    remainder += distance;
    previous = { ...target };
  }
  const finalPoint = points.at(-1)!;
  const last = result.at(-1)!;
  if (Math.hypot(finalPoint.x - last.x, finalPoint.y - last.y) > 0.001)
    result.push({ ...finalPoint });
  return result;
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
