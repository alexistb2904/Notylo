import type { FastifyInstance } from "fastify";
import type { Pool, PoolClient } from "pg";
import type { S3Client } from "@aws-sdk/client-s3";
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  RegistrationResponseJSON
} from "@simplewebauthn/server";

export type Credentials = { email: string; password: string };
export type StoredUser = { id: string; email: string; password_hash: string; display_name: string };
export type Account = Pick<StoredUser, "id" | "email" | "display_name">;
export type PasswordChange = { currentPassword: string; newPassword: string };
export type ProfileChange = { displayName: string };
export type PasskeyOptionsRequest = { name?: string };
export type PasskeyVerification = { response: RegistrationResponseJSON };
export type PasskeyLoginOptionsRequest = { email: string };
export type PasskeyLoginVerification = { email: string; response: AuthenticationResponseJSON };
export type AccountDeletion = { password: string; confirmation: string };
export type NotebookDeletionRequest = {
  deletedAt?: number;
  baseRevision?: number;
  force?: boolean;
};
export type StoredPasskey = {
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
export type CloudDocument = {
  notebook: { id: string; title: string; mode: "book" | "whiteboard"; updatedAt: number };
  assets: readonly { id: string; hash: string; mimeType: string; size: number }[];
};
export type RealtimeSocket = {
  readonly readyState: number;
  send(data: unknown): void;
  close(code?: number): void;
  on(event: "message" | "close", listener: (data?: unknown) => void): void;
};
export type ApiContext = {
  app: FastifyInstance;
  pool: Pool;
  storage: S3Client;
  bucket: string;
  registrationEnabled: boolean;
  webauthnRpId: string;
  webauthnOrigin: string;
  sessions: Map<string, Set<RealtimeSocket>>;
};
export type DbClient = PoolClient;

declare module "@fastify/jwt" {
  interface FastifyJWT {
    user: { sub: string; email?: string; type?: "refresh" };
  }
}
