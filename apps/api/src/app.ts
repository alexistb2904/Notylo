import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import { Pool } from "pg";
import { createStorage, drainPendingAssetDeletions } from "./storage.js";
import { ensureSchema } from "./db.js";
import { registerSecurityHooks } from "./security.js";
import {
  isAllowedOrigin,
  readBoolean,
  readDesktopPasskeyUrl,
  readOrigins,
  required
} from "./config.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerCloudRoutes } from "./routes/cloud.js";
import { registerRealtimeRoutes } from "./routes/realtime.js";
import type { ApiContext } from "./types.js";

export async function createApp() {
  const isProduction = process.env.NODE_ENV === "production";
  const jwtSecret = process.env.JWT_SECRET;
  if (isProduction && (!jwtSecret || jwtSecret.length < 32))
    throw new Error("JWT_SECRET must contain at least 32 characters in production.");
  const origins = readOrigins(isProduction);
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info" },
    bodyLimit: 30 * 1024 * 1024
  });
  const pool = new Pool({
    connectionString: required("DATABASE_URL"),
    max: Number(process.env.DB_POOL_MAX ?? 10),
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000
  });
  const storage = createStorage();
  const context: ApiContext = {
    app,
    pool,
    storage,
    bucket: process.env.MINIO_BUCKET ?? "notylo-assets",
    registrationEnabled: readBoolean("REGISTRATION_ENABLED", !isProduction),
    webauthnRpId: process.env.WEBAUTHN_RP_ID ?? "localhost",
    webauthnOrigin: process.env.WEBAUTHN_ORIGIN ?? origins[0] ?? "http://localhost:5173",
    desktopPasskeyUrl: readDesktopPasskeyUrl(isProduction),
    sessions: new Map()
  };

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
  });
  await app.register(cors, {
    origin: (origin, callback) => callback(null, isAllowedOrigin(origin, origins)),
    credentials: false,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "Accept", "X-CSRF-Token"]
  });
  await app.register(rateLimit, {
    global: true,
    max: Number(process.env.RATE_LIMIT_MAX ?? 120),
    timeWindow: process.env.RATE_LIMIT_WINDOW ?? "1 minute",
    hook: "onRequest",
    keyGenerator: (request) => request.ip,
    errorResponseBuilder: (_request, value) => ({
      error: `Trop de requêtes. Réessayez dans ${Math.ceil(value.ttl / 1000)} secondes.`
    })
  });
  await app.register(jwt, {
    secret: jwtSecret ?? "development-only-secret-replace-before-deploying"
  });
  await app.register(websocket);
  app.addContentTypeParser(
    "application/octet-stream",
    { parseAs: "buffer" },
    (_request, body, done) => done(null, body)
  );
  registerSecurityHooks(app, origins);
  app.setErrorHandler((error, _request, reply) => {
    const statusCode =
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
        ? error.statusCode
        : 500;
    if (statusCode === 413) return reply.code(413).send({ error: "Requête trop volumineuse." });
    app.log.error(error, "Unhandled API error");
    return reply
      .code(statusCode >= 400 && statusCode < 500 ? statusCode : 500)
      .send({ error: "Une erreur interne est survenue." });
  });
  app.addHook("onClose", async () => {
    await Promise.all([pool.end(), storage.destroy()]);
  });
  await ensureSchema(pool);
  app.get("/health", async (_request, reply) => {
    try {
      await pool.query("SELECT 1");
      return {
        status: "ok",
        service: "notylo-api",
        database: "ready",
        now: new Date().toISOString()
      };
    } catch (error) {
      app.log.error(error, "Database health check failed");
      return reply
        .code(503)
        .send({
          status: "degraded" as const,
          service: "notylo-api",
          database: "unavailable",
          now: new Date().toISOString()
        });
    }
  });
  registerAuthRoutes(context);
  registerCloudRoutes(context);
  registerRealtimeRoutes(context);
  void drainPendingAssetDeletions(pool, storage, context.bucket, app.log.warn.bind(app.log)).catch(
    (error) => app.log.warn(error, "Deferred asset cleanup could not start")
  );
  return app;
}
