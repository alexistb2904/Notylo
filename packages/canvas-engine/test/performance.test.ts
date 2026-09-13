import { describe, expect, it } from "vitest";
import type { DocumentObject } from "@notylo/document-model";
import { CanvasEngine } from "../src";

const OBJECT_COUNT = 10_000;
const QUERY_ITERATIONS = 100;
const MAX_BENCHMARK_MS = Number(process.env.NOTYLO_CANVAS_BENCHMARK_MS ?? 2_500);

describe("CanvasEngine performance guard", () => {
  it("keeps 10k-object indexing and repeated queries responsive", () => {
    const objects = createObjects(OBJECT_COUNT);
    const engine = new CanvasEngine();
    const startedAt = performance.now();

    engine.setObjects(objects);

    let viewportMatches = 0;
    let hitMatches = 0;
    for (let iteration = 0; iteration < QUERY_ITERATIONS; iteration += 1) {
      const offset = (iteration % 25) * 40;
      viewportMatches += engine.objectsInViewport({ x: offset, y: offset, width: 400, height: 400 }).length;
      if (engine.objectAt({ x: offset + 5, y: offset + 5 })) hitMatches += 1;
    }

    const elapsedMs = performance.now() - startedAt;
    expect(viewportMatches).toBeGreaterThan(0);
    expect(hitMatches).toBe(QUERY_ITERATIONS);
    expect(
      elapsedMs,
      `10k-object canvas benchmark took ${elapsedMs.toFixed(1)}ms (budget ${MAX_BENCHMARK_MS}ms)`
    ).toBeLessThan(MAX_BENCHMARK_MS);
  });
});

function createObjects(count: number): DocumentObject[] {
  const columns = 100;
  return Array.from({ length: count }, (_, index) => {
    const x = (index % columns) * 40;
    const y = Math.floor(index / columns) * 40;
    return {
      id: `perf_${index}`,
      notebookId: "perf-notebook",
      type: "text",
      x,
      y,
      width: 20,
      height: 20,
      rotation: 0,
      zIndex: index,
      opacity: 1,
      locked: false,
      hidden: false,
      createdAt: 0,
      updatedAt: 0,
      html: String(index),
      plainText: String(index),
      fontFamily: "system-ui",
      fontSize: 16,
      color: "#000000",
      align: "left"
    };
  });
}
