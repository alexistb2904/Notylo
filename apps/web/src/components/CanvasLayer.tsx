import { useEffect, useRef } from "react";
import { drawOverlay } from "./canvas/drawOverlay";
import { drawShape } from "./canvas/drawShape";
import { drawInkVectorPreview, type InkRenderQuality } from "./canvas/inkVector";
import type { CanvasLayerProps } from "./canvas/types";
import { VectorObjectLayer } from "./VectorObjectLayer";

export type { CanvasDraftInk, CanvasLayerProps } from "./canvas/types";

/**
 * The canvas is now transient only: live ink, shape previews and overlays.
 * Finished ink/shapes are rendered by VectorObjectLayer as real SVG vectors.
 */
export function CanvasLayer(props: CanvasLayerProps) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const target = canvas.current;
    if (!target) return;
    let frame = 0;

    const render = () => {
      const parent = target.parentElement;
      if (!parent) return;
      const width = parent.clientWidth;
      const height = parent.clientHeight;
      const navigatorWithMemory = navigator as Navigator & { readonly deviceMemory?: number };
      const lowPower =
        (navigatorWithMemory.deviceMemory !== undefined && navigatorWithMemory.deviceMemory <= 4) ||
        navigator.hardwareConcurrency <= 4;
      const quality: InkRenderQuality = lowPower ? "economy" : "full";
      const nativeDpr = window.devicePixelRatio || 1;
      // Mild supersampling on ordinary 1x desktop displays improves the live
      // preview without affecting the committed SVG or exceeding the pixel budget.
      const desiredDpr = Math.max(nativeDpr, lowPower ? 1.2 : 1.5);
      const dprLimit = lowPower ? 1.6 : 2.5;
      const pixelBudget = lowPower ? 9_000_000 : 18_000_000;
      const maxDprForViewport = Math.sqrt(pixelBudget / Math.max(width * height, 1));
      const renderDpr = Math.max(1, Math.min(desiredDpr, dprLimit, maxDprForViewport));
      const targetWidth = Math.round(width * renderDpr);
      const targetHeight = Math.round(height * renderDpr);
      if (target.width !== targetWidth || target.height !== targetHeight) {
        target.width = targetWidth;
        target.height = targetHeight;
        target.style.width = `${width}px`;
        target.style.height = `${height}px`;
      }

      const context = target.getContext("2d");
      if (!context) return;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, target.width, target.height);
      context.setTransform(renderDpr, 0, 0, renderDpr, 0, 0);

      const camera = props.cameraRef.current;
      context.translate(props.origin.x + camera.x, props.origin.y + camera.y);
      context.scale(camera.zoom, camera.zoom);
      const activeOffset = props.activePageId
        ? (props.pageOffsets?.[props.activePageId] ?? 0)
        : 0;
      const draft = props.draftRef.current;
      if (draft?.points.length) {
        const base = {
          color: draft.color,
          size: draft.size,
          tool: draft.tool,
          smoothing: draft.smoothing,
          brushId: draft.brushId,
          dynamics: draft.dynamics,
          opacity: 1
        };
        if (draft.straightLine) {
          const progress = Math.min(
            1,
            (performance.now() - draft.straightLine.startedAt) / 180
          );
          drawInkVectorPreview(
            context,
            { ...base, points: draft.points },
            { x: 0, y: activeOffset },
            false,
            1 - progress,
            quality
          );
          drawInkVectorPreview(
            context,
            { ...base, points: draft.straightLine.points },
            { x: 0, y: activeOffset },
            false,
            progress,
            quality
          );
        } else {
          drawInkVectorPreview(
            context,
            { ...base, points: draft.points },
            { x: 0, y: activeOffset },
            false,
            1,
            quality
          );
        }
      }
      if (props.shapeDraftRef.current)
        drawShape(context, props.shapeDraftRef.current, { x: 0, y: activeOffset });

      context.save();
      context.translate(0, activeOffset);
      drawOverlay(context, {
        camera,
        selectionRect: props.selectionRect,
        lasso: props.lasso
      });
      context.restore();

      // requestAnimationFrame already follows the display refresh rate (60/90/120/144Hz).
      // Do not add another 60Hz throttle: it makes stylus ink visibly stutter on fast panels.
      if (props.renderContinuously) frame = requestAnimationFrame(render);
    };

    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [props]);

  return (
    <>
      <VectorObjectLayer
        documentRef={props.documentRef}
        activePageId={props.activePageId}
        pageOffsets={props.pageOffsets}
        documentMode={props.documentMode}
        origin={props.origin}
        cameraRef={props.cameraRef}
        selection={props.selection}
        dragOffset={props.dragOffset}
      />
      <canvas className="ink-canvas" ref={canvas} aria-hidden="true" />
    </>
  );
}
