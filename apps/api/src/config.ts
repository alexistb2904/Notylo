export function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

export function readBoolean(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  return value === undefined
    ? fallback
    : ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export function readOrigins(isProduction: boolean): string[] {
  const configured = (process.env.CORS_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  // Tauri uses a private application origin. Windows/WebView2 uses
  // http://tauri.localhost while other platforms use tauri://localhost.
  // These are not wildcard origins: they only identify the installed app.
  const desktopOrigins = ["tauri://localhost", "http://tauri.localhost"];
  return isProduction
    ? [...new Set([...configured, ...desktopOrigins])]
    : [
        ...new Set([
          ...configured,
          ...desktopOrigins,
          "http://localhost:5173",
          "http://127.0.0.1:5173"
        ])
      ];
}

/** Browser page used by the desktop passkey flow. It must be served by the WebAuthn RP. */
export function readDesktopPasskeyUrl(isProduction: boolean): string {
  const configured = process.env.DESKTOP_PASSKEY_URL?.trim();
  const fallback = isProduction ? undefined : "http://localhost:5173/desktop/passkey";
  const value = configured || fallback;
  if (!value) throw new Error("DESKTOP_PASSKEY_URL is required in production.");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("DESKTOP_PASSKEY_URL must be an absolute URL.");
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "localhost"))
    throw new Error("DESKTOP_PASSKEY_URL must use HTTPS outside local development.");
  url.hash = "";
  return url.toString();
}

export function isAllowedOrigin(
  origin: string | undefined,
  allowedOrigins: readonly string[]
): boolean {
  if (!origin) return true;
  return allowedOrigins.includes(origin);
}
