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

  it("keeps the exact final nib position after a subpixel stabilizer tail", () => {
    const source = [point(0, 0), point(10, 2), point(10.0004, 2.0003)];
    expect(compactInkPoints(source).at(-1)).toEqual(source.at(-1));
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

  it("keeps a small anti-jitter floor at zero percent", () => {
    const stabilizer = createInkStabilizer(0);
    const raw = [0, 1, -1, 1, -1, 1, -1];
    const result = raw.map((y, index) => stabilizer.push(point(index * 2, y, 0.5, index * 8)));
    const rawNoise = raw.slice(1).reduce((total, y) => total + Math.abs(y), 0);
    const filteredNoise = result.slice(1).reduce((total, sample) => total + Math.abs(sample.y), 0);
    expect(filteredNoise).toBeLessThan(rawNoise * 0.95);
  });

  it("keeps a fast straight gesture responsive and finishes at the nib", () => {
    const stabilizer = createInkStabilizer(1);
    stabilizer.push(point(0, 0, 0.5, 0));
    const live = stabilizer.push(point(100, 0.8, 0.5, 8));
    expect(live.x).toBeGreaterThan(80);
    expect(Math.abs(live.y)).toBeLessThan(0.8);
    const finished = stabilizer.finish();
    expect(finished.length).toBeGreaterThan(2);
    expect(finished.at(-1)).toMatchObject({ x: 100, y: 0.8, pressure: 0.5 });
  });

  it("drains the slow-sample window without overshooting the endpoint", () => {
    const stabilizer = createInkStabilizer(0.9, { zoom: 2 });
    stabilizer.push(point(0, 0, 0.2, 0));
    stabilizer.push(point(12, 4, 0.8, 16));
    stabilizer.push(point(18, 9, 0.9, 32));
    const tail = stabilizer.finish();

    expect(tail.length).toBeGreaterThan(0);
    expect(tail.every((sample) => sample.x <= 18.001 && sample.y <= 9.001)).toBe(true);
    expect(tail.at(-1)).toMatchObject({ x: 18, y: 9, pressure: 0.9 });
    expect(stabilizer.finish()).toEqual([]);
  });

  it("smooths pressure and tilt sensors along with position", () => {
    const stabilizer = createInkStabilizer(1);
    stabilizer.push({ ...point(0, 0, 0.1, 0), tiltX: 0, tiltY: 0 });
    const filtered = stabilizer.push({ ...point(1, 0, 1, 8), tiltX: 60, tiltY: -40 });
    expect(filtered.pressure).toBeGreaterThan(0.1);
    expect(filtered.pressure).toBeLessThan(1);
    expect(filtered.tiltX).toBeGreaterThan(0);
    expect(filtered.tiltX).toBeLessThan(60);
  });

  it("keeps stabilization strength stable across zoom levels", () => {
    const normal = createInkStabilizer(0.7, { zoom: 1 });
    const zoomed = createInkStabilizer(0.7, { zoom: 2 });
    let normalPoint = point(0, 0);
    let zoomedPoint = point(0, 0);
    for (let index = 0; index < 12; index++) {
      normalPoint = normal.push(point(index * 2, index % 2 ? 0.8 : -0.8, 0.5, index * 8));
      zoomedPoint = zoomed.push(point(index, index % 2 ? 0.4 : -0.4, 0.5, index * 8));
    }
    expect(zoomedPoint.x * 2).toBeCloseTo(normalPoint.x, 5);
    expect(zoomedPoint.y * 2).toBeCloseTo(normalPoint.y, 5);
  });
});
