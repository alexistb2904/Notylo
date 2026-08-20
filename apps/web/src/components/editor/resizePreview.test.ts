import { describe, expect, it } from "vitest";
import type { TextObject, Transform } from "@notylo/document-model";
import { previewObjectBounds, transformChanged } from "./resizePreview";

const text: TextObject = {
  id: "text-1",
  notebookId: "nb-1",
  pageId: "page-1",
  type: "text",
  x: 40,
  y: 60,
  width: 180,
  height: 64,
  rotation: 0,
  zIndex: 1,
  opacity: 1,
  locked: false,
  hidden: false,
  createdAt: 1,
  updatedAt: 1,
  html: "Hello",
  plainText: "Hello",
  fontFamily: "Newsreader, serif",
  fontSize: 22,
  color: "#292927",
  align: "left"
};

describe("resize preview", () => {
  it("transforms only the object box without mutating text styling", () => {
    const transform: Transform = { dx: -20, dy: 15, scaleX: 1.5, scaleY: 2 };
    const preview = previewObjectBounds(text, transform);

    expect(preview).not.toBe(text);
    expect(preview.x).toBe(40);
    expect(preview.y).toBe(135);
    expect(preview.width).toBe(270);
    expect(preview.height).toBe(128);
    expect(preview.fontSize).toBe(22);
    expect(preview.plainText).toBe("Hello");
    expect(text).toMatchObject({ x: 40, y: 60, width: 180, height: 64 });
  });

  it("detects meaningful transforms but ignores identity noise", () => {
    expect(transformChanged({ dx: 0, dy: 0, scaleX: 1, scaleY: 1 })).toBe(false);
    expect(transformChanged({ dx: 0.00001, dy: 0, scaleX: 1, scaleY: 1 })).toBe(false);
    expect(transformChanged({ dx: 0, dy: 0, scaleX: 1.2, scaleY: 1 })).toBe(true);
  });
});
