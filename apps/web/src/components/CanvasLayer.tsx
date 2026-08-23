import { useEffect, useRef } from "react";
import {
  drawBrushStroke,
  drawBrushStrokeIncremental,
  resetIncrementalBrushStroke
} from "./canvas/brushEngine";
import { drawOverlay } from "./canvas/drawOverlay";
import { drawShape } from "./canvas/drawShape";
import type { CanvasDraftInk, CanvasLayerProps } from "./canvas/types";
import { InkObjectLayer } from "./InkObjectLayer";
import { VectorObjectLayer } from "./VectorObjectLayer";

export type { CanvasDraftInk, CanvasLayerProps } from "./canvas/types";

/** One stamp-mask engine powers the live surface, committed ink and bitmap exports. */
export function CanvasLayer(props: CanvasLayerProps) {
  const liveCanvas = useRef<HTMLCanvasElement>(null);
  const overlayCanvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const live = liveCanvas.current;
    const overlay = overlayCanvas.current;
    if (!live || !overlay) return;
    let frame = 0;
    let activePoints: CanvasDraftInk["points"] | undefined;
    let liveViewKey = "";
    let renderingStraightLine = false;

    const render = () => {
      const parent = live.parentElement;
      if (!parent) return;
      const width = parent.clientWidth;
      const height = parent.clientHeight;
      const dpr = renderDpr(width, height);
      const liveResized = prepareCanvas(live, width, height, dpr);
      prepareCanvas(overlay, width, height, dpr);
      const liveContext = live.getContext("2d");
      const overlayContext = overlay.getContext("2d");
      if (!liveContext || !overlayContext) return;
      resetCanvas(overlayContext, overlay, dpr);

      const camera = props.cameraRef.current;
      const activeOffset = props.activePageId ? (props.pageOffsets?.[props.activePageId] ?? 0) : 0;
      const draft = props.draftRef.current;
      const nextViewKey = [width, height, dpr, props.origin.x, props.origin.y,
        camera.x, camera.y, camera.zoom, activeOffset].join(":");
      if (draft?.points.length) {
        const stroke = {
          points: draft.points,
          color: draft.color,
          size: draft.size,
          brush: draft.brush,
          opacity: 1
        };
        if (draft.straightLine) {
          clearCanvas(liveContext, live, dpr);
          setWorldTransform(liveContext, dpr, props.origin.x, props.origin.y,
            camera.x, camera.y, camera.zoom);
          const progress = Math.min(1, (performance.now() - draft.straightLine.startedAt) / 180);
          drawBrushStroke(liveContext, stroke, { x: 0, y: activeOffset }, false, 1 - progress);
          drawBrushStroke(
            liveContext,
            { ...stroke, points: draft.straightLine.points },
            { x: 0, y: activeOffset },
            false,
            progress
          );
          renderingStraightLine = true;
          activePoints = draft.points;
        } else {
          const needsReplay = liveResized || renderingStraightLine || activePoints !== draft.points ||
            liveViewKey !== nextViewKey;
          if (needsReplay) {
            if (activePoints) resetIncrementalBrushStroke(activePoints);
            resetIncrementalBrushStroke(draft.points);
            clearCanvas(liveContext, live, dpr);
          }
          setWorldTransform(liveContext, dpr, props.origin.x, props.origin.y,
            camera.x, camera.y, camera.zoom);
          drawBrushStrokeIncremental(liveContext, stroke, { x: 0, y: activeOffset });
          renderingStraightLine = false;
          activePoints = draft.points;
        }
      } else {
        if (activePoints) resetIncrementalBrushStroke(activePoints);
        clearCanvas(liveContext, live, dpr);
        activePoints = undefined;
        renderingStraightLine = false;
      }
      liveViewKey = nextViewKey;

      applyWorldTransform(overlayContext, props.origin.x, props.origin.y, camera.x, camera.y, camera.zoom);
      if (props.shapeDraftRef.current)
        drawShape(overlayContext, props.shapeDraftRef.current, { x: 0, y: activeOffset });
      overlayContext.save();
      overlayContext.translate(0, activeOffset);
      drawOverlay(overlayContext, {
        camera,
        selectionRect: props.selectionRect,
        lasso: props.lasso
      });
      overlayContext.restore();
      if (props.renderContinuously) frame = requestAnimationFrame(render);
    };

    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [props]);

  return (
    <>
      <InkObjectLayer
        documentRef={props.documentRef}
        activePageId={props.activePageId}
        pageOffsets={props.pageOffsets}
        documentMode={props.documentMode}
        origin={props.origin}
        cameraRef={props.cameraRef}
        selection={props.selection}
        selectionTransform={props.selectionTransform}
        dragOffset={props.dragOffset}
      />
      <VectorObjectLayer
        documentRef={props.documentRef}
        activePageId={props.activePageId}
        pageOffsets={props.pageOffsets}
        documentMode={props.documentMode}
        origin={props.origin}
        cameraRef={props.cameraRef}
        selection={props.selection}
        selectionTransform={props.selectionTransform}
        dragOffset={props.dragOffset}
      />
      <canvas ref={liveCanvas} className="ink-canvas live-ink-canvas" aria-hidden="true" />
      <canvas ref={overlayCanvas} className="ink-canvas" aria-hidden="true" style={{ zIndex: 4 }} />
    </>
  );
}

function prepareCanvas(canvas: HTMLCanvasElement, width: number, height: number, dpr: number): boolean {
  const targetWidth = Math.max(1, Math.round(width * dpr));
  const targetHeight = Math.max(1, Math.round(height * dpr));
  if (canvas.width === targetWidth && canvas.height === targetHeight) return false;
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  return true;
}
function resetCanvas(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, dpr: number): void {
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function clearCanvas(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, dpr: number): void {
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function setWorldTransform(
  context: CanvasRenderingContext2D,
  dpr: number,
  originX: number,
  originY: number,
  cameraX: number,
  cameraY: number,
  zoom: number
): void {
  context.setTransform(
    dpr * zoom,
    0,
    0,
    dpr * zoom,
    dpr * (originX + cameraX),
    dpr * (originY + cameraY)
  );
}
function applyWorldTransform(
  context: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  cameraX: number,
  cameraY: number,
  zoom: number
): void {
  context.translate(originX + cameraX, originY + cameraY);
  context.scale(zoom, zoom);
}
function renderDpr(width: number, height: number): number {
  const native = window.devicePixelRatio || 1;
  const memory = (navigator as Navigator & { readonly deviceMemory?: number }).deviceMemory;
  const lowPower = (memory !== undefined && memory <= 4) || navigator.hardwareConcurrency <= 4;
  const budget = lowPower ? 7_000_000 : 14_000_000;
  return Math.max(1, Math.min(native, lowPower ? 1.5 : 2.25, Math.sqrt(budget / Math.max(1, width * height))));
}
