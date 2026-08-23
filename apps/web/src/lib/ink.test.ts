import { describe, expect, it } from "vitest";
import { appendInkPoint, captureSpacingForZoom, compactInkPoints, createInkStabilizer } from "./ink";

const point = (x: number, y: number, pressure = 0.5, timestamp = 0) => ({
  x,
  y,
  pressure,
  timestamp
});

describe("ink sampling", () => {
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

  it("finalisation removes only true duplicates so pointer-up cannot reshape ink", () => {
    const source = [
      point(0, 0),
      point(1, 0.2),
      point(1, 0.2),
      point(2, -0.1),
      point(3, 0)
    ];
    const compacted = compactInkPoints(source);
    expect(compacted).toEqual([source[0], source[1], source[3], source[4]]);
  });

  it("does not simplify corners or pressure samples during finalisation", () => {
    const source = [point(0, 0, 0.2), point(10, 0, 0.7), point(10, 10, 0.4)];
    expect(compactInkPoints(source)).toEqual(source);
  });

  it("suppresses slow hand jitter while remaining responsive at speed", () => {
    const slow = createInkStabilizer(0.8);
    const slowResult = [0, 1, -1, 1, -1].map((y, index) =>
      slow.push(point(index, y, 0.5, index * 8))
    );
    expect(Math.abs(slowResult.at(-1)!.y)).toBeLessThan(1);

    const fast = createInkStabilizer(0.8);
    fast.push(point(0, 0, 0.5, 0));
    const fastResult = fast.push(point(80, 0, 0.5, 8));
    expect(fastResult.x).toBeGreaterThan(65);
  });
});
