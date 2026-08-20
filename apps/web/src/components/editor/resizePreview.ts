import type { DocumentObject, Transform } from "@notylo/document-model";

/**
 * Produces a lightweight preview object by transforming only its outer box.
 *
 * Ink paths and shape geometry deliberately stay untouched here: the vector layer
 * applies the affine transform directly in SVG, avoiding expensive point/path
 * regeneration on every pointermove. DOM objects use this box preview so text,
 * images, PDFs and tables reflow immediately while resizing.
 */
export function previewObjectBounds<T extends DocumentObject>(object: T, transform: Transform): T {
  const scaleX = transform.scaleX ?? 1;
  const scaleY = transform.scaleY ?? 1;
  return {
    ...object,
    x: object.x * scaleX + transform.dx,
    y: object.y * scaleY + transform.dy,
    width: Math.max(1, object.width * Math.abs(scaleX)),
    height: Math.max(1, object.height * Math.abs(scaleY))
  } as T;
}

export function transformChanged(transform: Transform, epsilon = 0.0001): boolean {
  return (
    Math.abs((transform.scaleX ?? 1) - 1) > epsilon ||
    Math.abs((transform.scaleY ?? 1) - 1) > epsilon ||
    Math.abs(transform.dx) > epsilon ||
    Math.abs(transform.dy) > epsilon
  );
}
