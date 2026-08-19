import { promisify } from "node:util";
import crypto from "node:crypto";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import websocket from "@fastify/websocket";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { Pool } from "pg";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
  type WebAuthnCredential
} from "@simplewebauthn/server";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    user: { sub: string; email?: string; type?: "refresh" };
  }
}
type Credentials = { email: string; password: string };
type StoredUser = { id: string; email: string; password_hash: string; display_name: string };
type Account = Pick<StoredUser, "id" | "email" | "display_name">;
type PasswordChange = { currentPassword: string; newPassword: string };
type ProfileChange = { displayName: string };
type PasskeyOptionsRequest = { name?: string };
type PasskeyVerification = { response: RegistrationResponseJSON };
type PasskeyLoginOptionsRequest = { email: string };
type PasskeyLoginVerification = { email: string; response: AuthenticationResponseJSON };
type AccountDeletion = { password: string; confirmation: string };
type NotebookDeletionRequest = { deletedAt?: number; baseRevision?: number; force?: boolean };
type StoredPasskey = {
  id: string;
  user_id: string;
  credential_id: string;
  public_key: string;
  counter: string | number;
  transports: AuthenticatorTransportFuture[];
  label: string;
  device_type: string;
  backed_up: boolean;
  created_at: string;
  last_used_at: string | null;
};
type CloudDocument = {
  notebook: { id: string; title: string; mode: "book" | "whiteboard"; updatedAt: number };
  assets: readonly { id: string; hash: string; mimeType: string; size: number }[];
};
type RealtimeSocket = {
  readonly readyState: number;
  send(data: unknown): void;
  close(code?: number): void;
};

const scrypt = promisify(crypto.scrypt);
const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? "info" },
  bodyLimit: 30 * 1024 * 1024
});
const isProduction = process.env.NODE_ENV === "production";
const jwtSecret = process.env.JWT_SECRET;
const registrationEnabled = readBoolean("REGISTRATION_ENABLED", !isProduction);
const databaseUrl = required("DATABASE_URL");
const bucket = process.env.MINIO_BUCKET ?? "notylo-assets";
const configuredOrigins = (process.env.CORS_ORIGIN ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const corsOrigins = isProduction
  ? configuredOrigins
  : [...new Set([...configuredOrigins, "http://localhost:5173", "http://127.0.0.1:5173"])];
const webauthnRpId = process.env.WEBAUTHN_RP_ID ?? "localhost";
const webauthnOrigin = process.env.WEBAUTHN_ORIGIN ?? corsOrigins[0] ?? "http://localhost:5173";
if (isProduction && (!jwtSecret || jwtSecret.length < 32))
  throw new Error("JWT_SECRET must contain at least 32 characters in production.");
const pool = new Pool({ connectionString: databaseUrl });
const storage = new S3Client({
  endpoint: required("MINIO_ENDPOINT"),
  forcePathStyle: true,
  region: "us-east-1",
  credentials: {
    accessKeyId: required("MINIO_ACCESS_KEY"),
    secretAccessKey: required("MINIO_SECRET_KEY")
  }
});
const sessions = new Map<string, Set<RealtimeSocket>>();

await app.register(cors, {
  origin: corsOrigins.length ? corsOrigins : false,
  credentials: false,
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type", "Accept"]
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
app.addHook("onClose", async () => {
  await Promise.all([pool.end(), storage.destroy()]);
});
await ensureSchema();
void drainPendingAssetDeletions().catch((error) =>
  app.log.warn(error, "Deferred asset cleanup could not start")
);

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
    return reply.code(503).send({
      status: "degraded" as const,
      service: "notylo-api",
      database: "unavailable",
      now: new Date().toISOString()
    });
  }
});
app.get("/auth/config", async () => ({ registrationEnabled }));
app.post<{ Body: Credentials }>("/auth/register", async (request, reply) => {
  if (!registrationEnabled)
    return reply.code(403).send({ error: "Les inscriptions sont actuellement fermées." });
  const credentials = validateCredentials(request.body, reply);
  if (!credentials) return;
  try {
    const result = await pool.query<StoredUser>(
      "INSERT INTO users (id, email, password_hash, display_name) VALUES ($1, $2, $3, $4) RETURNING id, email, password_hash, display_name",
      [
        crypto.randomUUID(),
        credentials.email,
        await hashPassword(credentials.password),
        displayNameFromEmail(credentials.email)
      ]
    );
    return issueTokens(result.rows[0]!);
  } catch (error) {
    if (isUniqueViolation(error))
      return reply.code(409).send({ error: "Un compte existe déjà pour cette adresse." });
    return databaseFailure(reply, error);
  }
});
app.post<{ Body: Credentials }>("/auth/login", async (request, reply) => {
  const credentials = validateCredentials(request.body, reply);
  if (!credentials) return;
  try {
    const result = await pool.query<StoredUser>(
      "SELECT id, email, password_hash, display_name FROM users WHERE email = $1 LIMIT 1",
      [credentials.email]
    );
    const user = result.rows[0];
    if (!user || !(await verifyPassword(credentials.password, user.password_hash)))
      return reply.code(401).send({ error: "Adresse e-mail ou mot de passe incorrect." });
    return issueTokens(user);
  } catch (error) {
    return databaseFailure(reply, error);
  }
});
app.post("/auth/refresh", { preHandler: refreshOnly }, async (request, reply) => {
  const result = await pool.query<StoredUser>(
    "SELECT id, email, password_hash, display_name FROM users WHERE id = $1 LIMIT 1",
    [request.user.sub]
  );
  const user = result.rows[0];
  return user
    ? issueTokens(user)
    : reply.code(401).send({ error: "La session n’est plus valide." });
});
app.get("/auth/me", { preHandler: accessOnly }, async (request, reply) => {
  try {
    const result = await pool.query<Account>(
      "SELECT id, email, display_name FROM users WHERE id = $1 LIMIT 1",
      [request.user.sub]
    );
    const user = result.rows[0];
    if (!user) return reply.code(401).send({ error: "La session n’est plus valide." });
    return { user: toAccount(user) };
  } catch (error) {
    return databaseFailure(reply, error);
  }
});
app.put<{ Body: ProfileChange }>("/auth/me", { preHandler: accessOnly }, async (request, reply) => {
  const displayName = request.body?.displayName?.trim();
  if (!displayName || displayName.length > 80)
    return reply.code(400).send({ error: "Le nom doit contenir entre 1 et 80 caractères." });
  try {
    const result = await pool.query<Account>(
      "UPDATE users SET display_name = $1 WHERE id = $2 RETURNING id, email, display_name",
      [displayName, request.user.sub]
    );
    const user = result.rows[0];
    return user
      ? { user: toAccount(user) }
      : reply.code(401).send({ error: "La session n’est plus valide." });
  } catch (error) {
    return databaseFailure(reply, error);
  }
});
app.put<{ Body: PasswordChange }>(
  "/auth/me/password",
  { preHandler: accessOnly },
  async (request, reply) => {
    const currentPassword = request.body?.currentPassword;
    const newPassword = request.body?.newPassword;
    if (
      typeof currentPassword !== "string" ||
      typeof newPassword !== "string" ||
      newPassword.length < 10
    )
      return reply
        .code(400)
        .send({ error: "Utilisez un nouveau mot de passe d’au moins 10 caractères." });
    try {
      const result = await pool.query<StoredUser>(
        "SELECT id, email, password_hash, display_name FROM users WHERE id = $1 LIMIT 1",
        [request.user.sub]
      );
      const user = result.rows[0];
      if (!user || !(await verifyPassword(currentPassword, user.password_hash)))
        return reply.code(401).send({ error: "Le mot de passe actuel est incorrect." });
      await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
        await hashPassword(newPassword),
        user.id
      ]);
      return reply.code(204).send();
    } catch (error) {
      return databaseFailure(reply, error);
    }
  }
);

app.post<{ Body: PasskeyLoginOptionsRequest }>(
  "/auth/passkeys/login/options",
  async (request, reply) => {
    const email = request.body?.email?.trim().toLowerCase();
    if (!email || !/^\S+@\S+\.\S+$/.test(email))
      return reply
        .code(400)
        .send({ error: "Saisissez votre adresse e-mail pour utiliser une passkey." });
    try {
      const user = (
        await pool.query<Account>(
          "SELECT id, email, display_name FROM users WHERE email = $1 LIMIT 1",
          [email]
        )
      ).rows[0];
      if (!user)
        return reply.code(401).send({ error: "Aucune passkey ne correspond à cette adresse." });
      const credentials = (
        await pool.query<StoredPasskey>(
          "SELECT id, user_id, credential_id, public_key, counter, transports, label, device_type, backed_up, created_at, last_used_at FROM webauthn_credentials WHERE user_id = $1",
          [user.id]
        )
      ).rows;
      if (!credentials.length)
        return reply.code(401).send({ error: "Aucune passkey n’est configurée pour ce compte." });
      const options = await generateAuthenticationOptions({
        rpID: webauthnRpId,
        allowCredentials: credentials.map((credential) => ({
          id: credential.credential_id,
          transports: credential.transports
        })),
        userVerification: "required"
      });
      await saveChallenge(user.id, "authentication", options.challenge);
      return options;
    } catch (error) {
      return databaseFailure(reply, error);
    }
  }
);
app.post<{ Body: PasskeyLoginVerification }>(
  "/auth/passkeys/login/verify",
  async (request, reply) => {
    const email = request.body?.email?.trim().toLowerCase();
    const response = request.body?.response;
    if (!email || !response?.id)
      return reply.code(400).send({ error: "Réponse passkey invalide." });
    try {
      const user = (
        await pool.query<StoredUser>(
          "SELECT id, email, password_hash, display_name FROM users WHERE email = $1 LIMIT 1",
          [email]
        )
      ).rows[0];
      if (!user) return reply.code(401).send({ error: "Cette passkey n’est pas reconnue." });
      const challenge = await consumeChallenge(user.id, "authentication");
      const credential = (
        await pool.query<StoredPasskey>(
          "SELECT id, user_id, credential_id, public_key, counter, transports, label, device_type, backed_up, created_at, last_used_at FROM webauthn_credentials WHERE user_id = $1 AND credential_id = $2 LIMIT 1",
          [user.id, response.id]
        )
      ).rows[0];
      if (!challenge || !credential)
        return reply.code(401).send({ error: "La demande passkey a expiré. Réessayez." });
      const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: webauthnOrigin,
        expectedRPID: webauthnRpId,
        requireUserVerification: true,
        credential: toWebAuthnCredential(credential)
      });
      if (!verification.verified)
        return reply.code(401).send({ error: "Cette passkey n’a pas pu être vérifiée." });
      await pool.query(
        "UPDATE webauthn_credentials SET counter = $1, last_used_at = now() WHERE id = $2",
        [verification.authenticationInfo.newCounter, credential.id]
      );
      return issueTokens(user);
    } catch (error) {
      app.log.warn(error, "Passkey authentication failed");
      return reply.code(401).send({ error: "Cette passkey n’a pas pu être vérifiée." });
    }
  }
);
app.post<{ Body: PasskeyOptionsRequest }>(
  "/auth/passkeys/registration/options",
  { preHandler: accessOnly },
  async (request, reply) => {
    const label = request.body?.name?.trim() || "Nouvelle passkey";
    if (label.length > 80)
      return reply
        .code(400)
        .send({ error: "Le nom de la passkey doit contenir au maximum 80 caractères." });
    try {
      const user = (
        await pool.query<Account>(
          "SELECT id, email, display_name FROM users WHERE id = $1 LIMIT 1",
          [request.user.sub]
        )
      ).rows[0];
      if (!user) return reply.code(401).send({ error: "La session n’est plus valide." });
      const credentials = (
        await pool.query<StoredPasskey>(
          "SELECT id, user_id, credential_id, public_key, counter, transports, label, device_type, backed_up, created_at, last_used_at FROM webauthn_credentials WHERE user_id = $1",
          [user.id]
        )
      ).rows;
      const options = await generateRegistrationOptions({
        rpName: "Notylo",
        rpID: webauthnRpId,
        userID: Buffer.from(user.id),
        userName: user.email,
        userDisplayName: user.display_name,
        attestationType: "none",
        excludeCredentials: credentials.map((credential) => ({
          id: credential.credential_id,
          transports: credential.transports
        })),
        authenticatorSelection: { residentKey: "required", userVerification: "required" }
      });
      await saveChallenge(user.id, "registration", options.challenge, label);
      return options;
    } catch (error) {
      return databaseFailure(reply, error);
    }
  }
);
app.post<{ Body: PasskeyVerification }>(
  "/auth/passkeys/registration/verify",
  { preHandler: accessOnly },
  async (request, reply) => {
    const response = request.body?.response;
    if (!response?.id) return reply.code(400).send({ error: "Réponse passkey invalide." });
    try {
      const challenge = await consumeChallenge(request.user.sub, "registration");
      if (!challenge)
        return reply.code(400).send({ error: "La demande passkey a expiré. Réessayez." });
      const verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: webauthnOrigin,
        expectedRPID: webauthnRpId,
        requireUserVerification: true
      });
      if (!verification.verified || !verification.registrationInfo)
        return reply.code(400).send({ error: "Cette passkey n’a pas pu être vérifiée." });
      const info = verification.registrationInfo;
      await pool.query(
        "INSERT INTO webauthn_credentials (id, user_id, credential_id, public_key, counter, transports, label, device_type, backed_up) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        [
          crypto.randomUUID(),
          request.user.sub,
          info.credential.id,
          Buffer.from(info.credential.publicKey).toString("base64url"),
          info.credential.counter,
          JSON.stringify(info.credential.transports ?? []),
          challenge.label ?? "Nouvelle passkey",
          info.credentialDeviceType,
          info.credentialBackedUp
        ]
      );
      return reply.code(201).send({ passkey: { label: challenge.label ?? "Nouvelle passkey" } });
    } catch (error) {
      if (isUniqueViolation(error))
        return reply.code(409).send({ error: "Cette passkey est déjà enregistrée." });
      app.log.warn(error, "Passkey registration failed");
      return reply.code(400).send({ error: "Cette passkey n’a pas pu être vérifiée." });
    }
  }
);
app.get("/auth/passkeys", { preHandler: accessOnly }, async (request, reply) => {
  try {
    const result = await pool.query<StoredPasskey>(
      "SELECT id, user_id, credential_id, public_key, counter, transports, label, device_type, backed_up, created_at, last_used_at FROM webauthn_credentials WHERE user_id = $1 ORDER BY created_at",
      [request.user.sub]
    );
    return { passkeys: result.rows.map(toPublicPasskey) };
  } catch (error) {
    return databaseFailure(reply, error);
  }
});
app.put<{ Params: { passkeyId: string }; Body: PasskeyOptionsRequest }>(
  "/auth/passkeys/:passkeyId",
  { preHandler: accessOnly },
  async (request, reply) => {
    const label = request.body?.name?.trim();
    if (!label || label.length > 80)
      return reply
        .code(400)
        .send({ error: "Le nom de la passkey doit contenir entre 1 et 80 caractères." });
    try {
      const result = await pool.query(
        "UPDATE webauthn_credentials SET label = $1 WHERE id = $2 AND user_id = $3",
        [label, request.params.passkeyId, request.user.sub]
      );
      return result.rowCount
        ? reply.code(204).send()
        : reply.code(404).send({ error: "Passkey introuvable." });
    } catch (error) {
      return databaseFailure(reply, error);
    }
  }
);
app.delete<{ Params: { passkeyId: string } }>(
  "/auth/passkeys/:passkeyId",
  { preHandler: accessOnly },
  async (request, reply) => {
    try {
      const result = await pool.query(
        "DELETE FROM webauthn_credentials WHERE id = $1 AND user_id = $2",
        [request.params.passkeyId, request.user.sub]
      );
      return result.rowCount
        ? reply.code(204).send()
        : reply.code(404).send({ error: "Passkey introuvable." });
    } catch (error) {
      return databaseFailure(reply, error);
    }
  }
);
app.post<{ Body: AccountDeletion }>(
  "/auth/account/delete",
  { preHandler: accessOnly },
  async (request, reply) => {
    if (request.body?.confirmation !== "SUPPRIMER" || typeof request.body?.password !== "string")
      return reply
        .code(400)
        .send({ error: "Confirmez en saisissant SUPPRIMER et votre mot de passe." });
    const client = await pool.connect();
    try {
      const user = (
        await client.query<StoredUser>(
          "SELECT id, email, password_hash, display_name FROM users WHERE id = $1 FOR UPDATE",
          [request.user.sub]
        )
      ).rows[0];
      if (!user || !(await verifyPassword(request.body.password, user.password_hash)))
        return reply.code(401).send({ error: "Le mot de passe actuel est incorrect." });
      const assets = (
        await client.query<{ object_key: string }>(
          "SELECT a.object_key FROM assets a JOIN notebooks n ON n.id = a.notebook_id WHERE n.owner_id = $1",
          [user.id]
        )
      ).rows;
      await Promise.all(
        assets.map((asset) =>
          storage.send(new DeleteObjectCommand({ Bucket: bucket, Key: asset.object_key }))
        )
      );
      await client.query("BEGIN");
      await client.query("DELETE FROM webauthn_challenges WHERE user_id = $1", [user.id]);
      await client.query("DELETE FROM webauthn_credentials WHERE user_id = $1", [user.id]);
      await client.query("DELETE FROM notebooks WHERE owner_id = $1", [user.id]);
      await client.query("DELETE FROM users WHERE id = $1", [user.id]);
      await client.query("COMMIT");
      return reply.code(204).send();
    } catch (error) {
      await client.query("ROLLBACK");
      return databaseFailure(reply, error);
    } finally {
      client.release();
    }
  }
);

app.get("/cloud/notebooks", { preHandler: accessOnly }, async (request, reply) => {
  try {
    const [result, deleted] = await Promise.all([
      pool.query<{
        client_id: string;
        title: string;
        mode: "book" | "whiteboard";
        updated_at: number;
        revision: string | number;
      }>(
        "SELECT n.client_id, n.title, n.mode, (d.snapshot->'notebook'->>'updatedAt')::bigint AS updated_at, d.revision FROM notebooks n JOIN documents d ON d.notebook_id = n.id WHERE n.owner_id = $1 ORDER BY d.updated_at DESC",
        [request.user.sub]
      ),
      pool.query<{ client_id: string; deleted_at: Date | string }>(
        "SELECT client_id, deleted_at FROM notebook_tombstones WHERE owner_id = $1 ORDER BY deleted_at DESC",
        [request.user.sub]
      )
    ]);
    return {
      notebooks: result.rows.map((row) => ({
        id: row.client_id,
        title: row.title,
        mode: row.mode,
        updatedAt: Number(row.updated_at),
        revision: Number(row.revision)
      })),
      deletedNotebooks: deleted.rows.map((row) => ({
        id: row.client_id,
        deletedAt: new Date(row.deleted_at).getTime()
      }))
    };
  } catch (error) {
    return databaseFailure(reply, error);
  }
});
app.post<{ Body: { document: unknown } }>(
  "/cloud/notebooks",
  { preHandler: accessOnly },
  async (request, reply) => {
    const document = request.body?.document;
    if (!isCloudDocument(document)) return reply.code(400).send({ error: "Document invalide." });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await lockNotebook(client, document.notebook.id);
      const existing = await client.query<{ owner_id: string }>(
        "SELECT owner_id FROM notebooks WHERE client_id = $1 FOR UPDATE",
        [document.notebook.id]
      );
      if (existing.rowCount) {
        await client.query("ROLLBACK");
        return reply.code(409).send({ error: "Ce cahier existe déjà." });
      }

      const id = crypto.randomUUID();
      await client.query(
        "INSERT INTO notebooks (id, client_id, owner_id, title, mode) VALUES ($1, $2, $3, $4, $5)",
        [
          id,
          document.notebook.id,
          request.user.sub,
          document.notebook.title,
          document.notebook.mode
        ]
      );
      await client.query(
        "INSERT INTO documents (notebook_id, snapshot, revision, updated_at) VALUES ($1, $2, 1, now())",
        [id, document]
      );
      await client.query("DELETE FROM notebook_tombstones WHERE owner_id = $1 AND client_id = $2", [
        request.user.sub,
        document.notebook.id
      ]);
      await client.query("COMMIT");
      return reply.code(201).send({ document, revision: 1 });
    } catch (error) {
      await client.query("ROLLBACK");
      return databaseFailure(reply, error);
    } finally {
      client.release();
    }
  }
);
app.get<{ Params: { notebookId: string } }>(
  "/cloud/notebooks/:notebookId",
  { preHandler: accessOnly },
  async (request, reply) => {
    const cloud = await findCloudDocument(request.params.notebookId, request.user.sub);
    if (!cloud) {
      const tombstone = await pool.query<{ deleted_at: Date | string }>(
        "SELECT deleted_at FROM notebook_tombstones WHERE owner_id = $1 AND client_id = $2",
        [request.user.sub, request.params.notebookId]
      );
      if (tombstone.rowCount)
        return reply.code(410).send({
          error: "Ce cahier a été supprimé dans le cloud.",
          deletedAt: new Date(tombstone.rows[0]!.deleted_at).getTime()
        });
      return reply.code(404).send({ error: "Cahier introuvable." });
    }
    return { document: cloud.snapshot, revision: Number(cloud.revision) };
  }
);
app.put<{
  Params: { notebookId: string };
  Body: { document: unknown; baseRevision?: number; force?: boolean };
}>("/cloud/notebooks/:notebookId", { preHandler: accessOnly }, async (request, reply) => {
  const document = request.body?.document;
  if (!isCloudDocument(document) || document.notebook.id !== request.params.notebookId)
    return reply.code(400).send({ error: "Document invalide." });
  const client = await pool.connect();
  const force = request.body?.force === true;
  const baseRevision = validRevision(request.body?.baseRevision) ? request.body.baseRevision : 0;
  try {
    await client.query("BEGIN");
    await lockNotebook(client, request.params.notebookId);
    const existing = await client.query<{
      id: string;
      owner_id: string;
      snapshot: CloudDocument;
      revision: string | number;
    }>(
      "SELECT n.id, n.owner_id, d.snapshot, d.revision FROM notebooks n LEFT JOIN documents d ON d.notebook_id = n.id WHERE n.client_id = $1 FOR UPDATE OF n",
      [request.params.notebookId]
    );
    const current = existing.rows[0];
    if (current && current.owner_id !== request.user.sub) {
      await client.query("ROLLBACK");
      return reply.code(404).send({ error: "Cahier introuvable." });
    }
    const tombstone = await client.query<{ deleted_at: Date | string }>(
      "SELECT deleted_at FROM notebook_tombstones WHERE owner_id = $1 AND client_id = $2 FOR UPDATE",
      [request.user.sub, request.params.notebookId]
    );
    if (tombstone.rowCount && !force) {
      await client.query("ROLLBACK");
      return reply.code(410).send({
        error: "Ce cahier a été supprimé dans le cloud.",
        deletedAt: new Date(tombstone.rows[0]!.deleted_at).getTime()
      });
    }
    if (!force && current?.snapshot && Number(current.revision) !== baseRevision) {
      await client.query("ROLLBACK");
      return reply.code(409).send({
        error: "Une version plus récente existe dans le cloud.",
        document: current.snapshot,
        revision: Number(current.revision)
      });
    }
    const id = current?.id ?? crypto.randomUUID();
    const revision = current ? Number(current.revision) + 1 : 1;
    if (current)
      await client.query(
        "UPDATE notebooks SET title = $1, mode = $2, updated_at = now() WHERE id = $3",
        [document.notebook.title, document.notebook.mode, id]
      );
    else
      await client.query(
        "INSERT INTO notebooks (id, client_id, owner_id, title, mode) VALUES ($1, $2, $3, $4, $5)",
        [
          id,
          request.params.notebookId,
          request.user.sub,
          document.notebook.title,
          document.notebook.mode
        ]
      );
    await client.query(
      "INSERT INTO documents (notebook_id, snapshot, revision, updated_at) VALUES ($1, $2, $3, now()) ON CONFLICT (notebook_id) DO UPDATE SET snapshot = EXCLUDED.snapshot, revision = EXCLUDED.revision, updated_at = now()",
      [id, document, revision]
    );
    await client.query("DELETE FROM notebook_tombstones WHERE owner_id = $1 AND client_id = $2", [
      request.user.sub,
      request.params.notebookId
    ]);
    await client.query("COMMIT");
    return reply.code(current ? 200 : 201).send({ document, revision });
  } catch (error) {
    await client.query("ROLLBACK");
    return databaseFailure(reply, error);
  } finally {
    client.release();
  }
});
app.delete<{ Params: { notebookId: string }; Body: NotebookDeletionRequest }>(
  "/cloud/notebooks/:notebookId",
  { preHandler: accessOnly },
  async (request, reply) => {
    const requestedDeletedAt = request.body?.deletedAt;
    const deletedAt = new Date(
      typeof requestedDeletedAt === "number" && Number.isFinite(requestedDeletedAt)
        ? Math.min(Date.now(), Math.max(0, requestedDeletedAt))
        : Date.now()
    );
    const client = await pool.connect();
    const objectKeys: string[] = [];
    const force = request.body?.force === true;
    const baseRevision = validRevision(request.body?.baseRevision) ? request.body.baseRevision : 0;
    try {
      await client.query("BEGIN");
      await lockNotebook(client, request.params.notebookId);
      const existing = await client.query<{
        id: string;
        owner_id: string;
        snapshot: CloudDocument;
        revision: string | number;
      }>(
        "SELECT n.id, n.owner_id, d.snapshot, d.revision FROM notebooks n JOIN documents d ON d.notebook_id = n.id WHERE n.client_id = $1 FOR UPDATE OF n",
        [request.params.notebookId]
      );
      const current = existing.rows[0];
      if (current && current.owner_id !== request.user.sub) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ error: "Cahier introuvable." });
      }
      if (current && !force && Number(current.revision) !== baseRevision) {
        await client.query("ROLLBACK");
        return reply.code(409).send({
          error: "Une version plus récente existe dans le cloud.",
          document: current.snapshot,
          revision: Number(current.revision)
        });
      }
      if (current) {
        const assets = await client.query<{ object_key: string }>(
          "SELECT object_key FROM assets WHERE notebook_id = $1",
          [current.id]
        );
        for (const asset of assets.rows) {
          objectKeys.push(asset.object_key);
          await client.query(
            "INSERT INTO pending_asset_deletions (object_key) VALUES ($1) ON CONFLICT (object_key) DO NOTHING",
            [asset.object_key]
          );
        }
        await client.query("DELETE FROM notebooks WHERE id = $1", [current.id]);
      }
      await client.query(
        "INSERT INTO notebook_tombstones (id, owner_id, client_id, deleted_at) VALUES ($1, $2, $3, $4) ON CONFLICT (owner_id, client_id) DO UPDATE SET deleted_at = GREATEST(notebook_tombstones.deleted_at, EXCLUDED.deleted_at)",
        [crypto.randomUUID(), request.user.sub, request.params.notebookId, deletedAt]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      return databaseFailure(reply, error);
    } finally {
      client.release();
    }

    const room = sessions.get(request.params.notebookId);
    if (room) {
      for (const socket of room) socket.close(1001);
      sessions.delete(request.params.notebookId);
    }
    if (objectKeys.length) await drainPendingAssetDeletions(objectKeys);
    return reply.code(204).send();
  }
);
app.put<{ Params: { notebookId: string; assetId: string }; Body: Buffer }>(
  "/cloud/notebooks/:notebookId/assets/:assetId",
  { preHandler: accessOnly },
  async (request, reply) => {
    const cloud = await findCloudDocument(request.params.notebookId, request.user.sub);
    if (!cloud) return reply.code(404).send({ error: "Cahier introuvable." });
    const asset = cloud.snapshot.assets.find((item) => item.id === request.params.assetId);
    if (
      !asset ||
      !Buffer.isBuffer(request.body) ||
      request.body.byteLength !== asset.size ||
      asset.size > 25 * 1024 * 1024
    )
      return reply.code(400).send({ error: "Asset invalide." });
    const key = `${request.user.sub}/${request.params.notebookId}/${asset.id}`;
    try {
      await ensureBucket();
      await storage.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: request.body,
          ContentType: asset.mimeType
        })
      );
      await pool.query(
        "INSERT INTO assets (id, notebook_id, client_id, hash, mime_type, size, object_key) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (notebook_id, client_id) DO UPDATE SET hash = EXCLUDED.hash, mime_type = EXCLUDED.mime_type, size = EXCLUDED.size, object_key = EXCLUDED.object_key",
        [crypto.randomUUID(), cloud.id, asset.id, asset.hash, asset.mimeType, asset.size, key]
      );
      return reply.code(204).send();
    } catch (error) {
      app.log.error(error, "Asset upload failed");
      return reply.code(503).send({ error: "Le stockage cloud est indisponible." });
    }
  }
);
app.get<{ Params: { notebookId: string; assetId: string } }>(
  "/cloud/notebooks/:notebookId/assets/:assetId",
  { preHandler: accessOnly },
  async (request, reply) => {
    try {
      const result = await pool.query<{ object_key: string; mime_type: string }>(
        "SELECT a.object_key, a.mime_type FROM assets a JOIN notebooks n ON n.id = a.notebook_id WHERE n.client_id = $1 AND a.client_id = $2 AND n.owner_id = $3",
        [request.params.notebookId, request.params.assetId, request.user.sub]
      );
      const asset = result.rows[0];
      if (!asset) return reply.code(404).send({ error: "Asset introuvable." });
      const object = await storage.send(
        new GetObjectCommand({ Bucket: bucket, Key: asset.object_key })
      );
      return reply
        .type(asset.mime_type)
        .send(Buffer.from(await object.Body!.transformToByteArray()));
    } catch (error) {
      app.log.error(error, "Asset download failed");
      return reply.code(503).send({ error: "Le stockage cloud est indisponible." });
    }
  }
);

app.get("/sync/:notebookId", { websocket: true }, async (socket, request) => {
  try {
    await request.jwtVerify();
    if (request.user.type === "refresh") throw new Error();
  } catch {
    socket.close(1008);
    return;
  }
  const notebookId = (request.params as { notebookId: string }).notebookId;
  if (!(await findCloudDocument(notebookId, request.user.sub))) {
    socket.close(1008);
    return;
  }
  const room = sessions.get(notebookId) ?? new Set<RealtimeSocket>();
  sessions.set(notebookId, room);
  room.add(socket);
  socket.on("message", (message: unknown) => {
    for (const peer of room) if (peer !== socket && peer.readyState === 1) peer.send(message);
  });
  socket.on("close", () => {
    room.delete(socket);
    if (!room.size) sessions.delete(notebookId);
  });
});

async function findCloudDocument(clientId: string, ownerId: string) {
  const result = await pool.query<{
    id: string;
    snapshot: CloudDocument;
    revision: string | number;
  }>(
    "SELECT n.id, d.snapshot, d.revision FROM notebooks n JOIN documents d ON d.notebook_id = n.id WHERE n.client_id = $1 AND n.owner_id = $2",
    [clientId, ownerId]
  );
  return result.rows[0];
}
async function ensureSchema() {
  await pool.query(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT NOT NULL DEFAULT ''"
  );
  await pool.query(
    "UPDATE users SET display_name = split_part(email, '@', 1) WHERE display_name = ''"
  );
  await pool.query(
    "CREATE TABLE IF NOT EXISTS webauthn_credentials (id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, credential_id TEXT NOT NULL UNIQUE, public_key TEXT NOT NULL, counter BIGINT NOT NULL DEFAULT 0, transports JSONB NOT NULL DEFAULT '[]'::jsonb, label TEXT NOT NULL, device_type TEXT NOT NULL, backed_up BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_used_at TIMESTAMPTZ)"
  );
  await pool.query(
    "CREATE INDEX IF NOT EXISTS webauthn_credentials_user_id_idx ON webauthn_credentials(user_id)"
  );
  await pool.query(
    "CREATE TABLE IF NOT EXISTS webauthn_challenges (id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, purpose TEXT NOT NULL CHECK (purpose IN ('registration', 'authentication')), challenge TEXT NOT NULL, label TEXT, expires_at TIMESTAMPTZ NOT NULL)"
  );
  await pool.query(
    "CREATE INDEX IF NOT EXISTS webauthn_challenges_user_purpose_idx ON webauthn_challenges(user_id, purpose)"
  );
  await pool.query("ALTER TABLE notebooks ADD COLUMN IF NOT EXISTS client_id TEXT");
  await pool.query("UPDATE notebooks SET client_id = id::text WHERE client_id IS NULL");
  await pool.query("ALTER TABLE notebooks ALTER COLUMN client_id SET NOT NULL");
  await pool.query(
    "CREATE UNIQUE INDEX IF NOT EXISTS notebooks_client_id_key ON notebooks (client_id)"
  );
  await pool.query("ALTER TABLE assets ADD COLUMN IF NOT EXISTS client_id TEXT");
  await pool.query("UPDATE assets SET client_id = id::text WHERE client_id IS NULL");
  await pool.query("ALTER TABLE assets ALTER COLUMN client_id SET NOT NULL");
  await pool.query(
    "CREATE UNIQUE INDEX IF NOT EXISTS assets_notebook_client_id_key ON assets (notebook_id, client_id)"
  );
  await pool.query(
    "CREATE TABLE IF NOT EXISTS notebook_tombstones (id UUID PRIMARY KEY, owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, client_id TEXT NOT NULL, deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (owner_id, client_id))"
  );
  await pool.query(
    "CREATE INDEX IF NOT EXISTS notebook_tombstones_owner_deleted_idx ON notebook_tombstones (owner_id, deleted_at DESC)"
  );
  await pool.query(
    "CREATE TABLE IF NOT EXISTS pending_asset_deletions (object_key TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT now())"
  );
  await pool.query(
    "ALTER TABLE documents ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 1"
  );
}
async function lockNotebook(client: { query: Pool["query"] }, notebookId: string) {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
    `notylo-notebook:${notebookId}`
  ]);
}
async function drainPendingAssetDeletions(objectKeys?: readonly string[]) {
  const pending = objectKeys?.length
    ? await pool.query<{ object_key: string }>(
        "SELECT object_key FROM pending_asset_deletions WHERE object_key = ANY($1::text[])",
        [[...objectKeys]]
      )
    : await pool.query<{ object_key: string }>(
        "SELECT object_key FROM pending_asset_deletions ORDER BY created_at LIMIT 200"
      );

  for (const item of pending.rows) {
    try {
      await storage.send(new DeleteObjectCommand({ Bucket: bucket, Key: item.object_key }));
      await pool.query("DELETE FROM pending_asset_deletions WHERE object_key = $1", [
        item.object_key
      ]);
    } catch (error) {
      app.log.warn(error, `Deferred asset deletion failed for ${item.object_key}`);
    }
  }
}
let bucketReady: Promise<void> | undefined;
function ensureBucket() {
  bucketReady ??= storage
    .send(new HeadBucketCommand({ Bucket: bucket }))
    .then(() => undefined)
    .catch(async () => {
      await storage.send(new CreateBucketCommand({ Bucket: bucket }));
    });
  return bucketReady;
}
async function accessOnly(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
    if (request.user.type === "refresh")
      return reply.code(401).send({ error: "Jeton d’accès requis." });
    const exists = await pool.query("SELECT 1 FROM users WHERE id = $1", [request.user.sub]);
    if (!exists.rowCount) return reply.code(401).send({ error: "La session n’est plus valide." });
  } catch {
    return reply.code(401).send({ error: "Session invalide ou expirée." });
  }
}
async function refreshOnly(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
    if (request.user.type !== "refresh")
      return reply.code(401).send({ error: "Jeton de renouvellement requis." });
  } catch {
    return reply.code(401).send({ error: "Session invalide ou expirée." });
  }
}
function validateCredentials(body: Credentials, reply: FastifyReply): Credentials | undefined {
  const email = body?.email?.trim().toLowerCase();
  const password = body?.password;
  if (!email || !/^\S+@\S+\.\S+$/.test(email) || !password || password.length < 10) {
    reply.code(400).send({
      error: "Utilisez une adresse e-mail valide et un mot de passe d’au moins 10 caractères."
    });
    return;
  }
  return { email, password };
}
async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("base64url");
  return `scrypt$${salt}$${((await scrypt(password, salt, 64)) as Buffer).toString("base64url")}`;
}
async function verifyPassword(password: string, stored: string) {
  const [algorithm, salt, digest] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !digest) return false;
  const expected = Buffer.from(digest, "base64url");
  const derived = (await scrypt(password, salt, expected.length)) as Buffer;
  return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
}
function issueTokens(user: StoredUser) {
  return {
    accessToken: app.jwt.sign({ sub: user.id, email: user.email }, { expiresIn: "15m" }),
    refreshToken: app.jwt.sign(
      { sub: user.id, email: user.email, type: "refresh" },
      { expiresIn: "30d" }
    ),
    user: toAccount(user)
  };
}
function databaseFailure(reply: FastifyReply, error: unknown) {
  app.log.error(error, "Database request failed");
  return reply.code(503).send({ error: "Le service cloud est temporairement indisponible." });
}
function isUniqueViolation(error: unknown): error is { code: string } {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
function isCloudDocument(value: unknown): value is CloudDocument {
  if (!value || typeof value !== "object") return false;
  const document = value as CloudDocument;
  return (
    typeof document.notebook?.id === "string" &&
    typeof document.notebook.title === "string" &&
    (document.notebook.mode === "book" || document.notebook.mode === "whiteboard") &&
    Number.isFinite(document.notebook.updatedAt) &&
    Array.isArray(document.assets)
  );
}
function validRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function displayNameFromEmail(email: string) {
  return email.split("@", 1)[0]!.slice(0, 80) || "Utilisateur";
}
function toAccount(user: Account) {
  return { id: user.id, email: user.email, displayName: user.display_name };
}
function toWebAuthnCredential(credential: StoredPasskey): WebAuthnCredential {
  return {
    id: credential.credential_id,
    publicKey: Buffer.from(credential.public_key, "base64url"),
    counter: Number(credential.counter),
    transports: credential.transports
  };
}
function toPublicPasskey(passkey: StoredPasskey) {
  return {
    id: passkey.id,
    label: passkey.label,
    deviceType: passkey.device_type,
    backedUp: passkey.backed_up,
    createdAt: passkey.created_at,
    lastUsedAt: passkey.last_used_at
  };
}
async function saveChallenge(
  userId: string,
  purpose: "registration" | "authentication",
  challenge: string,
  label?: string
) {
  await pool.query(
    "DELETE FROM webauthn_challenges WHERE (user_id = $1 AND purpose = $2) OR expires_at < now()",
    [userId, purpose]
  );
  await pool.query(
    "INSERT INTO webauthn_challenges (id, user_id, purpose, challenge, label, expires_at) VALUES ($1, $2, $3, $4, $5, now() + interval '5 minutes')",
    [crypto.randomUUID(), userId, purpose, challenge, label ?? null]
  );
}
async function consumeChallenge(userId: string, purpose: "registration" | "authentication") {
  const result = await pool.query<{ challenge: string; label: string | null }>(
    "DELETE FROM webauthn_challenges WHERE id = (SELECT id FROM webauthn_challenges WHERE user_id = $1 AND purpose = $2 AND expires_at > now() ORDER BY expires_at DESC LIMIT 1) RETURNING challenge, label",
    [userId, purpose]
  );
  return result.rows[0];
}
function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
function readBoolean(name: string, fallback: boolean) {
  const value = process.env[name];
  return value === undefined
    ? fallback
    : ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}
await app.listen({ port: Number(process.env.PORT ?? 3001), host: process.env.HOST ?? "0.0.0.0" });
