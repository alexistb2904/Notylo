import { describe, expect, it } from "vitest";
import type { InkObject } from "@notylo/document-model";
import {
  getInkBrushKind,
  getInkSvgPathData,
  getInkTexture,
  getInkVisual,
  getPressureMaskSegments,
  stabilizeInkPoints,
  stabilizeInkTrajectory,
  streamlineScaleForCapture
} from "./inkVector";

const makeInk = (
  pressures: readonly number[],
  pressureOpacity = false,
  brushId = "ink-fineliner",
  tiltAffectsAngle = false
): InkObject => ({
  id: "ink_vector",
  notebookId: "nb",
  type: "ink",
  x: 0,
  y: 0,
  width: 120,
  height: 20,
  rotation: 0,
  zIndex: 1,
  opacity: 1,
  locked: false,
  hidden: false,
  createdAt: 1,
  updatedAt: 1,
  color: "#111",
  size: 5,
  tool: brushId.startsWith("pencil")
    ? "pencil"
    : brushId.startsWith("highlighter")
      ? "highlighter"
      : "pen",
  smoothing: 0.6,
  brushId,
  dynamics: {
    pressureSensitivity: 0.5,
    pressureAffectsWidth: true,
    pressureAffectsOpacity: pressureOpacity,
    tiltAffectsAngle
  },
  points: pressures.map((pressure, index) => ({
    x: index * 30,
    y: index % 2 ? 0.4 : -0.4,
    pressure,
    tiltX: tiltAffectsAngle ? index * 8 : 0,
    tiltY: tiltAffectsAngle ? 35 - index * 4 : 0,
    timestamp: index * 8
  }))
});

describe("note-taking vector ink engine", () => {
  it("uses exactly the same geometry live and after pointer-up", () => {
    const ink = makeInk([0.2, 0.5, 0.8, 0.6, 0.55]);
    const live = getInkSvgPathData(ink, false, "economy");
    const committed = getInkSvgPathData(ink, true, "full");
    expect(live).toBe(committed);
  });

  it("produces one closed SVG outline instead of raster dabs", () => {
    const path = getInkSvgPathData(makeInk([0.2, 0.5, 0.8, 0.6]));
    expect(path.startsWith("M")).toBe(true);
    expect(path.endsWith("Z")).toBe(true);
    expect(path.length).toBeGreaterThan(20);
    expect((path.match(/M/g) ?? [])).toHaveLength(1);
  });

  it("never moves stylus x/y while smoothing pressure and tilt sensors", () => {
    const source = [
      { x: 0, y: 0, pressure: 0.1, tiltX: 0, tiltY: 0, timestamp: 0 },
      { x: 12, y: 0, pressure: 0.9, tiltX: 20, tiltY: 4, timestamp: 8 },
      { x: 24, y: 0, pressure: 0.2, tiltX: -10, tiltY: 18, timestamp: 16 },
      // Deliberately abrupt 90° corner: this used to trigger velocity catch-up snapping.
      { x: 24, y: 12, pressure: 0.8, tiltX: 30, tiltY: -20, timestamp: 24 },
      { x: 24, y: 24, pressure: 0.4, tiltX: 4, tiltY: 8, timestamp: 32 }
    ];
    const filtered = stabilizeInkPoints(source, 0.7, 2.4);

    expect(filtered.map(({ x, y }) => ({ x, y }))).toEqual(
      source.map(({ x, y }) => ({ x, y }))
    );
    expect(filtered[1]!.pressure).toBeGreaterThan(source[0]!.pressure);
    expect(filtered[1]!.pressure).toBeLessThan(source[1]!.pressure);
    expect(filtered[1]!.tiltX).toBeGreaterThan(0);
    expect(filtered[1]!.tiltX).toBeLessThan(20);
  });

  it("never rewrites earlier prepared samples when a point is appended", () => {
    const source = Array.from({ length: 24 }, (_, index) => ({
      x: index * 2,
      y: Math.sin(index / 4),
      pressure: 0.3 + (index % 5) * 0.1,
      tiltX: index,
      tiltY: 20 - index / 2,
      timestamp: index * 8
    }));
    const first = stabilizeInkPoints(source, 0.55, 2.4);
    const extended = stabilizeInkPoints(
      [...source, { x: 48, y: 14, pressure: 0.8, tiltX: 30, tiltY: -5, timestamp: 192 }],
      0.55,
      2.4
    );
    expect(extended.slice(0, source.length)).toEqual(first);
  });

  it("reduces streamline latency for precision handwriting captured at high zoom", () => {
    expect(streamlineScaleForCapture(undefined)).toBe(1);
    expect(streamlineScaleForCapture(1)).toBe(1);
    expect(streamlineScaleForCapture(5)).toBeLessThan(0.5);
    expect(streamlineScaleForCapture(10)).toBeGreaterThanOrEqual(0.32);
  });

  it("keeps high-zoom precision geometry identical live and committed", () => {
    const template = makeInk([0.45, 0.55, 0.5, 0.6, 0.48, 0.52]);
    const tightGlyph: InkObject = {
      ...template,
      captureZoom: 5,
      points: [
        { x: 0, y: 0, pressure: 0.5, timestamp: 0 },
        { x: 2.2, y: -4, pressure: 0.52, timestamp: 8 },
        { x: 4.2, y: 0.2, pressure: 0.48, timestamp: 16 },
        { x: 2.3, y: 4.4, pressure: 0.55, timestamp: 24 },
        { x: 0.4, y: 0.7, pressure: 0.5, timestamp: 32 },
        { x: 5.6, y: 0.1, pressure: 0.51, timestamp: 40 }
      ]
    };
    const normalZoom = { ...tightGlyph, captureZoom: 1 };
    const live = getInkSvgPathData(tightGlyph, false, "economy");
    const committed = getInkSvgPathData(tightGlyph, true, "full");
    expect(live).toBe(committed);
    expect(live).not.toBe(getInkSvgPathData(normalZoom));
  });

  it("keeps real pressure in the vector geometry", () => {
    const light = getInkSvgPathData(makeInk([0.15, 0.15, 0.15, 0.15]));
    const heavy = getInkSvgPathData(makeInk([0.9, 0.9, 0.9, 0.9]));
    expect(heavy).not.toBe(light);
  });

  it("maps every brush preset to its own renderer profile", () => {
    expect(getInkBrushKind(makeInk([0.5], false, "ink-fineliner"))).toBe("ink");
    expect(getInkBrushKind(makeInk([0.5], false, "ink-calligraphy"))).toBe("nib");
    expect(getInkBrushKind(makeInk([0.5], false, "marker-medium"))).toBe("marker");
    expect(getInkBrushKind(makeInk([0.5], false, "wet-paint"))).toBe("paint");
    expect(getInkBrushKind(makeInk([0.5], false, "pencil-sketch"))).toBe("graphite");
    expect(getInkBrushKind(makeInk([0.5], false, "pencil-2b"))).toBe("graphite-soft");
    expect(getInkBrushKind(makeInk([0.5], false, "highlighter-flat"))).toBe("highlighter");
  });

  it("removes a local trajectory wobble while retaining the exact endpoints", () => {
    const source = [
      { x: 0, y: 0, pressure: 0.5, timestamp: 0 },
      { x: 10, y: 0, pressure: 0.5, timestamp: 8 },
      { x: 20, y: 7, pressure: 0.5, timestamp: 16 },
      { x: 30, y: 0, pressure: 0.5, timestamp: 24 },
      { x: 40, y: 0, pressure: 0.5, timestamp: 32 }
    ];
    const stabilized = stabilizeInkTrajectory(source, 0.8);
    expect(stabilized[0]).toMatchObject({ x: 0, y: 0 });
    expect(stabilized.at(-1)).toMatchObject({ x: 40, y: 0 });
    expect(stabilized[2]!.y).toBeLessThan(source[2]!.y);
  });

  it("makes pen pencil and highlighter genuinely different", () => {
    const pen = makeInk([0.3, 0.5, 0.7, 0.5], false, "ink-fineliner");
    const pencil = makeInk([0.3, 0.5, 0.7, 0.5], false, "pencil-sketch");
    const highlighter = makeInk([0.3, 0.5, 0.7, 0.5], false, "highlighter-flat");

    expect(getInkVisual(pen)).toMatchObject({ baseAlpha: 1, multiply: false });
    expect(getInkTexture(pen)).toBeUndefined();

    expect(getInkVisual(pencil).baseAlpha).toBeLessThan(1);
    expect(getInkVisual(pencil).multiply).toBe(true);
    expect(getInkTexture(pencil)?.d).toBeTruthy();

    expect(getInkVisual(highlighter).baseAlpha).toBeLessThan(0.3);
    expect(getInkVisual(highlighter).multiply).toBe(true);
    expect(getInkTexture(highlighter)).toBeUndefined();

    expect(getInkSvgPathData(pen)).not.toBe(getInkSvgPathData(pencil));
    expect(getInkSvgPathData(pen)).not.toBe(getInkSvgPathData(highlighter));
  });

  it("lets stylus tilt change pencil grain direction without moving the main outline", () => {
    const untilted = makeInk([0.5, 0.5, 0.5, 0.5], false, "pencil-sketch", false);
    const tilted = makeInk([0.5, 0.5, 0.5, 0.5], false, "pencil-sketch", true);
    expect(getInkSvgPathData(tilted)).toBe(getInkSvgPathData(untilted));
    expect(getInkTexture(tilted)?.d).not.toBe(getInkTexture(untilted)?.d);
  });

  it("keeps pencil texture density tied to geometry rather than input sample count", () => {
    const template = makeInk([0.5, 0.5], false, "pencil-sketch");
    const line = (count: number): InkObject => ({
      ...template,
      points: Array.from({ length: count }, (_, index) => ({
        x: (120 * index) / (count - 1),
        y: 0,
        pressure: 0.5,
        tiltX: 0,
        tiltY: 0,
        timestamp: index * (120 / Math.max(1, count - 1))
      }))
    });
    const sparse = getInkTexture(line(7))?.d ?? "";
    const dense = getInkTexture(line(61))?.d ?? "";
    const sparseMarks = (sparse.match(/M/g) ?? []).length;
    const denseMarks = (dense.match(/M/g) ?? []).length;
    expect(sparseMarks).toBeGreaterThan(3);
    expect(Math.abs(sparseMarks - denseMarks)).toBeLessThanOrEqual(1);
  });

  it("bounds pressure-opacity SVG mask complexity", () => {
    const source = makeInk(
      Array.from({ length: 400 }, (_, index) => (index % 10) / 10),
      true
    );
    const segments = getPressureMaskSegments(source, 32);
    expect(segments.length).toBeLessThanOrEqual(32);
    expect(segments.every((segment) => segment.opacity >= 0.08 && segment.opacity <= 1)).toBe(true);
  });
});
