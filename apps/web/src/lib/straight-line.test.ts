import { describe, expect, it } from "vitest";
import { isApproximatelyStraight } from "./straight-line";

const point = (x: number, y: number) => ({ x, y, pressure: 0.5, timestamp: 0 });

describe("straight-line gesture", () => {
  it("accepts a long, slightly imperfect straight stroke", () => {
    expect(isApproximatelyStraight([point(0, 0), point(25, 2), point(50, -1), point(90, 1)], 20)).toBe(true);
  });

  it("keeps short marks and visibly curved strokes freehand", () => {
    expect(isApproximatelyStraight([point(0, 0), point(8, 0)], 20)).toBe(false);
    expect(isApproximatelyStraight([point(0, 0), point(25, 26), point(50, 0)], 20)).toBe(false);
  });
});
