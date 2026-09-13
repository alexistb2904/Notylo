import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const configPath = fileURLToPath(
  new URL("../apps/desktop/src-tauri/tauri.conf.json", import.meta.url)
);
const config = JSON.parse(readFileSync(configPath, "utf8"));
const security = config?.app?.security;

if (!security || typeof security !== "object") fail("app.security is missing");
if (!security.csp || typeof security.csp !== "object") fail("production CSP must use explicit directives");
if (!security.devCsp || typeof security.devCsp !== "object") fail("devCsp is missing");

const connect = sources(security.csp["connect-src"]);
const connectTokens = new Set(connect.split(/\s+/).filter(Boolean));
for (const unsafe of ["http:", "ws:"]) {
  if (connectTokens.has(unsafe)) fail(`production connect-src must not contain global ${unsafe}`);
}
for (const required of ["'self'", "ipc:", "http://ipc.localhost", "https:", "wss:"]) {
  if (!connectTokens.has(required)) fail(`production connect-src is missing ${required}`);
}

for (const directive of ["object-src", "frame-src", "base-uri"]) {
  if (sources(security.csp[directive]) !== "'none'") fail(`${directive} must be 'none'`);
}
if (!sources(security.csp["script-src"]).split(/\s+/).includes("'self'"))
  fail("script-src must include 'self'");

const headers = security.headers;
if (!headers || typeof headers !== "object") fail("security headers are missing");
const supportedHeaders = new Set([
  "Access-Control-Allow-Credentials",
  "Access-Control-Allow-Headers",
  "Access-Control-Allow-Methods",
  "Access-Control-Expose-Headers",
  "Access-Control-Max-Age",
  "Cross-Origin-Embedder-Policy",
  "Cross-Origin-Opener-Policy",
  "Cross-Origin-Resource-Policy",
  "Permissions-Policy",
  "Service-Worker-Allowed",
  "Timing-Allow-Origin",
  "X-Content-Type-Options",
  "Tauri-Custom-Header"
]);
for (const header of Object.keys(headers)) {
  if (!supportedHeaders.has(header)) fail(`unsupported Tauri security header: ${header}`);
}
if (headers["X-Content-Type-Options"] !== "nosniff") fail("X-Content-Type-Options must be nosniff");

console.log("Tauri security configuration is hardened.");

function sources(value) {
  if (Array.isArray(value)) return value.join(" ").trim();
  return typeof value === "string" ? value.trim() : "";
}

function fail(message) {
  console.error(`Tauri security check failed: ${message}`);
  process.exit(1);
}
