import { describe, expect, it } from "vitest";
import { screenToWorld, worldToScreen, zoomCameraAt } from "../src";

describe("camera transforms", () => {
  it("round-trips coordinate transforms", () => {
    const camera = { x: 120, y: -40, zoom: 1.75 };
    const world = { x: 21, y: 32 };
    expect(screenToWorld(worldToScreen(world, camera), camera)).toEqual(world);
  });
  it("holds the world point fixed while zooming", () => {
    const camera = { x: 0, y: 0, zoom: 1 };
    const before = screenToWorld({ x: 200, y: 120 }, camera);
    const after = zoomCameraAt(camera, { x: 200, y: 120 }, 2);
    expect(screenToWorld({ x: 200, y: 120 }, after)).toEqual(before);
  });
});
