import { describe, expect, it } from "vitest";
import { resolvePointerPressure } from "./inkGestures";

describe("stylus pressure input", () => {
  it("keeps the last contact pressure when pointer-up reports a zero-pressure tip lift", () => {
    expect(resolvePointerPressure({ pointerType: "pen", pressure: 0 }, 0.63, true)).toBe(0.63);
  });

  it("keeps genuine zero pen pressure while the gesture is still active", () => {
    expect(resolvePointerPressure({ pointerType: "pen", pressure: 0 }, 0.63, false)).toBe(0);
  });

  it("uses neutral pressure for a mouse that reports zero", () => {
    expect(resolvePointerPressure({ pointerType: "mouse", pressure: 0 })).toBe(0.5);
  });
});
