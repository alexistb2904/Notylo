import { describe, expect, it } from "vitest";
import type { InkObject } from "@notylo/document-model";
import { appendEraserPoint, eraseInkStroke, eraseObjects } from "./eraser";

const makeInk = (locked = false): InkObject => ({
  id: "ink_1",
  notebookId: "nb_1",
  pageId: "page_1",
  type: "ink",
  x: 0,
  y: 20,
  width: 100,
  height: 1,
  rotation: 0,
  zIndex: 1,
  opacity: 1,
  locked,
  hidden: false,
  createdAt: 1,
  updatedAt: 1,
  color: "#111111",
  size: 4,
  stabilizer: 0.5,
  brush: {
    id: "ink-fineliner", tip: "round", spacing: 0.1, hardness: 1, flow: 1,
    opacity: 1, aspect: 1, angle: 0, rotation: "fixed", scatter: 0, grain: 0,
    blendMode: "normal",
    dynamics: {
      pressureSensitivity: 0.5, pressureAffectsWidth: true,
      pressureAffectsOpacity: false, tiltAffectsAngle: true
    }
  },
  points: Array.from({ length: 11 }, (_, index) => ({
    x: index * 10,
    y: 20,
    pressure: 0.2 + index * 0.05,
    tiltX: index,
    tiltY: 20 - index,
    timestamp: index * 8
  }))
});

const verticalSweep = [
  { x: 50, y: 0 },
  { x: 50, y: 40 }
] as const;

describe("precision eraser", () => {
  it("cuts a stroke into vector fragments while preserving stylus dynamics", () => {
    const source = makeInk();
    const fragments = eraseInkStroke(source, verticalSweep, 5);

    expect(fragments).toHaveLength(2);
    expect(fragments[0]?.id).toBe(source.id);
    expect(fragments[1]?.id).toBe(`${source.id}_cut_${source.updatedAt}_1`);
    expect(fragments.every((fragment) => fragment.brush === source.brush)).toBe(true);
    expect(
      fragments.flatMap((fragment) => fragment.points).every((point) => Math.abs(point.x - 50) > 4)
    ).toBe(true);
    expect(fragments.some((fragment) => fragment.points.some((point) => point.tiltX !== 0))).toBe(
      true
    );
  });

  it("keeps object eraser semantics for the entire touched object", () => {
    const source = makeInk();
    const result = eraseObjects([source], verticalSweep, 10, "object");
    expect(result.before).toEqual([source]);
    expect(result.after).toEqual([]);
  });

  it("returns one reversible replacement for precision mode", () => {
    const source = makeInk();
    const result = eraseObjects([source], verticalSweep, 10, "precision");
    expect(result.before).toEqual([source]);
    expect(result.after).toHaveLength(2);
  });

  it("does not touch locked ink", () => {
    const source = makeInk(true);
    expect(eraseObjects([source], verticalSweep, 20, "precision")).toEqual({
      before: [],
      after: []
    });
  });

  it("keeps a held eraser path compact instead of recording every pointer event", () => {
    const path = [{ x: 0, y: 0 }];
    for (let x = 0.1; x <= 20; x += 0.1) appendEraserPoint(path, { x, y: 0 }, 20);
    expect(path.length).toBeLessThan(20);
    expect(path.at(-1)!.x).toBeGreaterThan(18);
  });
});
