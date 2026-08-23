import { describe, expect, it, vi } from "vitest";
import type { InkBrush, InkPoint } from "@notylo/document-model";
import { drawBrushStrokeIncremental, sampleBrushStroke } from "./brushEngine";

const brush = (overrides: Partial<InkBrush> = {}): InkBrush => ({
  id: "test",
  tip: "round",
  spacing: 0.1,
  hardness: 1,
  flow: 1,
  opacity: 1,
  aspect: 1,
  angle: 0,
  rotation: "fixed",
  scatter: 0,
  grain: 0,
  blendMode: "normal",
  dynamics: {
    pressureSensitivity: 0.5,
    pressureAffectsWidth: true,
    pressureAffectsOpacity: false,
    tiltAffectsAngle: false
  },
  ...overrides
});
const line = (count: number, pressure = 0.5): InkPoint[] =>
  Array.from({ length: count }, (_, index) => ({
    x: (100 * index) / Math.max(1, count - 1),
    y: 0,
    pressure,
    timestamp: index * 8
  }));

describe("stamp-mask brush engine", () => {
  it("spaces dabs by geometry rather than input event frequency", () => {
    const sparse = sampleBrushStroke(line(3), 4, brush());
    const dense = sampleBrushStroke(line(101), 4, brush());
    expect(Math.abs(sparse.length - dense.length)).toBeLessThanOrEqual(1);
    expect(sparse.length).toBeGreaterThan(200);
  });

  it("maps pressure to brush size", () => {
    const light = sampleBrushStroke(line(3, 0.1), 8, brush());
    const heavy = sampleBrushStroke(line(3, 0.9), 8, brush());
    expect(heavy[0]!.radius).toBeGreaterThan(light[0]!.radius * 2);
  });

  it("uses tilt to rotate a configured tip", () => {
    const tilted = line(2).map((point) => ({ ...point, tiltX: 5, tiltY: 40 }));
    const dabs = sampleBrushStroke(
      tilted,
      6,
      brush({ tip: "chisel", aspect: 0.3, rotation: "tilt",
        dynamics: { ...brush().dynamics, tiltAffectsAngle: true } })
    );
    expect(dabs[0]!.aspect).toBe(0.3);
    expect(dabs[0]!.angle).toBeGreaterThan(1);
  });

  it("keeps deterministic scatter for identical stroke data", () => {
    const recipe = brush({ tip: "graphite", scatter: 0.2, grain: 0.8 });
    expect(sampleBrushStroke(line(8), 5, recipe)).toEqual(sampleBrushStroke(line(8), 5, recipe));
  });

  it("renders only newly appended dabs on the live surface", () => {
    class FakePath2D {
      moveTo() {}
      ellipse() {}
      closePath() {}
    }
    vi.stubGlobal("Path2D", FakePath2D);
    const fills: unknown[] = [];
    const context = {
      save() {},
      restore() {},
      translate() {},
      fill(path: unknown) { fills.push(path); },
      fillStyle: "",
      globalAlpha: 1,
      globalCompositeOperation: "source-over"
    } as unknown as CanvasRenderingContext2D;
    const points = line(3);
    const stroke = { points, size: 4, color: "#111", opacity: 1, brush: brush() };

    const initialDabs = drawBrushStrokeIncremental(context, stroke);
    expect(initialDabs).toBeGreaterThan(100);
    fills.length = 0;
    expect(drawBrushStrokeIncremental(context, stroke)).toBe(0);
    expect(fills).toHaveLength(0);

    points.push(pointAt(120, 0, 24));
    const appendedDabs = drawBrushStrokeIncremental(context, stroke);
    expect(appendedDabs).toBeGreaterThan(0);
    expect(appendedDabs).toBeLessThan(initialDabs);
    vi.unstubAllGlobals();
  });
});

function pointAt(x: number, y: number, timestamp: number): InkPoint {
  return { x, y, pressure: 0.5, timestamp };
}
