import { describe, expect, it } from "vitest";
import { mathOcrToLatex } from "./ocr";

describe("math OCR normalization", () => {
  it("keeps common operators usable as LaTeX", () => {
    expect(mathOcrToLatex("√ x + 2 × y = π")).toBe("\\sqrt{x} + 2 \\times y = \\pi");
  });

  it("turns a simple OCR fraction into a math object expression", () => {
    expect(mathOcrToLatex("1 / 2")).toBe("\\frac{1}{2}");
  });
});
