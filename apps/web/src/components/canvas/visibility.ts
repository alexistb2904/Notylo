import type { Camera, Point, Rect } from "@notylo/canvas-engine";
import type { DocumentObject } from "@notylo/document-model";

export function renderViewport(
  width: number,
  height: number,
  origin: Point,
  camera: Camera,
  overscanScreenPixels: number
): Rect {
  const zoom = Math.max(camera.zoom, 0.001);
  return {
    x: (-origin.x - camera.x - overscanScreenPixels) / zoom,
    y: (-origin.y - camera.y - overscanScreenPixels) / zoom,
    width: (width + overscanScreenPixels * 2) / zoom,
    height: (height + overscanScreenPixels * 2) / zoom
  };
}

export function objectIntersectsViewport(
  object: DocumentObject,
  viewport: Rect,
  pageOffsetY = 0
): boolean {
  const padding = object.type === "ink" ? Math.max(3, object.size * 1.5) : 3;
  const left = object.x - padding;
  const top = object.y + pageOffsetY - padding;
  const right = object.x + object.width + padding;
  const bottom = object.y + pageOffsetY + object.height + padding;
  return (
    left <= viewport.x + viewport.width &&
    right >= viewport.x &&
    top <= viewport.y + viewport.height &&
    bottom >= viewport.y
  );
}

export function preferredOverscan(width: number, height: number, lowPower: boolean): number {
  const viewportSize = Math.max(width, height);
  return lowPower
    ? Math.min(420, Math.max(280, viewportSize * 0.42))
    : Math.min(640, Math.max(360, viewportSize * 0.5));
}
