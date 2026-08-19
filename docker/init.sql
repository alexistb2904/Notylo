CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  session_version BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  transports JSONB NOT NULL DEFAULT '[]'::jsonb,
  label TEXT NOT NULL,
  device_type TEXT NOT NULL,
  backed_up BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS webauthn_credentials_user_id_idx ON webauthn_credentials(user_id);
CREATE TABLE IF NOT EXISTS webauthn_challenges (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('registration', 'authentication')),
  challenge TEXT NOT NULL,
  label TEXT,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS webauthn_challenges_user_purpose_idx ON webauthn_challenges(user_id, purpose);
CREATE TABLE IF NOT EXISTS notebooks (
  id UUID PRIMARY KEY,
  client_id TEXT NOT NULL UNIQUE,
  owner_id UUID REFERENCES users(id),
  title TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('book', 'whiteboard')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS documents (
  notebook_id UUID PRIMARY KEY REFERENCES notebooks(id) ON DELETE CASCADE,
  snapshot JSONB NOT NULL,
  revision BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY,
  notebook_id UUID REFERENCES notebooks(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  hash TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size BIGINT NOT NULL,
  object_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS assets_notebook_client_id_key ON assets (notebook_id, client_id);
CREATE INDEX IF NOT EXISTS assets_notebook_hash_idx ON assets (notebook_id, hash);
CREATE TABLE IF NOT EXISTS notebook_tombstones (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, client_id)
);
CREATE INDEX IF NOT EXISTS notebook_tombstones_owner_deleted_idx
  ON notebook_tombstones (owner_id, deleted_at DESC);

CREATE TABLE IF NOT EXISTS notebook_shares (
  notebook_id UUID PRIMARY KEY REFERENCES notebooks(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  mode TEXT NOT NULL CHECK (mode IN ('read', 'write')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notebook_shares_token_hash_idx ON notebook_shares(token_hash);

CREATE TABLE IF NOT EXISTS pending_asset_deletions (
  object_key TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY,
  owner_id UUID REFERENCES users(id),
  name TEXT NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sync_metadata (
  notebook_id UUID PRIMARY KEY REFERENCES notebooks(id) ON DELETE CASCADE,
  clock BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
