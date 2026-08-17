export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Camera {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export const DEFAULT_CAMERA: Camera = { x: 0, y: 0, zoom: 1 };
export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 10;

export function clampZoom(zoom: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
}

export function screenToWorld(screen: Point, camera: Camera): Point {
  return { x: (screen.x - camera.x) / camera.zoom, y: (screen.y - camera.y) / camera.zoom };
}

export function worldToScreen(world: Point, camera: Camera): Point {
  return { x: world.x * camera.zoom + camera.x, y: world.y * camera.zoom + camera.y };
}

export function panCamera(camera: Camera, delta: Point): Camera {
  return { ...camera, x: camera.x + delta.x, y: camera.y + delta.y };
}

export function zoomCameraAt(camera: Camera, screenOrigin: Point, zoomFactor: number): Camera {
  const worldOrigin = screenToWorld(screenOrigin, camera);
  const zoom = clampZoom(camera.zoom * zoomFactor);
  return {
    x: screenOrigin.x - worldOrigin.x * zoom,
    y: screenOrigin.y - worldOrigin.y * zoom,
    zoom
  };
}
