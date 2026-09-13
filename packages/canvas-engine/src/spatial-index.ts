import type { BaseObject } from "@notylo/document-model";
import { objectRect, rectIntersects, type Rect } from "./geometry";

const CELL_SIZE = 512;
const MAX_CELLS_PER_OBJECT = 256;
const MAX_QUERY_CELLS = 4_096;

/**
 * Lightweight uniform-grid spatial index optimized for notebook/whiteboard
 * viewports. Objects that span too many cells are kept in a small overflow
 * set, while unusually large queries fall back to the canonical value map.
 *
 * The public behavior intentionally mirrors the previous Map-backed index:
 * `all()` and `search()` preserve insertion order, replacing an existing id
 * does not change that order, and every result is verified with the exact
 * rectangle intersection test before it is returned.
 */
export class SpatialIndex<T extends BaseObject> {
  private readonly values = new Map<string, T>();
  private readonly cells = new Map<string, Set<string>>();
  private readonly memberships = new Map<string, readonly string[]>();
  private readonly overflowIds = new Set<string>();
  private readonly insertionOrder = new Map<string, number>();
  private nextInsertionOrder = 0;

  set(value: T): void {
    const existed = this.values.has(value.id);
    this.removeMembership(value.id);
    this.values.set(value.id, value);
    if (!existed) this.insertionOrder.set(value.id, this.nextInsertionOrder++);

    const keys = cellKeys(objectRect(value), MAX_CELLS_PER_OBJECT);
    if (!keys) {
      this.overflowIds.add(value.id);
      return;
    }

    this.memberships.set(value.id, keys);
    for (const key of keys) {
      let bucket = this.cells.get(key);
      if (!bucket) {
        bucket = new Set<string>();
        this.cells.set(key, bucket);
      }
      bucket.add(value.id);
    }
  }

  delete(id: string): void {
    this.removeMembership(id);
    this.values.delete(id);
    this.insertionOrder.delete(id);
  }

  clear(): void {
    this.values.clear();
    this.cells.clear();
    this.memberships.clear();
    this.overflowIds.clear();
    this.insertionOrder.clear();
    this.nextInsertionOrder = 0;
  }

  all(): readonly T[] {
    return [...this.values.values()];
  }

  search(bounds: Rect): readonly T[] {
    const keys = cellKeys(bounds, MAX_QUERY_CELLS);
    if (!keys) return [...this.values.values()].filter((value) => rectIntersects(bounds, objectRect(value)));

    const candidateIds = new Set<string>(this.overflowIds);
    for (const key of keys) {
      const bucket = this.cells.get(key);
      if (!bucket) continue;
      for (const id of bucket) candidateIds.add(id);
    }

    return [...candidateIds]
      .map((id) => this.values.get(id))
      .filter((value): value is T => value !== undefined)
      .filter((value) => rectIntersects(bounds, objectRect(value)))
      .sort(
        (a, b) =>
          (this.insertionOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (this.insertionOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER)
      );
  }

  hit(point: { x: number; y: number }): readonly T[] {
    return [...this.search({ x: point.x, y: point.y, width: 0, height: 0 })].sort(
      (a, b) => b.zIndex - a.zIndex
    );
  }

  private removeMembership(id: string): void {
    this.overflowIds.delete(id);
    const keys = this.memberships.get(id);
    if (!keys) return;

    for (const key of keys) {
      const bucket = this.cells.get(key);
      if (!bucket) continue;
      bucket.delete(id);
      if (bucket.size === 0) this.cells.delete(key);
    }
    this.memberships.delete(id);
  }
}

function cellKeys(rect: Rect, limit: number): readonly string[] | undefined {
  const left = Math.min(rect.x, rect.x + rect.width);
  const right = Math.max(rect.x, rect.x + rect.width);
  const top = Math.min(rect.y, rect.y + rect.height);
  const bottom = Math.max(rect.y, rect.y + rect.height);
  if (![left, right, top, bottom].every(Number.isFinite)) return undefined;

  const minX = Math.floor(left / CELL_SIZE);
  const maxX = Math.floor(right / CELL_SIZE);
  const minY = Math.floor(top / CELL_SIZE);
  const maxY = Math.floor(bottom / CELL_SIZE);
  const columns = maxX - minX + 1;
  const rows = maxY - minY + 1;
  const count = columns * rows;
  if (!Number.isSafeInteger(count) || count > limit) return undefined;

  const keys: string[] = [];
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) keys.push(`${x}:${y}`);
  }
  return keys;
}
