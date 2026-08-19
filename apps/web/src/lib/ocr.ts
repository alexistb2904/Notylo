import type { Worker } from "tesseract.js";
import type { DocumentObject, ImageObject } from "@notylo/document-model";
import { NotebookRepository } from "@notylo/persistence";
import { drawInk } from "../components/canvas/drawInk";

export type OcrMode = "text" | "math";

export interface OcrResult {
  readonly text: string;
  readonly confidence: number;
}

const repository = new NotebookRepository();
const MAX_OCR_DIMENSION = 2_400;
const OCR_PADDING = 28;
const MATH_WHITELIST =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+-=()[]{}.,:;*/^_%<>|\\\\√∞π∑∫÷×−";

let workerPromise: Promise<Worker> | undefined;

/**
 * Runs OCR entirely in the browser. The worker and trained language data are
 * kept in the browser cache so repeated scans do not reload the engine.
 */
export async function recognizeImage(blob: Blob, mode: OcrMode): Promise<OcrResult> {
  const worker = await getWorker();
  await worker.setParameters({
    tessedit_pageseg_mode: (mode === "math" ? "6" : "11") as NonNullable<
      Parameters<Worker["setParameters"]>[0]["tessedit_pageseg_mode"]
    >,
    preserve_interword_spaces: "1",
    user_defined_dpi: "300",
    ...(mode === "math" ? { tessedit_char_whitelist: MATH_WHITELIST } : { tessedit_char_whitelist: "" })
  });

  try {
    const result = await worker.recognize(blob);
    return {
      text: result.data.text.trim(),
      confidence: Math.round(result.data.confidence)
    };
  } catch (error) {
    // A failed browser worker can be left in a broken state. Drop it so the
    // next attempt creates a clean worker instead of reusing a dead session.
    workerPromise = undefined;
    void worker.terminate();
    throw error;
  }
}

export async function renderOcrSelection(selected: readonly DocumentObject[]): Promise<Blob> {
  const objects = selected.filter(
    (object): object is Extract<DocumentObject, { readonly type: "image" | "ink" }> =>
      object.type === "image" || object.type === "ink"
  );
  if (!objects.length) throw new Error("Sélectionnez une image ou une écriture manuscrite.");

  const bounds = objects.reduce(
    (current, object) => ({
      left: Math.min(current.left, object.x),
      top: Math.min(current.top, object.y),
      right: Math.max(current.right, object.x + object.width),
      bottom: Math.max(current.bottom, object.y + object.height)
    }),
    { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity }
  );
  const logicalWidth = Math.max(1, bounds.right - bounds.left);
  const logicalHeight = Math.max(1, bounds.bottom - bounds.top);
  const scale = Math.min(2, MAX_OCR_DIMENSION / Math.max(logicalWidth, logicalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil((logicalWidth + OCR_PADDING * 2) * scale));
  canvas.height = Math.max(1, Math.ceil((logicalHeight + OCR_PADDING * 2) * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Le navigateur ne peut pas préparer l’image pour l’OCR.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.scale(scale, scale);
  const offset = {
    x: OCR_PADDING - bounds.left,
    y: OCR_PADDING - bounds.top
  };

  for (const object of objects) {
    if (object.type === "ink") {
      drawInk(context, object, offset, true);
      continue;
    }
    await drawImageObject(context, object, offset);
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Impossible d’encoder l’image OCR."))),
      "image/png"
    );
  });
}

export function mathOcrToLatex(text: string): string {
  let latex = text
    .replace(/[\u2212−]/g, "-")
    .replace(/×/g, "\\times ")
    .replace(/÷/g, "\\div ")
    .replace(/√\s*([A-Za-z0-9]+)/g, "\\sqrt{$1}")
    .replace(/π/g, "\\pi ")
    .replace(/∞/g, "\\infty ")
    .replace(/\b(sin|cos|tan|log|ln)\b/g, "\\$1")
    .replace(/\^\s*([A-Za-z0-9]+)/g, "^{$1}")
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\s*=\s*/g, " = ")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  const fraction = latex.match(/^([^\s]+)\s+\/\s+([^\s]+)$/);
  if (fraction) latex = `\\frac{${fraction[1]}}{${fraction[2]}}`;
  return latex;
}

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = import("tesseract.js")
      .then(({ createWorker }) =>
        createWorker("fra+eng", 1, {
          logger: () => undefined
        })
      )
      .catch((error) => {
        workerPromise = undefined;
        throw error;
      });
  }
  return workerPromise;
}

async function drawImageObject(
  context: CanvasRenderingContext2D,
  object: ImageObject,
  offset: { readonly x: number; readonly y: number }
): Promise<void> {
  const asset = await repository.getAsset(object.assetId);
  if (!asset) return;

  const bitmap = await decodeImage(asset.blob);
  context.drawImage(bitmap, object.x + offset.x, object.y + offset.y, object.width, object.height);
  bitmap.close?.();
}

async function decodeImage(blob: Blob): Promise<ImageBitmap> {
  if (typeof createImageBitmap === "function") return createImageBitmap(blob);
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image as unknown as ImageBitmap;
  } finally {
    URL.revokeObjectURL(url);
  }
}
