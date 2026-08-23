import type { FastifyReply, FastifyRequest } from "fastify";
import type { ApiContext } from "./types.js";

const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const clientIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const shareTokenPattern = /^[A-Za-z0-9_-]{43}$/;

export function registerSecurityHooks(
  app: ApiContext["app"],
  allowedOrigins: readonly string[]
): void {
  app.addHook("onRequest", async (request, reply) => {
    reply.header("Vary", "Origin");
    if (!unsafeMethods.has(request.method)) return;

    const origin = request.headers.origin;
    const referer = request.headers.referer;
    const fetchSite = request.headers["sec-fetch-site"];
    const requestOrigin = origin ?? (referer ? originFromReferer(referer) : undefined);
    const hasAllowedOrigin = Boolean(requestOrigin && allowedOrigins.includes(requestOrigin));
    if (requestOrigin && !hasAllowedOrigin) {
      return reply.code(403).send({ error: "Origine de requête refusée." });
    }
    if (fetchSite === "cross-site" && !hasAllowedOrigin) {
      return reply.code(403).send({ error: "Requête intersite refusée." });
    }
  });

  app.addHook("onSend", async (_request, reply) => {
    if (!reply.hasHeader("Cache-Control")) reply.header("Cache-Control", "no-store");
  });
}

export async function accessOnly(
  context: ApiContext,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    await request.jwtVerify();
    if (request.user.type === "refresh") {
      reply.code(401).send({ error: "Jeton d’accès requis." });
      return;
    }
    if (!uuidPattern.test(request.user.sub)) {
      reply.code(401).send({ error: "Session invalide ou expirée." });
      return;
    }
    const current = await context.pool.query<{ session_version: string | number }>(
      "SELECT session_version FROM users WHERE id = $1",
      [request.user.sub]
    );
    const sessionVersion = Number(request.user.sessionVersion ?? 0);
    if (
      !current.rowCount ||
      !Number.isSafeInteger(sessionVersion) ||
      sessionVersion !== Number(current.rows[0]!.session_version)
    ) {
      reply.code(401).send({ error: "La session n’est plus valide." });
      return;
    }
  } catch {
    reply.code(401).send({ error: "Session invalide ou expirée." });
  }
}

export async function refreshOnly(
  context: ApiContext,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    await request.jwtVerify();
    if (request.user.type !== "refresh") {
      reply.code(401).send({ error: "Jeton de renouvellement requis." });
      return;
    }
    const current = await context.pool.query<{ session_version: string | number }>(
      "SELECT session_version FROM users WHERE id = $1",
      [request.user.sub]
    );
    const sessionVersion = Number(request.user.sessionVersion ?? 0);
    if (
      !current.rowCount ||
      !Number.isSafeInteger(sessionVersion) ||
      sessionVersion !== Number(current.rows[0]!.session_version)
    ) {
      reply.code(401).send({ error: "La session n’est plus valide." });
      return;
    }
  } catch {
    reply.code(401).send({ error: "Session invalide ou expirée." });
  }
}

export function validUuid(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

export function validClientId(value: unknown): value is string {
  return typeof value === "string" && clientIdPattern.test(value);
}

export function validShareToken(value: unknown): value is string {
  return typeof value === "string" && shareTokenPattern.test(value);
}

export function validRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function originFromReferer(referer: string): string | undefined {
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}
