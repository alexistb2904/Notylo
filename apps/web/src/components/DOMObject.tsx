import type { CSSProperties } from "react";
import { DOMObjectContent } from "./dom/DOMObjectContent";
import type { DOMRenderableObject, DOMObjectUpdate } from "./dom/types";

interface Props {
  readonly object: DOMRenderableObject;
  readonly selected: boolean;
  readonly dragOffset?: { readonly x: number; readonly y: number } | undefined;
  readonly offsetY?: number | undefined;
  readonly readOnly?: boolean;
  onUpdate: DOMObjectUpdate;
}

/** Positions an object; its content renderer is selected by DOMObjectContent. */
export function DOMObject({
  object,
  selected,
  dragOffset,
  offsetY = 0,
  readOnly = false,
  onUpdate
}: Props) {
  const style: CSSProperties = {
    left: object.x + (dragOffset?.x ?? 0),
    top: object.y + offsetY + (dragOffset?.y ?? 0),
    width: object.width,
    height: object.height,
    transform: `rotate(${object.rotation}deg)`,
    opacity: object.opacity,
    zIndex: object.zIndex
  };
  return (
    <div className={`dom-object ${object.type} ${selected ? "selected" : ""}`} style={style}>
      <DOMObjectContent object={object} onUpdate={onUpdate} readOnly={readOnly} />
    </div>
  );
}

export type { DOMRenderableObject, DOMObjectUpdate } from "./dom/types";
