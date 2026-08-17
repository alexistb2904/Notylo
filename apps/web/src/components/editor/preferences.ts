import type { SidebarPosition } from "./types";

export function readStoredPalette(key: string, fallback: string[]): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) &&
      value.length === 5 &&
      value.every((item) => typeof item === "string")
      ? value
      : fallback;
  } catch {
    return fallback;
  }
}
export function readStoredBoolean(key: string, fallback: boolean): boolean {
  const value = localStorage.getItem(key);
  return value === null ? fallback : value === "true";
}
export function readStoredNumber(key: string, fallback: number, min: number, max: number): number {
  const stored = localStorage.getItem(key);
  if (stored === null) return fallback;
  const value = Number(stored);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}
export function readStoredSidebar(): SidebarPosition {
  const value = localStorage.getItem("notylo-sidebar-position");
  return value === "right" || value === "hidden" ? value : "left";
}
