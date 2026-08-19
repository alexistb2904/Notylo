import { describe, expect, it } from "vitest";
import type { InkObject } from "@notylo/document-model";
import {
  getInkBrushKind,
  getInkSvgPathData,
  getInkTexture,
  getInkVisual,
  getPressureMaskSegments,
  stabilizeInkPoints
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
  tool: brushId.startsWith("pencil") ? "pencil" : brushId.startsWith("highlighter") ? "highlighter" : "pen",
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

describe("professional vector ink engine", () => {
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

  it("reduces high-frequency centre-line jitter without moving earlier samples later", () => {
    const source = Array.from({ length: 80 }, (_, index) => ({
      x: index,
      y: index % 2 ? 0.5 : -0.5,
      pressure: 0.5,
      tiltX: 0,
      tiltY: 0,
      timestamp: index * 8
    }));
    const filtered = stabilizeInkPoints(source, 0.6, 2.2);
    const visibleNoise = Math.max(...filtered.slice(10).map((point) => Math.abs(point.y)));
    expect(visibleNoise).toBeLessThan(0.25);

    const extended = stabilizeInkPoints(
      [...source, { ...source.at(-1)!, x: 80, y: 0.2, timestamp: 640 }],
      0.6,
      2.2
    );
    expect(extended.slice(0, source.length)).toEqual(filtered);
  });

  it("keeps real pressure in the vector geometry", () => {
    const light = getInkSvgPathData(makeInk([0.15, 0.15, 0.15, 0.15]));
    const heavy = getInkSvgPathData(makeInk([0.9, 0.9, 0.9, 0.9]));
    expect(heavy).not.toBe(light);
  });

  it("keeps tilt-aware calligraphy vectorised", () => {
    const noTilt = getInkSvgPathData(makeInk([0.5, 0.5, 0.5, 0.5], false, "ink-calligraphy", false));
    const tilted = getInkSvgPathData(makeInk([0.5, 0.5, 0.5, 0.5], false, "ink-calligraphy", true));
    expect(tilted).not.toBe(noTilt);
    expect(tilted.endsWith("Z")).toBe(true);
  });

  it("keeps each preset visually distinct without changing the document model", () => {
    expect(getInkBrushKind(makeInk([0.5], false, "pencil-sketch"))).toBe("graphite");
    expect(getInkBrushKind(makeInk([0.5], false, "pencil-2b"))).toBe("graphite-soft");
    expect(getInkBrushKind(makeInk([0.5], false, "highlighter-flat"))).toBe("highlighter");
    expect(getInkTexture(makeInk([0.5, 0.5, 0.5], false, "pencil-sketch"))?.d).toBeTruthy();
    expect(getInkTexture(makeInk([0.5, 0.5, 0.5], false, "wet-paint"))?.d).toBeTruthy();
    expect(getInkVisual(makeInk([0.5], false, "highlighter-flat")).multiply).toBe(true);
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
