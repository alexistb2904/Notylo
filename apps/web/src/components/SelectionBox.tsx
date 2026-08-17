import type { PointerEvent } from "react";
import type { DocumentObject } from "@notylo/document-model";
import { selectionBounds } from "@notylo/canvas-engine";

export function SelectionBox({
  objects,
  dragOffset,
  onResizeStart,
  offsetY = 0
}: {
  readonly objects: readonly DocumentObject[];
  readonly dragOffset: { readonly x: number; readonly y: number };
  readonly offsetY?: number | undefined;
  onResizeStart(handle: "nw" | "ne" | "se" | "sw", event: PointerEvent<HTMLButtonElement>): void;
}) {
  const bounds = selectionBounds(objects);
  if (!bounds) return null;
  return (
    <div
      className="selection-box"
      style={{
        left: bounds.x + dragOffset.x - 7,
        top: bounds.y + offsetY + dragOffset.y - 7,
        width: bounds.width + 14,
        height: bounds.height + 14
      }}
    >
      <button
        aria-label="Redimensionner en haut à gauche"
        className="handle nw"
        onPointerDown={(event) => onResizeStart("nw", event)}
      />
      <button
        aria-label="Redimensionner en haut à droite"
        className="handle ne"
        onPointerDown={(event) => onResizeStart("ne", event)}
      />
      <button
        aria-label="Redimensionner en bas à droite"
        className="handle se"
        onPointerDown={(event) => onResizeStart("se", event)}
      />
      <button
        aria-label="Redimensionner en bas à gauche"
        className="handle sw"
        onPointerDown={(event) => onResizeStart("sw", event)}
      />
      <i className="rotation-handle" />
    </div>
  );
}
