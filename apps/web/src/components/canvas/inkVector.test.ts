import { describe, expect, it } from "vitest";
import type { InkObject } from "@notylo/document-model";
import { getInkSvgPathData, getPressureMaskSegments } from "./inkVector";

const makeInk = (pressures: readonly number[], pressureOpacity = false): InkObject => ({
  id: "ink_vector",
  notebookId: "nb",
  type: "ink",
  x: 0,
  y: 0,
  width: 90,
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
  tool: "pen",
  smoothing: 0.6,
  brushId: "ink-fineliner",
  dynamics: {
    pressureSensitivity: 0.5,
    pressureAffectsWidth: true,
    pressureAffectsOpacity: pressureOpacity,
    tiltAffectsAngle: false
  },
  points: pressures.map((pressure, index) => ({
    x: index * 30,
    y: index % 2 ? 8 : 0,
    pressure,
    tiltX: 0,
    tiltY: 0,
    timestamp: index * 8
  }))
});

describe("vector ink", () => {
  it("produces one closed SVG outline instead of raster dabs", () => {
    const path = getInkSvgPathData(makeInk([0.2, 0.5, 0.8, 0.6]));
    expect(path.startsWith("M")).toBe(true);
    expect(path.endsWith("Z")).toBe(true);
    expect(path.length).toBeGreaterThan(20);
    // Fineliner caps are part of one outline. Separate arc subpaths were the
    // source of the old half-black / half-white endpoint artifacts.
    expect(path.includes("A")).toBe(false);
    expect((path.match(/M/g) ?? [])).toHaveLength(1);
  });

  it("keeps real pressure in the vector geometry", () => {
    const firm = getInkSvgPathData(makeInk([0.15, 0.15, 0.15, 0.15]));
    const heavy = getInkSvgPathData(makeInk([0.9, 0.9, 0.9, 0.9]));
    expect(heavy).not.toBe(firm);
  });

  it("bounds pressure-opacity SVG mask complexity", () => {
    const source = makeInk(
      Array.from({ length: 400 }, (_, index) => (index % 10) / 10),
      true
    );
    const segments = getPressureMaskSegments(source, 32);
    expect(segments.length).toBeLessThanOrEqual(32);
    expect(segments.every((segment) => segment.opacity >= 0.08 && segment.opacity <= 1)).toBe(
      true
    );
  });
});
