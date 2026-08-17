import type { Point } from "@notylo/canvas-engine";
import type { ShapeObject } from "@notylo/document-model";

export function drawShape(context: CanvasRenderingContext2D, object: ShapeObject, offset: Point) {
  const x = object.x + offset.x;
  const y = object.y + offset.y;
  const w = object.width;
  const h = object.height;
  context.save();
  context.translate(x + w / 2, y + h / 2);
  context.rotate((object.rotation * Math.PI) / 180);
  context.translate(-w / 2, -h / 2);
  context.lineWidth = object.strokeWidth;
  context.strokeStyle = object.stroke;
  context.fillStyle = object.fill;
  context.globalAlpha = object.opacity;
  if (object.shape === "square" || object.shape === "rectangle") {
    context.fillRect(0, 0, w, h);
    context.strokeRect(0, 0, w, h);
  } else if (object.shape === "circle" || object.shape === "ellipse") {
    context.beginPath();
    context.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  } else if (object.shape === "triangle") {
    context.beginPath();
    context.moveTo(w / 2, 0);
    context.lineTo(w, h);
    context.lineTo(0, h);
    context.closePath();
    context.fill();
    context.stroke();
  } else if (object.shape === "poly-arrow" && object.points && object.points.length > 1) {
    context.beginPath();
    object.points.forEach((point, index) =>
      index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y)
    );
    context.stroke();
    const end = object.points.at(-1)!;
    const previous = object.points.at(-2)!;
    drawArrowHead(context, end.x, end.y, Math.atan2(end.y - previous.y, end.x - previous.x));
  } else {
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(w, h);
    context.stroke();
    if (object.shape !== "line") {
      drawArrowHead(context, w, h, Math.atan2(h, w));
      if (object.shape === "double-arrow") drawArrowHead(context, 0, 0, Math.atan2(-h, -w));
    }
  }
  context.restore();
}

function drawArrowHead(context: CanvasRenderingContext2D, x: number, y: number, angle: number) {
  const size = 9;
  context.beginPath();
  context.moveTo(x, y);
  context.lineTo(
    x - size * Math.cos(angle - Math.PI / 6),
    y - size * Math.sin(angle - Math.PI / 6)
  );
  context.moveTo(x, y);
  context.lineTo(
    x - size * Math.cos(angle + Math.PI / 6),
    y - size * Math.sin(angle + Math.PI / 6)
  );
  context.stroke();
}
