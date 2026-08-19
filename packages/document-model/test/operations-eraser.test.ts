import { describe, expect, it } from "vitest";
import { createNotebook, type InkObject, type NotebookDocument } from "../src/index";
import { applyOperation, invertOperation } from "../src/operations";

function sourceDocument(): { document: NotebookDocument; ink: InkObject } {
  const base = createNotebook({ title: "Eraser", mode: "book", now: 1 });
  const page = base.pages[0]!;
  const ink: InkObject = {
    id: "ink_original",
    notebookId: base.notebook.id,
    pageId: page.id,
    type: "ink",
    x: 0,
    y: 10,
    width: 100,
    height: 1,
    rotation: 0,
    zIndex: 1,
    opacity: 1,
    locked: false,
    hidden: false,
    createdAt: 1,
    updatedAt: 1,
    points: [
      { x: 0, y: 10, pressure: 0.5, timestamp: 1 },
      { x: 100, y: 10, pressure: 0.5, timestamp: 2 }
    ],
    color: "#000",
    size: 3,
    tool: "pen",
    smoothing: 0.5
  };
  return {
    ink,
    document: {
      ...base,
      pages: [{ ...page, objectIds: [ink.id] }],
      objects: [ink]
    }
  };
}

describe("update-objects replacement semantics", () => {
  it("supports splitting one ink object into multiple fragments and undoing it", () => {
    const { document, ink } = sourceDocument();
    const left: InkObject = {
      ...ink,
      width: 40,
      points: [ink.points[0]!, { x: 40, y: 10, pressure: 0.5, timestamp: 2 }]
    };
    const right: InkObject = {
      ...ink,
      id: "ink_fragment",
      x: 60,
      width: 40,
      points: [
        { x: 60, y: 10, pressure: 0.5, timestamp: 3 },
        ink.points[1]!
      ]
    };
    const operation = {
      kind: "update-objects" as const,
      before: [ink],
      after: [left, right],
      label: "Gommer le trait"
    };

    const split = applyOperation(document, operation);
    expect(split.objects.map((object) => object.id).sort()).toEqual([left.id, right.id].sort());
    expect([...(split.pages[0]?.objectIds ?? [])].sort()).toEqual([left.id, right.id].sort());

    const restored = applyOperation(split, invertOperation(operation));
    expect(restored.objects).toHaveLength(1);
    expect(restored.objects[0]).toEqual(ink);
    expect(restored.pages[0]?.objectIds).toEqual([ink.id]);
  });

  it("supports replacing an object with no fragments", () => {
    const { document, ink } = sourceDocument();
    const erased = applyOperation(document, {
      kind: "update-objects",
      before: [ink],
      after: [],
      label: "Effacer"
    });
    expect(erased.objects).toEqual([]);
    expect(erased.pages[0]?.objectIds).toEqual([]);
  });
});
