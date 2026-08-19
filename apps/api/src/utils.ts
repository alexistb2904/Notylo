import crypto from "node:crypto";
import { promisify } from "node:util";
import type { FastifyReply } from "fastify";
import type { Account, CloudDocument, StoredPasskey } from "./types.js";

const scrypt = promisify(crypto.scrypt);

export function toAccount(user: Account) {
  return { id: user.id, email: user.email, displayName: user.display_name };
}

export function displayNameFromEmail(email: string): string {
  return email.split("@", 1)[0]!.slice(0, 80) || "Utilisateur";
}

export function validateCredentials(body: unknown, reply: FastifyReply) {
  const value = body as Partial<{ email: unknown; password: unknown }> | undefined;
  const email = typeof value?.email === "string" ? value.email.trim().toLowerCase() : "";
  const password = value?.password;
  if (
    !email ||
    email.length > 254 ||
    !/^\S+@\S+\.\S+$/.test(email) ||
    typeof password !== "string" ||
    password.length < 10 ||
    password.length > 512
  ) {
    reply.code(400).send({
      error: "Utilisez une adresse e-mail valide et un mot de passe d’au moins 10 caractères."
    });
    return undefined;
  }
  return { email, password };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("base64url");
  return `scrypt$${salt}$${((await scrypt(password, salt, 64)) as Buffer).toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, salt, digest] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !digest) return false;
  try {
    const expected = Buffer.from(digest, "base64url");
    const derived = (await scrypt(password, salt, expected.length)) as Buffer;
    return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
  } catch {
    return false;
  }
}

export function isUniqueViolation(error: unknown): error is { code: string } {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export function databaseFailure(
  reply: FastifyReply,
  error: unknown,
  log: (error: unknown, message: string) => void
) {
  log(error, "Database request failed");
  return reply.code(503).send({ error: "Le service cloud est temporairement indisponible." });
}

export function isCloudDocument(value: unknown): value is CloudDocument {
  if (!value || typeof value !== "object") return false;
  const document = value as Partial<CloudDocument>;
  return (
    typeof document.notebook?.id === "string" &&
    document.notebook.id.length <= 128 &&
    typeof document.notebook.title === "string" &&
    document.notebook.title.length <= 200 &&
    (document.notebook.mode === "book" || document.notebook.mode === "whiteboard") &&
    Number.isFinite(document.notebook.updatedAt) &&
    Array.isArray(document.assets) &&
    document.assets.length <= 10_000 &&
    document.assets.every(
      (asset) =>
        typeof asset?.id === "string" &&
        asset.id.length <= 128 &&
        typeof asset.hash === "string" &&
        asset.hash.length <= 256 &&
        typeof asset.mimeType === "string" &&
        asset.mimeType.length <= 100 &&
        Number.isSafeInteger(asset.size) &&
        asset.size >= 0 &&
        asset.size <= 25 * 1024 * 1024
    )
  );
}

export function toWebAuthnCredential(credential: StoredPasskey) {
  return {
    id: credential.credential_id,
    publicKey: Buffer.from(credential.public_key, "base64url"),
    counter: Number(credential.counter),
    transports: credential.transports
  };
}

export function toPublicPasskey(passkey: StoredPasskey) {
  return {
    id: passkey.id,
    label: passkey.label,
    deviceType: passkey.device_type,
    backedUp: passkey.backed_up,
    createdAt: passkey.created_at,
    lastUsedAt: passkey.last_used_at
  };
}
