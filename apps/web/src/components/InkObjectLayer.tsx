import type { Camera, Point, Rect } from "@notylo/canvas-engine";
import type { DocumentObject, InkObject, NotebookDocument, Transform } from "@notylo/document-model";
import { useEffect, useRef, type MutableRefObject } from "react";
import { drawBrushStroke } from "./canvas/brushEngine";

interface Props {
  readonly documentRef: MutableRefObject<NotebookDocument>;
  readonly activePageId?: string | undefined;
  readonly pageOffsets?: Readonly<Record<string, number>> | undefined;
  readonly documentMode: "book" | "whiteboard";
  readonly origin: Point;
  readonly cameraRef: MutableRefObject<Camera>;
  readonly selection: readonly DocumentObject[];
  readonly selectionTransform?: Transform | undefined;
  readonly dragOffset: Point;
}

/** Raster brush surface. Geometry is cached per stroke and culled before painting. */
export function InkObjectLayer(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const width = parent.clientWidth;
    const height = parent.clientHeight;
    const dpr = renderDpr(width, height);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    const camera = props.cameraRef.current;
    context.translate(props.origin.x + camera.x, props.origin.y + camera.y);
    context.scale(camera.zoom, camera.zoom);

    const selected = new Set(props.selection.map((object) => object.id));
    for (const ink of visibleInk(props, camera, width, height)) {
      const pageY = ink.pageId ? (props.pageOffsets?.[ink.pageId] ?? 0) : 0;
      const isSelected = selected.has(ink.id);
      context.save();
      if (isSelected && props.selectionTransform) {
        const transform = props.selectionTransform;
        context.translate(transform.dx, transform.dy);
        context.scale(transform.scaleX ?? 1, transform.scaleY ?? 1);
      }
      drawBrushStroke(
        context,
        ink,
        {
          x: isSelected ? props.dragOffset.x : 0,
          y: pageY + (isSelected ? props.dragOffset.y : 0)
        },
        true
      );
      context.restore();
    }
  }, [props]);

  return <canvas ref={canvasRef} className="ink-object-layer" aria-hidden="true" />;
}

function visibleInk(props: Props, camera: Camera, width: number, height: number): readonly InkObject[] {
  const document = props.documentRef.current;
  const viewport = worldViewport(props.origin, camera, width, height);
  const activeOffset = props.activePageId ? (props.pageOffsets?.[props.activePageId] ?? 0) : 0;
  return document.objects
    .filter((object): object is InkObject => object.type === "ink" && !object.hidden)
    .filter((object) => {
      if (props.documentMode === "whiteboard") return !object.pageId && intersects(object, viewport);
      if (!object.pageId) return false;
      const offset = props.pageOffsets?.[object.pageId] ?? 0;
      return Math.abs(offset - activeOffset) <= 2600;
    });
}

function worldViewport(origin: Point, camera: Camera, width: number, height: number): Rect {
  const zoom = Math.max(0.05, camera.zoom);
  const overscan = 160 / zoom;
  return {
    x: (-origin.x - camera.x) / zoom - overscan,
    y: (-origin.y - camera.y) / zoom - overscan,
    width: width / zoom + overscan * 2,
    height: height / zoom + overscan * 2
  };
}
function intersects(object: InkObject, rect: Rect): boolean {
  const padding = object.size * 2;
  return object.x - padding <= rect.x + rect.width && object.x + object.width + padding >= rect.x &&
    object.y - padding <= rect.y + rect.height && object.y + object.height + padding >= rect.y;
}
function renderDpr(width: number, height: number): number {
  const native = window.devicePixelRatio || 1;
  const memory = (navigator as Navigator & { readonly deviceMemory?: number }).deviceMemory;
  const lowPower = (memory !== undefined && memory <= 4) || navigator.hardwareConcurrency <= 4;
  const budget = lowPower ? 7_000_000 : 14_000_000;
  return Math.max(1, Math.min(native, lowPower ? 1.5 : 2.25, Math.sqrt(budget / Math.max(1, width * height))));
}
