import crypto from "node:crypto";
import type { FastifyReply } from "fastify";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse
} from "@simplewebauthn/server";
import { consumeChallenge, saveChallenge } from "../db.js";
import { accessOnly, refreshOnly, validUuid } from "../security.js";
import {
  databaseFailure,
  displayNameFromEmail,
  hashPassword,
  isUniqueViolation,
  toAccount,
  toPublicPasskey,
  toWebAuthnCredential,
  validateCredentials,
  verifyPassword
} from "../utils.js";
import type {
  Account,
  AccountDeletion,
  ApiContext,
  Credentials,
  PasskeyLoginOptionsRequest,
  PasskeyLoginVerification,
  PasskeyOptionsRequest,
  PasskeyVerification,
  PasswordChange,
  ProfileChange,
  StoredPasskey,
  StoredUser
} from "../types.js";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";

export function registerAuthRoutes(context: ApiContext): void {
  const { app, pool } = context;
  const auth = (request: Parameters<typeof accessOnly>[1], reply: FastifyReply) =>
    accessOnly(context, request, reply);
  const refresh = (request: Parameters<typeof refreshOnly>[1], reply: FastifyReply) =>
    refreshOnly(context, request, reply);

  app.get("/auth/config", async () => ({ registrationEnabled: context.registrationEnabled }));
  app.post<{ Body: Credentials }>(
    "/auth/register",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      if (!context.registrationEnabled)
        return reply.code(403).send({ error: "Les inscriptions sont actuellement fermées." });
      const credentials = validateCredentials(request.body, reply);
      if (!credentials) return;
      try {
        const result = await pool.query<StoredUser>(
          "INSERT INTO users (id, email, password_hash, display_name) VALUES ($1, $2, $3, $4) RETURNING id, email, password_hash, display_name, session_version",
          [
            crypto.randomUUID(),
            credentials.email,
            await hashPassword(credentials.password),
            displayNameFromEmail(credentials.email)
          ]
        );
        return issueTokens(context, result.rows[0]!);
      } catch (error) {
        if (isUniqueViolation(error))
          return reply.code(409).send({ error: "Un compte existe déjà pour cette adresse." });
        return databaseFailure(reply, error, app.log.error.bind(app.log));
      }
    }
  );
  app.post<{ Body: Credentials }>(
    "/auth/login",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const credentials = validateCredentials(request.body, reply);
      if (!credentials) return;
      try {
        const user = (
          await pool.query<StoredUser>(
            "SELECT id, email, password_hash, display_name, session_version FROM users WHERE email = $1 LIMIT 1",
            [credentials.email]
          )
        ).rows[0];
        if (!user || !(await verifyPassword(credentials.password, user.password_hash)))
          return reply.code(401).send({ error: "Adresse e-mail ou mot de passe incorrect." });
        return issueTokens(context, user);
      } catch (error) {
        return databaseFailure(reply, error, app.log.error.bind(app.log));
      }
    }
  );
  app.post(
    "/auth/refresh",
    { preHandler: refresh, config: { rateLimit: { max: 30, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      try {
        const user = (
          await pool.query<StoredUser>(
            "SELECT id, email, password_hash, display_name, session_version FROM users WHERE id = $1 LIMIT 1",
            [request.user.sub]
          )
        ).rows[0];
        return user
          ? issueTokens(context, user)
          : reply.code(401).send({ error: "La session n’est plus valide." });
      } catch (error) {
        return databaseFailure(reply, error, app.log.error.bind(app.log));
      }
    }
  );
  app.post("/auth/logout", { preHandler: auth }, async (request, reply) => {
    try {
      await pool.query("UPDATE users SET session_version = session_version + 1 WHERE id = $1", [
        request.user.sub
      ]);
      return reply.code(204).send();
    } catch (error) {
      return databaseFailure(reply, error, app.log.error.bind(app.log));
    }
  });
  app.get("/auth/me", { preHandler: auth }, async (request, reply) => {
    try {
      const user = (
        await pool.query<Account>(
          "SELECT id, email, display_name FROM users WHERE id = $1 LIMIT 1",
          [request.user.sub]
        )
      ).rows[0];
      return user
        ? { user: toAccount(user) }
        : reply.code(401).send({ error: "La session n’est plus valide." });
    } catch (error) {
      return databaseFailure(reply, error, app.log.error.bind(app.log));
    }
  });
  app.put<{ Body: ProfileChange }>("/auth/me", { preHandler: auth }, async (request, reply) => {
    const displayName =
      typeof request.body?.displayName === "string" ? request.body.displayName.trim() : "";
    if (!displayName || displayName.length > 80)
      return reply.code(400).send({ error: "Le nom doit contenir entre 1 et 80 caractères." });
    try {
      const user = (
        await pool.query<Account>(
          "UPDATE users SET display_name = $1 WHERE id = $2 RETURNING id, email, display_name",
          [displayName, request.user.sub]
        )
      ).rows[0];
      return user
        ? { user: toAccount(user) }
        : reply.code(401).send({ error: "La session n’est plus valide." });
    } catch (error) {
      return databaseFailure(reply, error, app.log.error.bind(app.log));
    }
  });
  app.put<{ Body: PasswordChange }>(
    "/auth/me/password",
    { preHandler: auth, config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const currentPassword = request.body?.currentPassword;
      const newPassword = request.body?.newPassword;
      if (
        typeof currentPassword !== "string" ||
        typeof newPassword !== "string" ||
        newPassword.length < 10 ||
        newPassword.length > 512
      )
        return reply
          .code(400)
          .send({ error: "Utilisez un nouveau mot de passe d’au moins 10 caractères." });
      try {
        const user = (
          await pool.query<StoredUser>(
            "SELECT id, email, password_hash, display_name FROM users WHERE id = $1 LIMIT 1",
            [request.user.sub]
          )
        ).rows[0];
        if (!user || !(await verifyPassword(currentPassword, user.password_hash)))
          return reply.code(401).send({ error: "Le mot de passe actuel est incorrect." });
        await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
          await hashPassword(newPassword),
          user.id
        ]);
        return reply.code(204).send();
      } catch (error) {
        return databaseFailure(reply, error, app.log.error.bind(app.log));
      }
    }
  );

  app.post<{ Body: PasskeyLoginOptionsRequest }>(
    "/auth/passkeys/login/options",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const email =
        typeof request.body?.email === "string" ? request.body.email.trim().toLowerCase() : "";
      if (email && (email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)))
        return reply.code(400).send({ error: "Saisissez une adresse e-mail valide." });
      try {
        let user: Account | undefined;
        let credentials: StoredPasskey[] = [];
        if (email) {
          user = (
            await pool.query<Account>(
              "SELECT id, email, display_name FROM users WHERE email = $1 LIMIT 1",
              [email]
            )
          ).rows[0];
          if (!user)
            return reply.code(401).send({ error: "Aucune passkey ne correspond à cette adresse." });
          credentials = (
            await pool.query<StoredPasskey>(
              "SELECT id, user_id, credential_id, public_key, counter, transports, label, device_type, backed_up, created_at, last_used_at FROM webauthn_credentials WHERE user_id = $1",
              [user.id]
            )
          ).rows;
          if (!credentials.length)
            return reply
              .code(401)
              .send({ error: "Aucune passkey n’est configurée pour ce compte." });
        }
        const options = await generateAuthenticationOptions({
          rpID: context.webauthnRpId,
          ...(credentials.length
            ? {
                allowCredentials: credentials.map((credential) => ({
                  id: credential.credential_id,
                  transports: credential.transports
                }))
              }
            : {}),
          userVerification: "required"
        });
        await saveChallenge(pool, user?.id ?? null, "authentication", options.challenge);
        return options;
      } catch (error) {
        return databaseFailure(reply, error, app.log.error.bind(app.log));
      }
    }
  );
  app.post<{ Body: PasskeyLoginVerification }>(
    "/auth/passkeys/login/verify",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const email =
        typeof request.body?.email === "string" ? request.body.email.trim().toLowerCase() : "";
      const response = request.body?.response;
      if ((email && (email.length > 254 || !/^\S+@\S+\.\S+$/.test(email))) || !response?.id)
        return reply.code(400).send({ error: "Réponse passkey invalide." });
      try {
        let user: StoredUser | undefined;
        if (email) {
          user = (
            await pool.query<StoredUser>(
              "SELECT id, email, password_hash, display_name, session_version FROM users WHERE email = $1 LIMIT 1",
              [email]
            )
          ).rows[0];
        }
        if (email && !user)
          return reply.code(401).send({ error: "Cette passkey n’est pas reconnue." });
        const credential = (
          await pool.query<StoredPasskey>(
            user
              ? "SELECT id, user_id, credential_id, public_key, counter, transports, label, device_type, backed_up, created_at, last_used_at FROM webauthn_credentials WHERE user_id = $1 AND credential_id = $2 LIMIT 1"
              : "SELECT id, user_id, credential_id, public_key, counter, transports, label, device_type, backed_up, created_at, last_used_at FROM webauthn_credentials WHERE credential_id = $1 LIMIT 1",
            user ? [user.id, response.id] : [response.id]
          )
        ).rows[0];
        if (!user && credential) {
          user = (
            await pool.query<StoredUser>(
              "SELECT id, email, password_hash, display_name, session_version FROM users WHERE id = $1 LIMIT 1",
              [credential.user_id]
            )
          ).rows[0];
        }
        const challenge = await consumeChallenge(
          pool,
          email && user ? user.id : null,
          "authentication"
        );
        if (!challenge || !credential)
          return reply.code(401).send({ error: "La demande passkey a expiré. Réessayez." });
        if (!user) return reply.code(401).send({ error: "Cette passkey n’est pas reconnue." });
        const verification = await verifyAuthenticationResponse({
          response,
          expectedChallenge: challenge.challenge,
          expectedOrigin: context.webauthnOrigin,
          expectedRPID: context.webauthnRpId,
          requireUserVerification: true,
          credential: toWebAuthnCredential(credential)
        });
        if (!verification.verified)
          return reply.code(401).send({ error: "Cette passkey n’a pas pu être vérifiée." });
        await pool.query(
          "UPDATE webauthn_credentials SET counter = $1, last_used_at = now() WHERE id = $2",
          [verification.authenticationInfo.newCounter, credential.id]
        );
        return issueTokens(context, user);
      } catch (error) {
        app.log.warn(error, "Passkey authentication failed");
        return reply.code(401).send({ error: "Cette passkey n’a pas pu être vérifiée." });
      }
    }
  );
  app.post<{ Body: PasskeyOptionsRequest }>(
    "/auth/passkeys/registration/options",
    { preHandler: auth },
    async (request, reply) => {
      const label =
        typeof request.body?.name === "string"
          ? request.body.name.trim() || "Nouvelle passkey"
          : "Nouvelle passkey";
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
          rpID: context.webauthnRpId,
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
        await saveChallenge(pool, user.id, "registration", options.challenge, label);
        return options;
      } catch (error) {
        return databaseFailure(reply, error, app.log.error.bind(app.log));
      }
    }
  );
  app.post<{ Body: PasskeyVerification }>(
    "/auth/passkeys/registration/verify",
    { preHandler: auth },
    async (request, reply) => {
      const response = request.body?.response;
      if (!response?.id) return reply.code(400).send({ error: "Réponse passkey invalide." });
      try {
        const challenge = await consumeChallenge(pool, request.user.sub, "registration");
        if (!challenge)
          return reply.code(400).send({ error: "La demande passkey a expiré. Réessayez." });
        const verification = await verifyRegistrationResponse({
          response,
          expectedChallenge: challenge.challenge,
          expectedOrigin: context.webauthnOrigin,
          expectedRPID: context.webauthnRpId,
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
  app.get("/auth/passkeys", { preHandler: auth }, async (request, reply) => {
    try {
      const result = await pool.query<StoredPasskey>(
        "SELECT id, user_id, credential_id, public_key, counter, transports, label, device_type, backed_up, created_at, last_used_at FROM webauthn_credentials WHERE user_id = $1 ORDER BY created_at",
        [request.user.sub]
      );
      return { passkeys: result.rows.map(toPublicPasskey) };
    } catch (error) {
      return databaseFailure(reply, error, app.log.error.bind(app.log));
    }
  });
  app.put<{ Params: { passkeyId: string }; Body: PasskeyOptionsRequest }>(
    "/auth/passkeys/:passkeyId",
    { preHandler: auth },
    async (request, reply) => {
      const label = typeof request.body?.name === "string" ? request.body.name.trim() : "";
      if (!validUuid(request.params.passkeyId) || !label || label.length > 80)
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
        return databaseFailure(reply, error, app.log.error.bind(app.log));
      }
    }
  );
  app.delete<{ Params: { passkeyId: string } }>(
    "/auth/passkeys/:passkeyId",
    { preHandler: auth },
    async (request, reply) => {
      if (!validUuid(request.params.passkeyId))
        return reply.code(400).send({ error: "Identifiant de passkey invalide." });
      try {
        const result = await pool.query(
          "DELETE FROM webauthn_credentials WHERE id = $1 AND user_id = $2",
          [request.params.passkeyId, request.user.sub]
        );
        return result.rowCount
          ? reply.code(204).send()
          : reply.code(404).send({ error: "Passkey introuvable." });
      } catch (error) {
        return databaseFailure(reply, error, app.log.error.bind(app.log));
      }
    }
  );
  app.post<{ Body: AccountDeletion }>(
    "/auth/account/delete",
    { preHandler: auth, config: { rateLimit: { max: 3, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      if (
        request.body?.confirmation !== "SUPPRIMER" ||
        typeof request.body?.password !== "string" ||
        request.body.password.length > 512
      )
        return reply
          .code(400)
          .send({ error: "Confirmez en saisissant SUPPRIMER et votre mot de passe." });
      const client = await pool.connect();
      const objectKeys: string[] = [];
      try {
        await client.query("BEGIN");
        const user = (
          await client.query<StoredUser>(
            "SELECT id, email, password_hash, display_name FROM users WHERE id = $1 FOR UPDATE",
            [request.user.sub]
          )
        ).rows[0];
        if (!user || !(await verifyPassword(request.body.password, user.password_hash))) {
          await client.query("ROLLBACK");
          return reply.code(401).send({ error: "Le mot de passe actuel est incorrect." });
        }
        const assets = (
          await client.query<{ object_key: string }>(
            "SELECT a.object_key FROM assets a JOIN notebooks n ON n.id = a.notebook_id WHERE n.owner_id = $1",
            [user.id]
          )
        ).rows;
        objectKeys.push(...assets.map((asset) => asset.object_key));
        await client.query("DELETE FROM users WHERE id = $1", [user.id]);
        await client.query("COMMIT");
        for (const key of objectKeys) {
          try {
            await context.storage.send(
              new DeleteObjectCommand({ Bucket: context.bucket, Key: key })
            );
          } catch (error) {
            app.log.warn(error, "Account asset cleanup failed");
          }
        }
        return reply.code(204).send();
      } catch (error) {
        await client.query("ROLLBACK");
        return databaseFailure(reply, error, app.log.error.bind(app.log));
      } finally {
        client.release();
      }
    }
  );
}

function issueTokens(context: ApiContext, user: StoredUser) {
  const sessionVersion = Number(user.session_version ?? 0);
  return {
    accessToken: context.app.jwt.sign(
      { sub: user.id, email: user.email, sessionVersion },
      { expiresIn: "15m" }
    ),
    refreshToken: context.app.jwt.sign(
      { sub: user.id, email: user.email, type: "refresh", sessionVersion },
      { expiresIn: "30d" }
    ),
    user: toAccount(user)
  };
}
