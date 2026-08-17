import type { BaseObject } from "@notylo/document-model";
import { objectRect, rectIntersects, type Rect } from "./geometry";

/**
 * Swap this deliberately small index for rbush when the persistent object count
 * justifies it. The CanvasEngine only depends on this interface, not an R-tree.
 */
export class SpatialIndex<T extends BaseObject> {
  private values = new Map<string, T>();

  set(value: T): void {
    this.values.set(value.id, value);
  }
  delete(id: string): void {
    this.values.delete(id);
  }
  clear(): void {
    this.values.clear();
  }
  all(): readonly T[] {
    return [...this.values.values()];
  }
  search(bounds: Rect): readonly T[] {
    return [...this.values.values()].filter((value) => rectIntersects(bounds, objectRect(value)));
  }
  hit(point: { x: number; y: number }): readonly T[] {
    return [...this.search({ x: point.x, y: point.y, width: 0, height: 0 })].sort(
      (a, b) => b.zIndex - a.zIndex
    );
  }
}
