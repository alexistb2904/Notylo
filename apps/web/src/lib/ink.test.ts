import { describe, expect, it } from "vitest";
import { appendInkPoint, captureSpacingForZoom, compactInkPoints } from "./ink";
import {
  applyPressureCurve,
  getDabDynamics,
  prepareStrokeSamples,
  stabilizeInkPath,
  visibleInkRuns
} from "../components/canvas/drawInk";

const point = (x: number, y: number, pressure = 0.5, timestamp = 0) => ({
  x,
  y,
  pressure,
  timestamp
});

describe("ink sampling", () => {
  it("uses a linear pressure curve at normal sensitivity and softer response above it", () => {
    expect(applyPressureCurve(0.25, 0.5)).toBeCloseTo(0.25);
    expect(applyPressureCurve(0.25, 0.85)).toBeGreaterThan(0.25);
    expect(applyPressureCurve(0.25, 0.15)).toBeLessThan(0.25);
  });

  it("applies width, opacity and stylus tilt independently", () => {
    const dynamics = {
      pressureSensitivity: 0.5,
      pressureAffectsWidth: false,
      pressureAffectsOpacity: true,
      tiltAffectsAngle: true
    };
    const dab = getDabDynamics({ pressure: 0.25, tiltX: 0, tiltY: 45 }, dynamics, 0.2);
    expect(dab.width).toBe(1);
    expect(dab.opacity).toBeCloseTo(0.31);
    expect(dab.angle).toBeCloseTo(Math.PI / 2);
  });

  it("only keeps the portions of a long stroke near the render viewport", () => {
    const source = Array.from({ length: 21 }, (_, index) => point(index * 100, 50));
    const runs = visibleInkRuns(source, { x: 850, y: 0, width: 300, height: 100 }, 20);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.length).toBeLessThan(source.length / 2);
    expect(runs[0]!.some((item) => item.x === 1000)).toBe(true);
  });

  it("drops duplicate browser samples but preserves meaningful pressure changes", () => {
    const points = [point(1, 1)];
    appendInkPoint(points, point(1.001, 1.001));
    appendInkPoint(points, point(1.001, 1.001, 0.8));
    expect(points).toHaveLength(2);
  });

  it("adapts capture density to zoom instead of collecting invisible samples", () => {
    expect(captureSpacingForZoom(0.1, 2)).toBeGreaterThan(captureSpacingForZoom(1, 2));
    expect(captureSpacingForZoom(1, 2)).toBeGreaterThan(captureSpacingForZoom(8, 2));
  });

  it("compacts a dense straight segment without rounding a corner", () => {
    const points = [
      point(0, 0),
      point(0.1, 0),
      point(0.2, 0),
      point(10, 0),
      point(10, 0.2),
      point(10, 10)
    ];
    const compacted = compactInkPoints(points);
    expect(compacted[0]).toEqual(points[0]);
    expect(compacted.at(-1)).toEqual(points.at(-1));
    expect(compacted).toContainEqual(points[3]);
    expect(compacted.length).toBeLessThan(points.length);
  });

  it("turns a 100% stabilised corner into a curve rather than an abrupt angle", () => {
    const source = [point(0, 0, 0.5, 0), point(80, 0, 0.5, 20), point(80, 80, 0.5, 40)];
    const result = stabilizeInkPath(source, 1, true);
    expect(result.at(-1)).toMatchObject({ x: 80, y: 80 });
    expect(result.some((item) => item.x < 79 && item.y > 1)).toBe(true);
  });

  it("never leaves the convex hull of the user's input", () => {
    const source = [point(0, 0), point(80, 0), point(80, 80)];
    const result = stabilizeInkPath(source, 1, true);
    expect(result.every((item) => item.y >= 0 && item.y <= item.x + 1e-8 && item.x <= 80)).toBe(
      true
    );
  });

  it("caps live geometry while preserving the final stylus position", () => {
    const source = Array.from({ length: 5000 }, (_, index) =>
      point(index * 0.25, Math.sin(index / 20) * 20, 0.5, index * 4)
    );
    const samples = prepareStrokeSamples(source, 0.55, 3, false, "economy");
    expect(samples.length).toBeLessThanOrEqual(261);
    expect(samples.at(-1)).toMatchObject({ x: source.at(-1)!.x, y: source.at(-1)!.y });
  });
});
