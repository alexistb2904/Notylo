import type { Camera, Point, Rect } from "@notylo/canvas-engine";

export function drawOverlay(
  context: CanvasRenderingContext2D,
  {
    camera,
    selectionRect,
    lasso
  }: {
    readonly camera: Camera;
    readonly selectionRect?: Rect | undefined;
    readonly lasso: readonly Point[];
  }
) {
  context.save();
  context.strokeStyle = "#171717";
  context.fillStyle = "#17171718";
  context.lineWidth = 1.5 / camera.zoom;
  context.setLineDash([5 / camera.zoom, 4 / camera.zoom]);
  if (selectionRect) {
    const { x, y, width, height } = selectionRect;
    context.fillRect(x, y, width, height);
    context.strokeRect(x, y, width, height);
  }
  if (lasso.length > 1) {
    context.beginPath();
    lasso.forEach((point, index) =>
      index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y)
    );
    context.stroke();
  }
  context.restore();
}
