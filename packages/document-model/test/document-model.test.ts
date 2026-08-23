import { describe, expect, it } from "vitest";
import { createNotebook, transformObject } from "../src/index";

describe("document model", () => {
  it("creates a serializable book with its first page", () => {
    const document = createNotebook({ title: "Maths", mode: "book", now: 10 });
    expect(document.pages).toHaveLength(1);
    expect(document.notebook.title).toBe("Maths");
    expect(JSON.parse(JSON.stringify(document))).toEqual(document);
  });

  it("moves ink while preserving its original coordinates", () => {
    const now = 1;
    const ink = {
      id: "i", notebookId: "n", type: "ink" as const, x: 2, y: 3, width: 10, height: 10, rotation: 0,
      zIndex: 0, opacity: 1, locked: false, hidden: false, createdAt: now, updatedAt: now,
      color: "#000", size: 2, stabilizer: 0.5,
      brush: {
        id: "test", tip: "round" as const, spacing: 0.1, hardness: 1, flow: 1,
        opacity: 1, aspect: 1, angle: 0, rotation: "fixed" as const, scatter: 0,
        grain: 0, blendMode: "normal" as const,
        dynamics: { pressureSensitivity: 0.5, pressureAffectsWidth: true,
          pressureAffectsOpacity: false, tiltAffectsAngle: false }
      },
      points: [{ x: 2, y: 3, pressure: 0.5, timestamp: now }]
    };
    const output = transformObject(ink, { dx: 4, dy: -1 }, 2);
    expect(output.points[0]).toMatchObject({ x: 6, y: 2 });
    expect(output).toMatchObject({ x: 6, y: 2, updatedAt: 2 });
  });
});
