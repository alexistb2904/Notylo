import type { BaseObject, DocumentObject, InkObject, InkPoint } from "./types";

export interface Transform {
  readonly dx: number;
  readonly dy: number;
  readonly scaleX?: number;
  readonly scaleY?: number;
  readonly rotation?: number;
}

export function transformPoint(point: InkPoint, transform: Transform): InkPoint {
  const scaleX = transform.scaleX ?? 1;
  const scaleY = transform.scaleY ?? 1;
  return { ...point, x: point.x * scaleX + transform.dx, y: point.y * scaleY + transform.dy };
}

export function transformObject<T extends DocumentObject>(object: T, transform: Transform, now = Date.now()): T {
  const scaleX = transform.scaleX ?? 1;
  const scaleY = transform.scaleY ?? 1;
  const base: BaseObject = {
    ...object,
    x: object.x * scaleX + transform.dx,
    y: object.y * scaleY + transform.dy,
    width: Math.max(1, object.width * Math.abs(scaleX)),
    height: Math.max(1, object.height * Math.abs(scaleY)),
    rotation: object.rotation + (transform.rotation ?? 0),
    updatedAt: now
  };
  if (object.type === "ink")
    return { ...base, type: "ink", points: object.points.map((point) => transformPoint(point, transform)) } as unknown as T;
  if (object.type === "shape" && object.points)
    return {
      ...base,
      type: "shape",
      points: object.points.map((point) => ({ x: point.x * scaleX, y: point.y * scaleY }))
    } as unknown as T;
  return base as unknown as T;
}
