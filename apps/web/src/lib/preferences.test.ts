import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyThemePreference,
  readThemePreference,
  setThemePreference
} from "./preferences";

describe("theme preferences", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      get length() { return values.size; },
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value)
    } satisfies Storage);
    delete document.documentElement.dataset.theme;
  });

  it("persists and applies an explicit theme", () => {
    setThemePreference("dark");

    expect(readThemePreference()).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("returns to the system theme", () => {
    localStorage.setItem("notylo-theme", "light");
    applyThemePreference("light");
    setThemePreference("system");

    expect(readThemePreference()).toBe("system");
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});
