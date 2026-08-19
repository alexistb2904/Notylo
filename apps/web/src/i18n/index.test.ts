import { describe, expect, it } from "vitest";
import { detectLocale } from "./index";

describe("detectLocale", () => {
  it("uses French for French browser locales", () => {
    expect(detectLocale(["fr-FR"])).toBe("fr");
    expect(detectLocale(["fr-CA"])).toBe("fr");
  });

  it("uses English for English browser locales", () => {
    expect(detectLocale(["en-US"])).toBe("en");
    expect(detectLocale(["en-GB"])).toBe("en");
  });

  it("uses the first supported browser preference", () => {
    expect(detectLocale(["de-DE", "fr-CA", "en-US"])).toBe("fr");
    expect(detectLocale(["es-ES", "en-GB", "fr-FR"])).toBe("en");
  });

  it("falls back to English when no supported language is present", () => {
    expect(detectLocale(["de-DE"])).toBe("en");
    expect(detectLocale(["ja-JP", "es-ES"])).toBe("en");
    expect(detectLocale([])).toBe("en");
  });
});
