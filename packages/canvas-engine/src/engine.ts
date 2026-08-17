import type { DocumentObject } from "@notylo/document-model";
import { type Camera, DEFAULT_CAMERA, panCamera, type Point, zoomCameraAt } from "./camera";
import {
  objectRect,
  pointInPolygon,
  rectContains,
  rectIntersectsPolygon,
  selectionBounds,
  type Rect
} from "./geometry";
import { SpatialIndex } from "./spatial-index";

export type SelectionMode = "replace" | "add" | "toggle";

export class CanvasEngine {
  private cameraValue: Camera = DEFAULT_CAMERA;
  private readonly index = new SpatialIndex<DocumentObject>();
  private selectedIds = new Set<string>();

  get camera(): Camera {
    return this.cameraValue;
  }
  get selection(): readonly string[] {
    return [...this.selectedIds];
  }
  setObjects(objects: readonly DocumentObject[]): void {
    this.index.clear();
    objects.forEach((object) => this.index.set(object));
  }
  upsert(object: DocumentObject): void {
    this.index.set(object);
  }
  remove(id: string): void {
    this.index.delete(id);
    this.selectedIds.delete(id);
  }
  pan(delta: Point): void {
    this.cameraValue = panCamera(this.cameraValue, delta);
  }
  zoomAt(screenPoint: Point, factor: number): void {
    this.cameraValue = zoomCameraAt(this.cameraValue, screenPoint, factor);
  }
  setCamera(camera: Camera): void {
    this.cameraValue = camera;
  }
  objectsInViewport(viewport: Rect): readonly DocumentObject[] {
    return this.index.search(viewport).filter((object) => !object.hidden);
  }
  objectAt(point: Point): DocumentObject | undefined {
    return this.index.hit(point).find((item) => !item.hidden && !item.locked);
  }
  select(ids: readonly string[], mode: SelectionMode = "replace"): void {
    if (mode === "replace") this.selectedIds.clear();
    ids.forEach((id) => {
      if (mode === "toggle" && this.selectedIds.has(id)) this.selectedIds.delete(id);
      else this.selectedIds.add(id);
    });
  }
  selectRect(rect: Rect, contain = false, mode: SelectionMode = "replace"): readonly string[] {
    const ids = this.index
      .search(rect)
      .filter((object) => (contain ? rectContains(rect, objectRect(object)) : true))
      .map((object) => object.id);
    this.select(ids, mode);
    return ids;
  }
  selectLasso(polygon: readonly Point[], mode: SelectionMode = "replace"): readonly string[] {
    const ids = this.index
      .all()
      .filter((object) => {
        const center = { x: object.x + object.width / 2, y: object.y + object.height / 2 };
        return (
          pointInPolygon(center, polygon) || rectIntersectsPolygon(objectRect(object), polygon)
        );
      })
      .map((object) => object.id);
    this.select(ids, mode);
    return ids;
  }
  selectionBounds(): Rect | null {
    const selected = this.index.all().filter((object) => this.selectedIds.has(object.id));
    return selectionBounds(selected);
  }
}
