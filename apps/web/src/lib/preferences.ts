export type ThemePreference = "system" | "light" | "dark";

const themeStorageKey = "notylo-theme";

export function readThemePreference(): ThemePreference {
  try {
    const value = localStorage.getItem(themeStorageKey);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

export function applyThemePreference(preference: ThemePreference = readThemePreference()): void {
  if (typeof document === "undefined") return;
  if (preference === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = preference;
}

export function setThemePreference(preference: ThemePreference): void {
  try {
    if (preference === "system") localStorage.removeItem(themeStorageKey);
    else localStorage.setItem(themeStorageKey, preference);
  } catch {
    // The current page can still apply the theme when storage is unavailable.
  }
  applyThemePreference(preference);
}
