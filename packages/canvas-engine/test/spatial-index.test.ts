import { describe, expect, it } from "vitest";
import type { DocumentObject } from "@notylo/document-model";
import { SpatialIndex } from "../src";

describe("SpatialIndex", () => {
  it("finds objects across positive and negative grid cells in insertion order", () => {
    const index = new SpatialIndex<DocumentObject>();
    index.set(textObject("first", 520, 520));
    index.set(textObject("negative", -30, -30));
    index.set(textObject("second", 540, 540));

    expect(index.search({ x: 500, y: 500, width: 100, height: 100 }).map((item) => item.id)).toEqual([
      "first",
      "second"
    ]);
    expect(index.search({ x: -40, y: -40, width: 30, height: 30 }).map((item) => item.id)).toEqual([
      "negative"
    ]);
  });

  it("reindexes an existing object without changing insertion order", () => {
    const index = new SpatialIndex<DocumentObject>();
    index.set(textObject("first", 0, 0));
    index.set(textObject("second", 20, 20));
    index.set(textObject("first", 2_000, 2_000));

    expect(index.search({ x: 0, y: 0, width: 100, height: 100 }).map((item) => item.id)).toEqual([
      "second"
    ]);
    expect(index.all().map((item) => item.id)).toEqual(["first", "second"]);
    expect(index.search({ x: 1_900, y: 1_900, width: 200, height: 200 }).map((item) => item.id)).toEqual([
      "first"
    ]);
  });

  it("removes object memberships cleanly", () => {
    const index = new SpatialIndex<DocumentObject>();
    index.set(textObject("gone", 600, 600));
    index.delete("gone");

    expect(index.search({ x: 500, y: 500, width: 500, height: 500 })).toEqual([]);
    expect(index.all()).toEqual([]);
  });

  it("keeps very large objects searchable through the overflow set", () => {
    const index = new SpatialIndex<DocumentObject>();
    index.set(textObject("huge", -10_000, -10_000, 30_000, 30_000));
    index.set(textObject("small", 50, 50));

    expect(index.search({ x: 0, y: 0, width: 100, height: 100 }).map((item) => item.id)).toEqual([
      "huge",
      "small"
    ]);
  });

  it("falls back safely for unusually large queries", () => {
    const index = new SpatialIndex<DocumentObject>();
    index.set(textObject("inside", 0, 0));
    index.set(textObject("outside", 1_000_000, 1_000_000));

    expect(
      index.search({ x: -100_000, y: -100_000, width: 200_000, height: 200_000 }).map((item) => item.id)
    ).toEqual(["inside"]);
  });

  it("returns the topmost object for hit testing", () => {
    const index = new SpatialIndex<DocumentObject>();
    index.set(textObject("bottom", 0, 0, 20, 20, 1));
    index.set(textObject("top", 0, 0, 20, 20, 10));

    expect(index.hit({ x: 5, y: 5 }).map((item) => item.id)).toEqual(["top", "bottom"]);
  });
});

function textObject(
  id: string,
  x: number,
  y: number,
  width = 20,
  height = 20,
  zIndex = 0
): DocumentObject {
  return {
    id,
    notebookId: "spatial-test",
    type: "text",
    x,
    y,
    width,
    height,
    rotation: 0,
    zIndex,
    opacity: 1,
    locked: false,
    hidden: false,
    createdAt: 0,
    updatedAt: 0,
    html: id,
    plainText: id,
    fontFamily: "system-ui",
    fontSize: 16,
    color: "#000000",
    align: "left"
  };
}
