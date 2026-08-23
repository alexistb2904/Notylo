import type { Camera, Point, Rect } from "@notylo/canvas-engine";
import type { DocumentObject, InkObject, NotebookDocument, Transform } from "@notylo/document-model";
import { useEffect, useRef, type MutableRefObject } from "react";
import { drawBrushStroke, releaseBrushStrokeGeometry } from "./canvas/brushEngine";

interface RasterizedStroke {
  readonly canvas: HTMLCanvasElement;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly pixels: number;
}

const strokeRasterCache = new Map<string, RasterizedStroke>();
let cachedPixels = 0;
const MAX_CACHED_PIXELS = 24_000_000;
const VISIBLE_RASTER_BUDGET = 18_000_000;

interface RenderState {
  readonly viewKey: string;
  readonly signatures: readonly string[];
  readonly selectionKey: string;
}

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

/** Finalized strokes are textured once, then composited as cheap images. */
export function InkObjectLayer(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderStateRef = useRef<RenderState | undefined>(undefined);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const width = parent.clientWidth;
    const height = parent.clientHeight;
    const dpr = renderDpr(width, height);
    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));
    const resized = canvas.width !== pixelWidth || canvas.height !== pixelHeight;
    if (resized) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const context = canvas.getContext("2d");
    if (!context) return;

    const camera = props.cameraRef.current;
    const inkObjects = visibleInk(props, camera, width, height);
    const rasterScale = fittedRasterScale(dpr, camera.zoom, inkObjects);
    const signatures = inkObjects.map((ink) => strokeSignature(ink, rasterScale,
      ink.pageId ? (props.pageOffsets?.[ink.pageId] ?? 0) : 0));
    const selected = new Set(props.selection.map((object) => object.id));
    const selectionKey = selectionRenderKey(props);
    const viewKey = [width, height, dpr, props.origin.x, props.origin.y, camera.x, camera.y,
      camera.zoom, props.documentMode, props.activePageId ?? ""].join(":");
    const previous = renderStateRef.current;
    const sameView = !resized && previous?.viewKey === viewKey;
    const sameInk = sameView && equalSignatures(previous.signatures, signatures);
    if (sameInk && previous.selectionKey === selectionKey) return;

    const canAppend = sameView && !selectionKey && !previous.selectionKey &&
      isSignaturePrefix(previous.signatures, signatures);
    if (!canAppend) {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
    }
    context.setTransform(dpr * camera.zoom, 0, 0, dpr * camera.zoom,
      dpr * (props.origin.x + camera.x), dpr * (props.origin.y + camera.y));

    const firstInk = canAppend ? previous.signatures.length : 0;
    for (let index = firstInk; index < inkObjects.length; index++) {
      const ink = inkObjects[index]!;
      const pageY = ink.pageId ? (props.pageOffsets?.[ink.pageId] ?? 0) : 0;
      const isSelected = selected.has(ink.id);
      context.save();
      if (isSelected && props.selectionTransform) {
        const transform = props.selectionTransform;
        context.translate(transform.dx, transform.dy);
        context.scale(transform.scaleX ?? 1, transform.scaleY ?? 1);
      }
      const raster = rasterizeStroke(ink, rasterScale);
      context.drawImage(
        raster.canvas,
        raster.x + (isSelected ? props.dragOffset.x : 0),
        raster.y + pageY + (isSelected ? props.dragOffset.y : 0),
        raster.width,
        raster.height
      );
      context.restore();
    }
    renderStateRef.current = { viewKey, signatures, selectionKey };
  }, [props]);

  return <canvas ref={canvasRef} className="ink-object-layer" aria-hidden="true" />;
}

function rasterizeStroke(ink: InkObject, requestedScale: number): RasterizedStroke {
  const padding = Math.max(3, ink.size * (1.25 + ink.brush.scatter * 3));
  const width = Math.max(1, ink.width) + padding * 2;
  const height = Math.max(1, ink.height) + padding * 2;
  const scale = Math.max(0.25, Math.min(
    requestedScale,
    4096 / width,
    4096 / height,
    Math.sqrt(4_000_000 / Math.max(1, width * height))
  ));
  const key = [ink.notebookId, ink.id, ink.updatedAt, ink.points.length, ink.x, ink.y,
    ink.width, ink.height, ink.color, ink.size, ink.opacity, ink.brush.id,
    scale.toFixed(3)].join(":");
  const cached = strokeRasterCache.get(key);
  if (cached) {
    strokeRasterCache.delete(key);
    strokeRasterCache.set(key, cached);
    return cached;
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width * scale));
  canvas.height = Math.max(1, Math.ceil(height * scale));
  const context = canvas.getContext("2d");
  if (context) {
    context.setTransform(scale, 0, 0, scale, padding * scale - ink.x * scale,
      padding * scale - ink.y * scale);
    drawBrushStroke(context, ink);
    releaseBrushStrokeGeometry(ink.points);
  }
  const raster = {
    canvas,
    x: ink.x - padding,
    y: ink.y - padding,
    width,
    height,
    pixels: canvas.width * canvas.height
  };
  strokeRasterCache.set(key, raster);
  cachedPixels += raster.pixels;
  trimRasterCache();
  return raster;
}

function trimRasterCache(): void {
  while (cachedPixels > MAX_CACHED_PIXELS) {
    const oldestKey = strokeRasterCache.keys().next().value as string | undefined;
    if (!oldestKey) return;
    const oldest = strokeRasterCache.get(oldestKey);
    strokeRasterCache.delete(oldestKey);
    cachedPixels -= oldest?.pixels ?? 0;
  }
}

function fittedRasterScale(dpr: number, zoom: number, inkObjects: readonly InkObject[]): number {
  const desired = Math.ceil(Math.min(3, Math.max(1, dpr * zoom)) * 2) / 2;
  const logicalPixels = inkObjects.reduce((total, ink) => {
    const padding = Math.max(3, ink.size * (1.25 + ink.brush.scatter * 3));
    return total + (Math.max(1, ink.width) + padding * 2) *
      (Math.max(1, ink.height) + padding * 2);
  }, 0);
  if (!logicalPixels) return desired;
  const fitted = Math.max(0.5, Math.min(desired,
    Math.sqrt(VISIBLE_RASTER_BUDGET / logicalPixels)));
  return [3, 2.5, 2, 1.5, 1, 0.75, 0.5].find((scale) => scale <= fitted) ?? 0.5;
}

function strokeSignature(ink: InkObject, scale: number, pageY: number): string {
  return [ink.id, ink.updatedAt, ink.points.length, ink.x, ink.y, ink.width, ink.height,
    ink.color, ink.size, ink.opacity, ink.brush.id, scale.toFixed(3), pageY].join(":");
}

function selectionRenderKey(props: Props): string {
  if (!props.selection.length) return "";
  const transform = props.selectionTransform;
  return [props.selection.map((object) => object.id).join(","), props.dragOffset.x,
    props.dragOffset.y, transform?.dx ?? 0, transform?.dy ?? 0,
    transform?.scaleX ?? 1, transform?.scaleY ?? 1].join(":");
}

function equalSignatures(previous: readonly string[], next: readonly string[]): boolean {
  return previous.length === next.length && previous.every((value, index) => value === next[index]);
}

function isSignaturePrefix(previous: readonly string[], next: readonly string[]): boolean {
  return previous.length < next.length && previous.every((value, index) => value === next[index]);
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
