import { describe, expect, it } from "vitest";
import { evaluateMath } from "../src";

describe("math evaluation", () => {
  it.each([["1+2=", "3"], ["2^8=", "256"], ["\\sqrt{16}=", "4"]])("evaluates %s", (input, expected) => {
    expect(evaluateMath(input)?.resultLatex).toBe(expected);
  });
});
