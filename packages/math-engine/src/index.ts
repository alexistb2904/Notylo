import { ComputeEngine } from "@cortex-js/compute-engine";

export interface MathEvaluation {
  readonly latex: string;
  readonly resultLatex: string;
  readonly exact: boolean;
  readonly canSuggest: boolean;
}

const ce = new ComputeEngine();

export function normalizeMathInput(input: string): string {
  return input.trim().replace(/=$/, "").trim();
}

export function evaluateMath(input: string): MathEvaluation | null {
  const latex = normalizeMathInput(input);
  if (!latex) return null;
  try {
    const expression = ce.parse(latex);
    if (expression.isValid === false) return null;
    const simplified = expression.simplify();
    const numeric = simplified.N();
    const numericLatex = numeric.latex;
    const simplifiedLatex = simplified.latex;
    const exact = numericLatex === simplifiedLatex;
    return { latex, resultLatex: exact ? simplifiedLatex : numericLatex, exact, canSuggest: true };
  } catch { return null; }
}
