import { useEffect, useRef } from "react";
import { drawOverlay } from "./canvas/drawOverlay";
import { drawShape } from "./canvas/drawShape";
import {
  getInkSvgPathData,
  getInkTexture,
  getInkVisual,
  getPressureMaskSegments
} from "./canvas/inkVector";
import type { CanvasLayerProps } from "./canvas/types";
import { VectorObjectLayer } from "./VectorObjectLayer";

export type { CanvasDraftInk, CanvasLayerProps } from "./canvas/types";

/**
 * Unified vector ink pipeline:
 * - committed ink/shapes: VectorObjectLayer (SVG)
 * - live ink: imperative SVG paths updated at requestAnimationFrame cadence
 * - transient shape/lasso/selection overlays: a small canvas layer
 *
 * Live and committed handwriting therefore use the same perfect-freehand geometry.
 */
export function CanvasLayer(props: CanvasLayerProps) {
  const overlayCanvas = useRef<HTMLCanvasElement>(null);
  const liveGroup = useRef<SVGGElement>(null);
  const rawBase = useRef<SVGPathElement>(null);
  const rawTexture = useRef<SVGPathElement>(null);
  const straightBase = useRef<SVGPathElement>(null);
  const straightTexture = useRef<SVGPathElement>(null);
  const rawPressureMask = useRef<SVGGElement>(null);
  const straightPressureMask = useRef<SVGGElement>(null);

  useEffect(() => {
    const canvas = overlayCanvas.current;
    const group = liveGroup.current;
    const rawBasePath = rawBase.current;
    const rawTexturePath = rawTexture.current;
    const straightBasePath = straightBase.current;
    const straightTexturePath = straightTexture.current;
    const rawPressureMaskGroup = rawPressureMask.current;
    const straightPressureMaskGroup = straightPressureMask.current;
    if (
      !canvas ||
      !group ||
      !rawBasePath ||
      !rawTexturePath ||
      !straightBasePath ||
      !straightTexturePath ||
      !rawPressureMaskGroup ||
      !straightPressureMaskGroup
    )
      return;

    let frame = 0;
    let rawKey = "";
    let straightKey = "";

    const hidePair = (base: SVGPathElement, texture: SVGPathElement) => {
      base.style.display = "none";
      texture.style.display = "none";
    };

    const updatePressureMask = (
      group: SVGGElement,
      segments: ReturnType<typeof getPressureMaskSegments>
    ) => {
      while (group.childElementCount < segments.length) {
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("stroke", "white");
        line.setAttribute("stroke-linecap", "round");
        group.appendChild(line);
      }
      while (group.childElementCount > segments.length) group.lastElementChild?.remove();
      segments.forEach((segment, index) => {
        const line = group.children[index] as SVGLineElement;
        line.setAttribute("x1", String(segment.from.x));
        line.setAttribute("y1", String(segment.from.y));
        line.setAttribute("x2", String(segment.to.x));
        line.setAttribute("y2", String(segment.to.y));
        line.setAttribute("stroke-opacity", String(segment.opacity));
        line.setAttribute("stroke-width", String((props.draftRef.current?.size ?? 1) * 2.5));
      });
    };

    const paintLivePair = (
      base: SVGPathElement,
      texture: SVGPathElement,
      draft: NonNullable<typeof props.draftRef.current>,
      points: NonNullable<typeof props.draftRef.current>["points"],
      opacity: number,
      activeOffset: number,
      keyPrefix: string,
      currentKey: string,
      maskGroup: SVGGElement,
      maskId: string
    ): string => {
      if (!points.length || opacity <= 0.001) {
        hidePair(base, texture);
        return "";
      }
      const last = points.at(-1)!;
      const key = [
        keyPrefix,
        points.length,
        last.x.toFixed(3),
        last.y.toFixed(3),
        last.pressure.toFixed(3),
        opacity.toFixed(3),
        draft.color,
        draft.size.toFixed(3),
        draft.smoothing.toFixed(3),
        draft.captureZoom.toFixed(3),
        draft.brushId,
        draft.dynamics.pressureSensitivity.toFixed(3),
        draft.dynamics.pressureAffectsWidth ? 1 : 0,
        draft.dynamics.pressureAffectsOpacity ? 1 : 0,
        draft.dynamics.tiltAffectsAngle ? 1 : 0
      ].join(":");
      if (key === currentKey) return currentKey;

      const ink = {
        color: draft.color,
        size: draft.size,
        tool: draft.tool,
        smoothing: draft.smoothing,
        captureZoom: draft.captureZoom,
        brushId: draft.brushId,
        dynamics: draft.dynamics,
        opacity: 1,
        points
      };
      const visual = getInkVisual(ink);
      const textureSpec = getInkTexture(ink);
      const d = getInkSvgPathData(ink);
      const baseOpacity = visual.baseAlpha * opacity;
      const pageTransform = `translate(0 ${activeOffset})`;

      base.setAttribute("d", d);
      base.setAttribute("fill", draft.color);
      base.setAttribute("fill-opacity", String(baseOpacity));
      base.setAttribute("transform", pageTransform);
      base.style.mixBlendMode = visual.multiply ? "multiply" : "normal";
      base.style.display = d ? "" : "none";
      const pressureSegments = getPressureMaskSegments(ink);
      updatePressureMask(maskGroup, pressureSegments);
      if (pressureSegments.length) base.setAttribute("mask", `url(#${maskId})`);
      else base.removeAttribute("mask");

      if (textureSpec?.d) {
        texture.setAttribute("d", textureSpec.d);
        texture.setAttribute("fill", "none");
        texture.setAttribute("stroke", draft.color);
        texture.setAttribute("stroke-opacity", String(textureSpec.opacity * opacity));
        texture.setAttribute("stroke-width", String(textureSpec.strokeWidth));
        texture.setAttribute("stroke-linecap", "round");
        texture.setAttribute("transform", pageTransform);
        texture.style.mixBlendMode = visual.multiply ? "multiply" : "normal";
        if (pressureSegments.length) texture.setAttribute("mask", `url(#${maskId})`);
        else texture.removeAttribute("mask");
        texture.style.display = "";
      } else {
        texture.style.display = "none";
      }
      return key;
    };

    const render = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const width = parent.clientWidth;
      const height = parent.clientHeight;
      const nativeDpr = window.devicePixelRatio || 1;
      const navigatorWithMemory = navigator as Navigator & { readonly deviceMemory?: number };
      const lowPower =
        (navigatorWithMemory.deviceMemory !== undefined && navigatorWithMemory.deviceMemory <= 4) ||
        navigator.hardwareConcurrency <= 4;
      const pixelBudget = lowPower ? 7_000_000 : 14_000_000;
      const maxDprForViewport = Math.sqrt(pixelBudget / Math.max(width * height, 1));
      const renderDpr = Math.max(
        1,
        Math.min(nativeDpr, lowPower ? 1.5 : 2.25, maxDprForViewport)
      );
      const targetWidth = Math.round(width * renderDpr);
      const targetHeight = Math.round(height * renderDpr);
      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }

      const camera = props.cameraRef.current;
      group.setAttribute(
        "transform",
        `translate(${props.origin.x + camera.x} ${props.origin.y + camera.y}) scale(${camera.zoom})`
      );
      const activeOffset = props.activePageId
        ? (props.pageOffsets?.[props.activePageId] ?? 0)
        : 0;

      const draft = props.draftRef.current;
      if (!draft?.points.length) {
        hidePair(rawBasePath, rawTexturePath);
        hidePair(straightBasePath, straightTexturePath);
        rawKey = "";
        straightKey = "";
      } else if (draft.straightLine) {
        const progress = Math.min(1, (performance.now() - draft.straightLine.startedAt) / 180);
        rawKey = paintLivePair(
          rawBasePath,
          rawTexturePath,
          draft,
          draft.points,
          1 - progress,
          activeOffset,
          "raw",
          rawKey,
          rawPressureMaskGroup,
          "notylo-live-raw-pressure"
        );
        straightKey = paintLivePair(
          straightBasePath,
          straightTexturePath,
          draft,
          draft.straightLine.points,
          progress,
          activeOffset,
          "straight",
          straightKey,
          straightPressureMaskGroup,
          "notylo-live-straight-pressure"
        );
      } else {
        rawKey = paintLivePair(
          rawBasePath,
          rawTexturePath,
          draft,
          draft.points,
          1,
          activeOffset,
          "raw",
          rawKey,
          rawPressureMaskGroup,
          "notylo-live-raw-pressure"
        );
        hidePair(straightBasePath, straightTexturePath);
        straightKey = "";
      }

      const context = canvas.getContext("2d");
      if (context) {
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.setTransform(renderDpr, 0, 0, renderDpr, 0, 0);
        context.translate(props.origin.x + camera.x, props.origin.y + camera.y);
        context.scale(camera.zoom, camera.zoom);
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
      }

      // rAF naturally follows 60/90/120/144Hz displays. No extra 60Hz throttle.
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
      <svg
        aria-hidden="true"
        focusable="false"
        shapeRendering="geometricPrecision"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          zIndex: 3,
          overflow: "hidden"
        }}
      >
        <defs>
          <mask id="notylo-live-raw-pressure" maskContentUnits="userSpaceOnUse">
            <g ref={rawPressureMask} />
          </mask>
          <mask id="notylo-live-straight-pressure" maskContentUnits="userSpaceOnUse">
            <g ref={straightPressureMask} />
          </mask>
        </defs>
        <g ref={liveGroup}>
          <path ref={rawBase} style={{ display: "none" }} />
          <path ref={rawTexture} style={{ display: "none" }} />
          <path ref={straightBase} style={{ display: "none" }} />
          <path ref={straightTexture} style={{ display: "none" }} />
        </g>
      </svg>
      <canvas
        className="ink-canvas"
        ref={overlayCanvas}
        aria-hidden="true"
        style={{ zIndex: 4 }}
      />
    </>
  );
}
