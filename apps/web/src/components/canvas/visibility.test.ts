import { describe, expect, it } from "vitest";
import type { DocumentObject } from "@notylo/document-model";
import { objectIntersectsViewport, preferredOverscan, renderViewport } from "./visibility";

const ink = (x: number, y: number): DocumentObject =>
  ({ x, y, width: 80, height: 20, size: 4, type: "ink" }) as DocumentObject;

describe("canvas visibility", () => {
  it("converts the screen plus overscan to document coordinates", () => {
    expect(
      renderViewport(1000, 600, { x: 100, y: 50 }, { x: -200, y: -100, zoom: 2 }, 400)
    ).toEqual({ x: -150, y: -175, width: 900, height: 700 });
  });

  it("culls distant ink but keeps objects in the preload band", () => {
    const viewport = { x: -400, y: -400, width: 1800, height: 1400 };
    expect(objectIntersectsViewport(ink(1200, 300), viewport)).toBe(true);
    expect(objectIntersectsViewport(ink(4000, 300), viewport)).toBe(false);
  });

  it("uses a smaller bounded preload band on low-power devices", () => {
    expect(preferredOverscan(1200, 800, true)).toBe(420);
    expect(preferredOverscan(1200, 800, false)).toBe(600);
  });
});
