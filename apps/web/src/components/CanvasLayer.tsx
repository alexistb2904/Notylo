import { useEffect, useRef } from "react";
import type { NotebookDocument } from "@notylo/document-model";
import { drawInk, type InkRenderQuality } from "./canvas/drawInk";
import { drawOverlay } from "./canvas/drawOverlay";
import { drawShape } from "./canvas/drawShape";
import type { CanvasLayerProps } from "./canvas/types";
import { objectIntersectsViewport, preferredOverscan, renderViewport } from "./canvas/visibility";

export type { CanvasDraftInk, CanvasLayerProps } from "./canvas/types";

interface DocumentLayerCache {
  readonly canvas: HTMLCanvasElement;
  readonly document: NotebookDocument;
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
  readonly overscan: number;
  readonly zoom: number;
  readonly cameraX: number;
  readonly cameraY: number;
  readonly originX: number;
  readonly originY: number;
  readonly pageOffsets?: CanvasLayerProps["pageOffsets"];
  readonly documentMode: CanvasLayerProps["documentMode"];
  readonly movementKey: string;
  readonly quality: InkRenderQuality;
}

/** Canvas orchestration with a viewport-aware, reusable document layer. */
export function CanvasLayer(props: CanvasLayerProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const documentCache = useRef<DocumentLayerCache | undefined>(undefined);

  useEffect(() => {
    const target = canvas.current;
    if (!target) return;
    let frame = 0;
    let lastPaint = -Infinity;

    const render = (timestamp: number) => {
      const parent = target.parentElement;
      if (!parent) return;
      const width = parent.clientWidth;
      const height = parent.clientHeight;
      const navigatorWithMemory = navigator as Navigator & { readonly deviceMemory?: number };
      const lowPower =
        (navigatorWithMemory.deviceMemory !== undefined && navigatorWithMemory.deviceMemory <= 4) ||
        navigator.hardwareConcurrency <= 4 ||
        Math.min(width, height) <= 720;
      const quality: InkRenderQuality = lowPower ? "economy" : "full";

      // Pointer events can arrive well above display refresh rate. Keep visual
      // feedback at a stable 60 fps ceiling rather than repainting at 120/240 Hz.
      if (props.renderContinuously && timestamp - lastPaint < 15.5) {
        frame = requestAnimationFrame(render);
        return;
      }
      lastPaint = timestamp;

      const overscan = preferredOverscan(width, height, lowPower);
      const nativeDpr = window.devicePixelRatio || 1;
      const dprLimit = lowPower ? 1.25 : 1.8;
      const pixelBudget = lowPower ? 7_000_000 : 13_000_000;
      const maxDprForViewport = Math.sqrt(pixelBudget / Math.max(width * height, 1));
      const renderDpr = Math.max(1, Math.min(nativeDpr, dprLimit, maxDprForViewport));
      const targetWidth = Math.round(width * renderDpr);
      const targetHeight = Math.round(height * renderDpr);
      if (target.width !== targetWidth || target.height !== targetHeight) {
        target.width = targetWidth;
        target.height = targetHeight;
        target.style.width = `${width}px`;
        target.style.height = `${height}px`;
      }

      const camera = props.cameraRef.current;
      const movingSelection = Boolean(props.dragOffset.x || props.dragOffset.y);
      const movementKey = movingSelection
        ? props.selection
            .map((object) => object.id)
            .sort()
            .join("|")
        : "";
      let cache = documentCache.current;
      const canReuse =
        cache?.document === props.documentRef.current &&
        cache.width === width &&
        cache.height === height &&
        cache.dpr === renderDpr &&
        cache.zoom === camera.zoom &&
        cache.originX === props.origin.x &&
        cache.originY === props.origin.y &&
        cache.pageOffsets === props.pageOffsets &&
        cache.documentMode === props.documentMode &&
        cache.movementKey === movementKey &&
        cache.quality === quality &&
        Math.abs(camera.x - cache.cameraX) <= cache.overscan * 0.55 &&
        Math.abs(camera.y - cache.cameraY) <= cache.overscan * 0.55;

      if (!canReuse) {
        const layer = window.document.createElement("canvas");
        layer.width = Math.round((width + overscan * 2) * renderDpr);
        layer.height = Math.round((height + overscan * 2) * renderDpr);
        const layerContext = layer.getContext("2d");
        if (!layerContext) return;
        layerContext.imageSmoothingEnabled = true;
        layerContext.setTransform(renderDpr, 0, 0, renderDpr, 0, 0);
        layerContext.translate(
          overscan + props.origin.x + camera.x,
          overscan + props.origin.y + camera.y
        );
        layerContext.scale(camera.zoom, camera.zoom);
        const viewport = renderViewport(width, height, props.origin, camera, overscan);
        const movedIds = movingSelection
          ? new Set(props.selection.map((object) => object.id))
          : new Set<string>();
        for (const object of props.documentRef.current.objects) {
          const belongsToSurface =
            props.documentMode === "whiteboard" ? !object.pageId : Boolean(object.pageId);
          if (!belongsToSurface || object.hidden || movedIds.has(object.id)) continue;
          const pageOffsetY = object.pageId ? (props.pageOffsets?.[object.pageId] ?? 0) : 0;
          if (!objectIntersectsViewport(object, viewport, pageOffsetY)) continue;
          const offset = { x: 0, y: pageOffsetY };
          if (object.type === "ink") {
            drawInk(
              layerContext,
              object,
              offset,
              true,
              1,
              { ...viewport, y: viewport.y - pageOffsetY },
              quality
            );
          }
          if (object.type === "shape") drawShape(layerContext, object, offset);
        }
        cache = {
          canvas: layer,
          document: props.documentRef.current,
          width,
          height,
          dpr: renderDpr,
          overscan,
          zoom: camera.zoom,
          cameraX: camera.x,
          cameraY: camera.y,
          originX: props.origin.x,
          originY: props.origin.y,
          pageOffsets: props.pageOffsets,
          documentMode: props.documentMode,
          movementKey,
          quality
        };
        documentCache.current = cache;
      }

      const context = target.getContext("2d");
      if (!context || !cache) return;
      context.imageSmoothingEnabled = true;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, target.width, target.height);
      const sourceX = Math.round((cache.overscan - (camera.x - cache.cameraX)) * renderDpr);
      const sourceY = Math.round((cache.overscan - (camera.y - cache.cameraY)) * renderDpr);
      context.drawImage(
        cache.canvas,
        sourceX,
        sourceY,
        target.width,
        target.height,
        0,
        0,
        target.width,
        target.height
      );
      context.setTransform(renderDpr, 0, 0, renderDpr, 0, 0);
      context.translate(props.origin.x + camera.x, props.origin.y + camera.y);
      context.scale(camera.zoom, camera.zoom);

      const activeOffset = props.activePageId ? (props.pageOffsets?.[props.activePageId] ?? 0) : 0;
      const draft = props.draftRef.current;
      if (draft?.points.length) {
        const base = {
          color: draft.color,
          size: draft.size,
          tool: draft.tool,
          smoothing: draft.smoothing,
          brushId: draft.brushId,
          dynamics: draft.dynamics
        };
        if (draft.straightLine) {
          const progress = Math.min(1, (performance.now() - draft.straightLine.startedAt) / 180);
          drawInk(
            context,
            { ...base, points: draft.points },
            { x: 0, y: activeOffset },
            false,
            1 - progress,
            undefined,
            quality
          );
          drawInk(
            context,
            { ...base, points: draft.straightLine.points },
            { x: 0, y: activeOffset },
            false,
            progress,
            undefined,
            quality
          );
        } else {
          drawInk(
            context,
            { ...base, points: draft.points },
            { x: 0, y: activeOffset },
            false,
            1,
            undefined,
            quality
          );
        }
      }
      if (props.shapeDraftRef.current)
        drawShape(context, props.shapeDraftRef.current, { x: 0, y: activeOffset });
      if (movingSelection) {
        for (const object of props.selection) {
          const offset = { x: props.dragOffset.x, y: props.dragOffset.y + activeOffset };
          if (object.type === "ink")
            drawInk(context, object, offset, true, 1, undefined, quality);
          if (object.type === "shape") drawShape(context, object, offset);
        }
      }
      context.save();
      context.translate(0, activeOffset);
      drawOverlay(context, { camera, selectionRect: props.selectionRect, lasso: props.lasso });
      context.restore();
      if (props.renderContinuously) frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [props]);

  return <canvas className="ink-canvas" ref={canvas} aria-hidden="true" />;
}
