import { CanvasEngine, type Camera, type Point, type Rect } from "@notylo/canvas-engine";
import type {
  DocumentObject,
  InkObject,
  NotebookDocument,
  ShapeObject,
  Transform
} from "@notylo/document-model";
import { memo, useMemo, type MutableRefObject } from "react";
import {
  getInkSvgPathData,
  getInkTexture,
  getInkVisual,
  getPressureMaskSegments
} from "./canvas/inkVector";

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

type VectorObject = InkObject | ShapeObject;

interface VectorIndexState {
  readonly engine: CanvasEngine;
  readonly byPage: ReadonlyMap<string, readonly VectorObject[]>;
  readonly order: ReadonlyMap<string, number>;
}

/** Committed vector objects. No bitmap cache is involved at any zoom level. */
export function VectorObjectLayer(props: Props) {
  const camera = props.cameraRef.current;
  const currentDocument = props.documentRef.current;
  const selectedIds = new Set(props.selection.map((object) => object.id));
  const activeOffset = props.activePageId ? (props.pageOffsets?.[props.activePageId] ?? 0) : 0;
  const indexState = useMemo(() => buildVectorIndex(currentDocument), [currentDocument]);
  const objects = visibleVectorObjects(props, camera, activeOffset, indexState);

  return (
    <svg
      className="vector-object-layer"
      aria-hidden="true"
      focusable="false"
      shapeRendering="geometricPrecision"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 2,
        overflow: "hidden"
      }}
    >
      <g
        transform={`translate(${props.origin.x + camera.x} ${props.origin.y + camera.y}) scale(${camera.zoom})`}
      >
        {objects.map((object) => {
          const pageOffsetY = object.pageId ? (props.pageOffsets?.[object.pageId] ?? 0) : 0;
          const selected = selectedIds.has(object.id);
          const dx = selected ? props.dragOffset.x : 0;
          const dy = pageOffsetY + (selected ? props.dragOffset.y : 0);
          const resize = selected ? props.selectionTransform : undefined;
          const resizeTransform = resize
            ? `translate(${resize.dx} ${resize.dy}) scale(${resize.scaleX ?? 1} ${resize.scaleY ?? 1})`
            : undefined;
          return (
            <g key={object.id} transform={resizeTransform}>
              {object.type === "ink" ? (
                <SvgInk object={object} dx={dx} dy={dy} />
              ) : (
                <SvgShape object={object} dx={dx} dy={dy} />
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}

function buildVectorIndex(document: NotebookDocument): VectorIndexState {
  const objects = document.objects.filter(isVectorObject);
  const engine = new CanvasEngine();
  engine.setObjects(objects);
  const byPage = new Map<string, VectorObject[]>();
  const order = new Map<string, number>();
  objects.forEach((object, index) => {
    order.set(object.id, index);
    if (!object.pageId) return;
    const page = byPage.get(object.pageId) ?? [];
    page.push(object);
    byPage.set(object.pageId, page);
  });
  return { engine, byPage, order };
}

function visibleVectorObjects(
  props: Props,
  camera: Camera,
  activeOffset: number,
  state: VectorIndexState
): readonly VectorObject[] {
  let visible: VectorObject[];
  if (props.documentMode === "whiteboard") {
    const viewport = whiteboardViewport(props.origin, camera);
    visible = state.engine
      .objectsInViewport(expandRect(viewport, 96 / Math.max(camera.zoom, 0.05)))
      .filter(isVectorObject)
      .filter((object) => !object.pageId);
  } else {
    visible = [];
    for (const [pageId, objects] of state.byPage) {
      const offset = props.pageOffsets?.[pageId] ?? 0;
      if (Math.abs(offset - activeOffset) <= 2600) visible.push(...objects);
    }
  }

  const present = new Set(visible.map((object) => object.id));
  for (const selected of props.selection) {
    if (!isVectorObject(selected) || present.has(selected.id)) continue;
    visible.push(selected);
    present.add(selected.id);
  }

  return visible
    .filter((object) => !object.hidden)
    .sort(
      (a, b) =>
        (state.order.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (state.order.get(b.id) ?? Number.MAX_SAFE_INTEGER)
    );
}

function isVectorObject(object: DocumentObject): object is VectorObject {
  return object.type === "ink" || object.type === "shape";
}

const SvgInk = memo(function SvgInk({
  object,
  dx,
  dy
}: {
  readonly object: InkObject;
  readonly dx: number;
  readonly dy: number;
}) {
  const d = getInkSvgPathData(object);
  if (!d) return null;
  const visual = getInkVisual(object);
  const texture = getInkTexture(object);
  const maskSegments = getPressureMaskSegments(object);
  const maskId = `ink-pressure-${safeSvgId(object.id)}`;
  const transform = dx || dy ? `translate(${dx} ${dy})` : undefined;
  const opacity = visual.baseAlpha * object.opacity;

  return (
    <g transform={transform} style={{ mixBlendMode: visual.multiply ? "multiply" : "normal" }}>
      {maskSegments.length > 0 && (
        <defs>
          <mask
            id={maskId}
            maskUnits="userSpaceOnUse"
            maskContentUnits="userSpaceOnUse"
            x={object.x - object.size * 4}
            y={object.y - object.size * 4}
            width={object.width + object.size * 8}
            height={object.height + object.size * 8}
          >
            {maskSegments.map((segment, index) => (
              <line
                key={index}
                x1={segment.from.x}
                y1={segment.from.y}
                x2={segment.to.x}
                y2={segment.to.y}
                stroke="white"
                strokeOpacity={segment.opacity}
                strokeWidth={object.size * 2.5}
                strokeLinecap="round"
              />
            ))}
          </mask>
        </defs>
      )}
      <path
        d={d}
        fill={object.color}
        fillOpacity={opacity}
        mask={maskSegments.length ? `url(#${maskId})` : undefined}
      />
      {texture?.d && (
        <path
          d={texture.d}
          fill="none"
          stroke={object.color}
          strokeOpacity={texture.opacity * object.opacity}
          strokeWidth={texture.strokeWidth}
          strokeLinecap="round"
          mask={maskSegments.length ? `url(#${maskId})` : undefined}
        />
      )}
    </g>
  );
});

const SvgShape = memo(function SvgShape({
  object,
  dx,
  dy
}: {
  readonly object: ShapeObject;
  readonly dx: number;
  readonly dy: number;
}) {
  const transform = `translate(${object.x + dx} ${object.y + dy}) rotate(${object.rotation} ${object.width / 2} ${object.height / 2})`;
  const common = {
    fill: object.fill,
    stroke: object.stroke,
    strokeWidth: object.strokeWidth,
    opacity: object.opacity
  };

  if (object.shape === "square" || object.shape === "rectangle")
    return <rect transform={transform} width={object.width} height={object.height} {...common} />;
  if (object.shape === "circle" || object.shape === "ellipse")
    return (
      <ellipse
        transform={transform}
        cx={object.width / 2}
        cy={object.height / 2}
        rx={object.width / 2}
        ry={object.height / 2}
        {...common}
      />
    );
  if (object.shape === "triangle")
    return (
      <polygon
        transform={transform}
        points={`${object.width / 2},0 ${object.width},${object.height} 0,${object.height}`}
        {...common}
      />
    );

  const localPoints =
    object.shape === "poly-arrow" && object.points?.length
      ? object.points
      : [
          { x: 0, y: 0 },
          { x: object.width, y: object.height }
        ];
  const first = localPoints[0]!;
  const last = localPoints.at(-1)!;
  const previous = localPoints[Math.max(0, localPoints.length - 2)]!;
  const arrowEnd = object.shape === "line" ? "" : arrowHead(last, previous, object.strokeWidth);
  const arrowStart =
    object.shape === "double-arrow"
      ? arrowHead(first, localPoints[Math.min(1, localPoints.length - 1)]!, object.strokeWidth)
      : "";
  const body = localPoints
    .map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(" ");
  return (
    <path
      transform={transform}
      d={`${body} ${arrowEnd} ${arrowStart}`}
      fill="none"
      stroke={object.stroke}
      strokeWidth={object.strokeWidth}
      opacity={object.opacity}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
});

function arrowHead(tip: Point, previous: Point, strokeWidth: number): string {
  const angle = Math.atan2(tip.y - previous.y, tip.x - previous.x);
  const size = Math.max(9, strokeWidth * 3.2);
  const ax = tip.x - size * Math.cos(angle - Math.PI / 6);
  const ay = tip.y - size * Math.sin(angle - Math.PI / 6);
  const bx = tip.x - size * Math.cos(angle + Math.PI / 6);
  const by = tip.y - size * Math.sin(angle + Math.PI / 6);
  return `M${tip.x.toFixed(2)},${tip.y.toFixed(2)} L${ax.toFixed(2)},${ay.toFixed(2)} M${tip.x.toFixed(2)},${tip.y.toFixed(2)} L${bx.toFixed(2)},${by.toFixed(2)}`;
}

function safeSvgId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function whiteboardViewport(origin: Point, camera: Camera): Rect {
  const zoom = Math.max(0.05, camera.zoom);
  const width = typeof window === "undefined" ? 1920 : window.innerWidth;
  const height = typeof window === "undefined" ? 1080 : window.innerHeight;
  const overscan = 360;
  return {
    x: (-origin.x - camera.x - overscan) / zoom,
    y: (-origin.y - camera.y - overscan) / zoom,
    width: (width + overscan * 2) / zoom,
    height: (height + overscan * 2) / zoom
  };
}

function expandRect(rect: Rect, amount: number): Rect {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2
  };
}
