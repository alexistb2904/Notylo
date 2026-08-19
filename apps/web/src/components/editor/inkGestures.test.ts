import { describe, expect, it } from "vitest";
import { isTerminalPenLift, resolvePointerPressure } from "./inkGestures";

describe("stylus pressure input", () => {
  it("identifies a zero-pressure pointer-up as a pen lift sample", () => {
    expect(isTerminalPenLift({ pointerType: "pen", pressure: 0 }, true)).toBe(true);
    expect(isTerminalPenLift({ pointerType: "pen", pressure: 0.2 }, true)).toBe(false);
    expect(isTerminalPenLift({ pointerType: "pen", pressure: 0 }, false)).toBe(false);
  });

  it("can preserve the previous contact pressure for consumers that retain a terminal sample", () => {
    expect(resolvePointerPressure({ pointerType: "pen", pressure: 0 }, 0.63, true)).toBe(0.63);
  });

  it("keeps genuine zero pen pressure while the gesture is still active", () => {
    expect(resolvePointerPressure({ pointerType: "pen", pressure: 0 }, 0.63, false)).toBe(0);
  });

  it("uses neutral pressure for a mouse that reports zero", () => {
    expect(resolvePointerPressure({ pointerType: "mouse", pressure: 0 })).toBe(0.5);
  });
});
