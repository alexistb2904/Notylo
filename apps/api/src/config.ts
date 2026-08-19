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
  return isProduction
    ? [...new Set(configured)]
    : [...new Set([...configured, "http://localhost:5173", "http://127.0.0.1:5173"])];
}

export function isAllowedOrigin(
  origin: string | undefined,
  allowedOrigins: readonly string[]
): boolean {
  if (!origin) return true;
  return allowedOrigins.includes(origin);
}
