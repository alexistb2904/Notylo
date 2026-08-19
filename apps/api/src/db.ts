import crypto from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { CloudDocument } from "./types.js";

export async function ensureSchema(pool: Pool): Promise<void> {
  await pool.query(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version BIGINT NOT NULL DEFAULT 0"
  );
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
    "CREATE TABLE IF NOT EXISTS webauthn_challenges (id UUID PRIMARY KEY, user_id UUID REFERENCES users(id) ON DELETE CASCADE, purpose TEXT NOT NULL CHECK (purpose IN ('registration', 'authentication')), challenge TEXT NOT NULL, label TEXT, expires_at TIMESTAMPTZ NOT NULL)"
  );
  await pool.query("ALTER TABLE webauthn_challenges ALTER COLUMN user_id DROP NOT NULL");
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
  // Different logical objects may reference identical bytes. The client id is
  // the asset identity; the content hash is only a lookup/deduplication hint.
  await pool.query("ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_notebook_id_hash_key");
  await pool.query("DROP INDEX IF EXISTS assets_notebook_id_hash_key");
  await pool.query(
    "CREATE UNIQUE INDEX IF NOT EXISTS assets_notebook_client_id_key ON assets (notebook_id, client_id)"
  );
  await pool.query(
    "CREATE INDEX IF NOT EXISTS assets_notebook_hash_idx ON assets (notebook_id, hash)"
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
  await pool.query(
    "CREATE TABLE IF NOT EXISTS notebook_shares (notebook_id UUID PRIMARY KEY REFERENCES notebooks(id) ON DELETE CASCADE, token_hash TEXT NOT NULL UNIQUE, mode TEXT NOT NULL CHECK (mode IN ('read', 'write')), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())"
  );
  await pool.query(
    "CREATE INDEX IF NOT EXISTS notebook_shares_token_hash_idx ON notebook_shares(token_hash)"
  );
}

export async function findCloudDocument(pool: Pool, clientId: string, ownerId: string) {
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

export async function lockNotebook(client: PoolClient, notebookId: string): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
    `notylo-notebook:${notebookId}`
  ]);
}

export async function saveChallenge(
  pool: Pool,
  userId: string | null,
  purpose: "registration" | "authentication",
  challenge: string,
  label?: string
): Promise<void> {
  if (userId) {
    await pool.query(
      "DELETE FROM webauthn_challenges WHERE (user_id = $1 AND purpose = $2) OR expires_at < now()",
      [userId, purpose]
    );
  } else {
    await pool.query(
      "DELETE FROM webauthn_challenges WHERE (user_id IS NULL AND purpose = $1) OR expires_at < now()",
      [purpose]
    );
  }
  await pool.query(
    "INSERT INTO webauthn_challenges (id, user_id, purpose, challenge, label, expires_at) VALUES ($1, $2, $3, $4, $5, now() + interval '5 minutes')",
    [crypto.randomUUID(), userId, purpose, challenge, label ?? null]
  );
}

export async function consumeChallenge(
  pool: Pool,
  userId: string | null,
  purpose: "registration" | "authentication"
) {
  const userFilter = userId ? "user_id = $1" : "user_id IS NULL";
  const params = userId ? [userId, purpose] : [purpose];
  const result = await pool.query<{ challenge: string; label: string | null }>(
    `DELETE FROM webauthn_challenges WHERE id = (SELECT id FROM webauthn_challenges WHERE ${userFilter} AND purpose = $${userId ? 2 : 1} AND expires_at > now() ORDER BY expires_at DESC LIMIT 1) RETURNING challenge, label`,
    params
  );
  return result.rows[0];
}
