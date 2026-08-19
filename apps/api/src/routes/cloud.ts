import crypto from "node:crypto";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import type { FastifyReply } from "fastify";
import { findCloudDocument, lockNotebook } from "../db.js";
import { accessOnly, validClientId, validRevision, validShareToken } from "../security.js";
import { databaseFailure, isCloudDocument } from "../utils.js";
import type {
  ApiContext,
  CloudDocument,
  NotebookDeletionRequest,
  NotebookShareMode
} from "../types.js";
import { drainPendingAssetDeletions, ensureBucket } from "../storage.js";

const maxAssetSize = 25 * 1024 * 1024;
const mimePattern =
  /^(image\/(png|jpeg|webp|gif)|application\/pdf|audio\/mpeg|audio\/wav|video\/mp4)$/;

function shareTokenHash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createShareToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function registerCloudRoutes(context: ApiContext): void {
  const { app, pool } = context;
  const auth = (request: Parameters<typeof accessOnly>[1], reply: FastifyReply) =>
    accessOnly(context, request, reply);

  app.get("/cloud/notebooks", { preHandler: auth }, async (request, reply) => {
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
      return databaseFailure(reply, error, app.log.error.bind(app.log));
    }
  });

  app.get<{ Params: { notebookId: string } }>(
    "/cloud/notebooks/:notebookId/share",
    { preHandler: auth },
    async (request, reply) => {
      if (!validClientId(request.params.notebookId))
        return reply.code(400).send({ error: "Identifiant de cahier invalide." });
      try {
        const result = await pool.query<{ mode: NotebookShareMode | null }>(
          "SELECT s.mode FROM notebooks n LEFT JOIN notebook_shares s ON s.notebook_id = n.id WHERE n.client_id = $1 AND n.owner_id = $2",
          [request.params.notebookId, request.user.sub]
        );
        if (!result.rowCount) return reply.code(404).send({ error: "Cahier introuvable." });
        const mode = result.rows[0]!.mode;
        return mode ? { enabled: true, mode } : { enabled: false };
      } catch (error) {
        return databaseFailure(reply, error, app.log.error.bind(app.log));
      }
    }
  );

  app.post<{
    Params: { notebookId: string };
    Body: { mode?: NotebookShareMode };
  }>(
    "/cloud/notebooks/:notebookId/share",
    { preHandler: auth, config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      if (!validClientId(request.params.notebookId))
        return reply.code(400).send({ error: "Identifiant de cahier invalide." });
      const mode = request.body?.mode;
      if (mode !== "read" && mode !== "write")
        return reply.code(400).send({ error: "Mode de partage invalide." });
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await lockNotebook(client, request.params.notebookId);
        const notebook = (
          await client.query<{ id: string }>(
            "SELECT id FROM notebooks WHERE client_id = $1 AND owner_id = $2 FOR UPDATE",
            [request.params.notebookId, request.user.sub]
          )
        ).rows[0];
        if (!notebook) {
          await client.query("ROLLBACK");
          return reply.code(404).send({ error: "Cahier introuvable." });
        }
        const token = createShareToken();
        await client.query(
          "INSERT INTO notebook_shares (notebook_id, token_hash, mode) VALUES ($1, $2, $3) ON CONFLICT (notebook_id) DO UPDATE SET token_hash = EXCLUDED.token_hash, mode = EXCLUDED.mode, updated_at = now()",
          [notebook.id, shareTokenHash(token), mode]
        );
        await client.query("COMMIT");
        return { enabled: true, mode, path: `/public/${token}` };
      } catch (error) {
        await client.query("ROLLBACK");
        return databaseFailure(reply, error, app.log.error.bind(app.log));
      } finally {
        client.release();
      }
    }
  );

  app.delete<{ Params: { notebookId: string } }>(
    "/cloud/notebooks/:notebookId/share",
    { preHandler: auth },
    async (request, reply) => {
      if (!validClientId(request.params.notebookId))
        return reply.code(400).send({ error: "Identifiant de cahier invalide." });
      try {
        const result = await pool.query(
          "DELETE FROM notebook_shares s USING notebooks n WHERE s.notebook_id = n.id AND n.client_id = $1 AND n.owner_id = $2",
          [request.params.notebookId, request.user.sub]
        );
        return result.rowCount
          ? reply.code(204).send()
          : reply.code(404).send({ error: "Cahier introuvable." });
      } catch (error) {
        return databaseFailure(reply, error, app.log.error.bind(app.log));
      }
    }
  );

  app.post<{ Body: { document: unknown } }>(
    "/cloud/notebooks",
    { preHandler: auth },
    async (request, reply) => {
      const document = request.body?.document;
      if (!isCloudDocument(document) || !validClientId(document.notebook.id))
        return reply.code(400).send({ error: "Document invalide." });
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await lockNotebook(client, document.notebook.id);
        const existing = await client.query(
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
        await client.query(
          "DELETE FROM notebook_tombstones WHERE owner_id = $1 AND client_id = $2",
          [request.user.sub, document.notebook.id]
        );
        await client.query("COMMIT");
        return reply.code(201).send({ document, revision: 1 });
      } catch (error) {
        await client.query("ROLLBACK");
        return databaseFailure(reply, error, app.log.error.bind(app.log));
      } finally {
        client.release();
      }
    }
  );

  app.get<{ Params: { notebookId: string } }>(
    "/cloud/notebooks/:notebookId",
    { preHandler: auth },
    async (request, reply) => {
      if (!validClientId(request.params.notebookId))
        return reply.code(400).send({ error: "Identifiant de cahier invalide." });
      try {
        const cloud = await findCloudDocument(pool, request.params.notebookId, request.user.sub);
        if (cloud) return { document: cloud.snapshot, revision: Number(cloud.revision) };
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
      } catch (error) {
        return databaseFailure(reply, error, app.log.error.bind(app.log));
      }
    }
  );

  app.put<{
    Params: { notebookId: string };
    Body: { document: unknown; baseRevision?: number; force?: boolean };
  }>("/cloud/notebooks/:notebookId", { preHandler: auth }, async (request, reply) => {
    const document = request.body?.document;
    if (
      !validClientId(request.params.notebookId) ||
      !isCloudDocument(document) ||
      document.notebook.id !== request.params.notebookId
    )
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
      return databaseFailure(reply, error, app.log.error.bind(app.log));
    } finally {
      client.release();
    }
  });

  app.delete<{ Params: { notebookId: string }; Body: NotebookDeletionRequest }>(
    "/cloud/notebooks/:notebookId",
    { preHandler: auth },
    async (request, reply) => {
      if (!validClientId(request.params.notebookId))
        return reply.code(400).send({ error: "Identifiant de cahier invalide." });
      const client = await pool.connect();
      const objectKeys: string[] = [];
      const force = request.body?.force === true;
      const baseRevision = validRevision(request.body?.baseRevision)
        ? request.body.baseRevision
        : 0;
      const deletedAt = new Date(
        typeof request.body?.deletedAt === "number" && Number.isFinite(request.body.deletedAt)
          ? Math.min(Date.now(), Math.max(0, request.body.deletedAt))
          : Date.now()
      );
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
          objectKeys.push(...assets.rows.map((asset) => asset.object_key));
          for (const key of objectKeys)
            await client.query(
              "INSERT INTO pending_asset_deletions (object_key) VALUES ($1) ON CONFLICT (object_key) DO NOTHING",
              [key]
            );
          await client.query("DELETE FROM notebooks WHERE id = $1", [current.id]);
        }
        await client.query(
          "INSERT INTO notebook_tombstones (id, owner_id, client_id, deleted_at) VALUES ($1, $2, $3, $4) ON CONFLICT (owner_id, client_id) DO UPDATE SET deleted_at = GREATEST(notebook_tombstones.deleted_at, EXCLUDED.deleted_at)",
          [crypto.randomUUID(), request.user.sub, request.params.notebookId, deletedAt]
        );
        await client.query("COMMIT");
        const room = context.sessions.get(request.params.notebookId);
        if (room) {
          for (const socket of room) socket.close(1001);
          context.sessions.delete(request.params.notebookId);
        }
        if (objectKeys.length)
          await drainPendingAssetDeletions(
            pool,
            context.storage,
            context.bucket,
            app.log.warn.bind(app.log),
            objectKeys
          );
        return reply.code(204).send();
      } catch (error) {
        await client.query("ROLLBACK");
        return databaseFailure(reply, error, app.log.error.bind(app.log));
      } finally {
        client.release();
      }
    }
  );

  app.put<{ Params: { notebookId: string; assetId: string }; Body: Buffer }>(
    "/cloud/notebooks/:notebookId/assets/:assetId",
    { preHandler: auth, config: { rateLimit: { max: 60, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      if (!validClientId(request.params.notebookId) || !validClientId(request.params.assetId))
        return reply.code(400).send({ error: "Identifiant d’asset invalide." });
      const cloud = await findCloudDocument(pool, request.params.notebookId, request.user.sub);
      if (!cloud) return reply.code(404).send({ error: "Cahier introuvable." });
      const asset = cloud.snapshot.assets.find((item) => item.id === request.params.assetId);
      if (
        !asset ||
        !Buffer.isBuffer(request.body) ||
        request.body.byteLength !== asset.size ||
        asset.size > maxAssetSize ||
        !mimePattern.test(asset.mimeType)
      )
        return reply.code(400).send({ error: "Asset invalide." });
      const key = `${request.user.sub}/${request.params.notebookId}/${asset.id}`;
      try {
        await ensureBucket(context.storage, context.bucket);
        await context.storage.send(
          new PutObjectCommand({
            Bucket: context.bucket,
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
    { preHandler: auth },
    async (request, reply) => {
      if (!validClientId(request.params.notebookId) || !validClientId(request.params.assetId))
        return reply.code(400).send({ error: "Identifiant d’asset invalide." });
      try {
        const asset = (
          await pool.query<{ object_key: string; mime_type: string }>(
            "SELECT a.object_key, a.mime_type FROM assets a JOIN notebooks n ON n.id = a.notebook_id WHERE n.client_id = $1 AND a.client_id = $2 AND n.owner_id = $3",
            [request.params.notebookId, request.params.assetId, request.user.sub]
          )
        ).rows[0];
        if (!asset) return reply.code(404).send({ error: "Asset introuvable." });
        const object = await context.storage.send(
          new GetObjectCommand({ Bucket: context.bucket, Key: asset.object_key })
        );
        if (!object.Body) return reply.code(404).send({ error: "Asset introuvable." });
        return reply
          .type(asset.mime_type)
          .send(Buffer.from(await object.Body.transformToByteArray()));
      } catch (error) {
        app.log.error(error, "Asset download failed");
        return reply.code(503).send({ error: "Le stockage cloud est indisponible." });
      }
    }
  );

  app.get<{ Params: { token: string } }>("/public/notebooks/:token", async (request, reply) => {
    if (!validShareToken(request.params.token))
      return reply.code(404).send({ error: "Lien de partage invalide." });
    try {
      const result = await pool.query<{
        snapshot: CloudDocument;
        revision: string | number;
        mode: NotebookShareMode;
      }>(
        "SELECT d.snapshot, d.revision, s.mode FROM notebook_shares s JOIN notebooks n ON n.id = s.notebook_id JOIN documents d ON d.notebook_id = n.id WHERE s.token_hash = $1",
        [shareTokenHash(request.params.token)]
      );
      const shared = result.rows[0];
      return shared
        ? { document: shared.snapshot, revision: Number(shared.revision), mode: shared.mode }
        : reply.code(404).send({ error: "Lien de partage introuvable ou désactivé." });
    } catch (error) {
      return databaseFailure(reply, error, app.log.error.bind(app.log));
    }
  });

  app.put<{
    Params: { token: string };
    Body: { document: unknown; baseRevision?: number };
  }>(
    "/public/notebooks/:token",
    { config: { rateLimit: { max: 120, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const document = request.body?.document;
      if (
        !validShareToken(request.params.token) ||
        !isCloudDocument(document) ||
        !validClientId(document.notebook.id)
      )
        return reply.code(400).send({ error: "Document invalide." });
      const tokenHash = shareTokenHash(request.params.token);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const identity = (
          await client.query<{ client_id: string }>(
            "SELECT n.client_id FROM notebook_shares s JOIN notebooks n ON n.id = s.notebook_id WHERE s.token_hash = $1",
            [tokenHash]
          )
        ).rows[0];
        if (!identity) {
          await client.query("ROLLBACK");
          return reply.code(404).send({ error: "Lien de partage introuvable ou désactivé." });
        }
        await lockNotebook(client, identity.client_id);
        const current = (
          await client.query<{
            id: string;
            client_id: string;
            mode: NotebookShareMode;
            snapshot: CloudDocument;
            revision: string | number;
          }>(
            "SELECT n.id, n.client_id, s.mode, d.snapshot, d.revision FROM notebook_shares s JOIN notebooks n ON n.id = s.notebook_id JOIN documents d ON d.notebook_id = n.id WHERE s.token_hash = $1 FOR UPDATE OF n",
            [tokenHash]
          )
        ).rows[0];
        if (!current) {
          await client.query("ROLLBACK");
          return reply.code(404).send({ error: "Lien de partage introuvable ou désactivé." });
        }
        if (current.mode !== "write") {
          await client.query("ROLLBACK");
          return reply.code(403).send({ error: "Ce notebook est partagé en lecture seule." });
        }
        if (document.notebook.id !== current.client_id) {
          await client.query("ROLLBACK");
          return reply
            .code(400)
            .send({ error: "Le document ne correspond pas au notebook partagé." });
        }
        const baseRevision = validRevision(request.body?.baseRevision)
          ? request.body.baseRevision
          : 0;
        if (Number(current.revision) !== baseRevision) {
          await client.query("ROLLBACK");
          return reply.code(409).send({
            error: "Une version plus récente existe dans le notebook partagé.",
            document: current.snapshot,
            revision: Number(current.revision)
          });
        }
        const revision = Number(current.revision) + 1;
        await client.query(
          "UPDATE notebooks SET title = $1, mode = $2, updated_at = now() WHERE id = $3",
          [document.notebook.title, document.notebook.mode, current.id]
        );
        await client.query(
          "UPDATE documents SET snapshot = $1, revision = $2, updated_at = now() WHERE notebook_id = $3",
          [document, revision, current.id]
        );
        await client.query("COMMIT");
        return { document, revision, mode: current.mode };
      } catch (error) {
        await client.query("ROLLBACK");
        return databaseFailure(reply, error, app.log.error.bind(app.log));
      } finally {
        client.release();
      }
    }
  );

  app.put<{ Params: { token: string; assetId: string }; Body: Buffer }>(
    "/public/notebooks/:token/assets/:assetId",
    { config: { rateLimit: { max: 60, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      if (!validShareToken(request.params.token) || !validClientId(request.params.assetId))
        return reply.code(400).send({ error: "Identifiant d’asset invalide." });
      try {
        const shared = (
          await pool.query<{
            notebook_id: string;
            mode: NotebookShareMode;
            snapshot: CloudDocument;
          }>(
            "SELECT n.id AS notebook_id, s.mode, d.snapshot FROM notebook_shares s JOIN notebooks n ON n.id = s.notebook_id JOIN documents d ON d.notebook_id = n.id WHERE s.token_hash = $1",
            [shareTokenHash(request.params.token)]
          )
        ).rows[0];
        if (!shared)
          return reply.code(404).send({ error: "Lien de partage introuvable ou désactivé." });
        if (shared.mode !== "write")
          return reply.code(403).send({ error: "Ce notebook est partagé en lecture seule." });
        const asset = shared.snapshot.assets.find((item) => item.id === request.params.assetId);
        if (
          !asset ||
          !Buffer.isBuffer(request.body) ||
          request.body.byteLength !== asset.size ||
          asset.size > maxAssetSize ||
          !mimePattern.test(asset.mimeType)
        )
          return reply.code(400).send({ error: "Asset invalide." });
        const key = `public/${shared.notebook_id}/${asset.id}`;
        await ensureBucket(context.storage, context.bucket);
        await context.storage.send(
          new PutObjectCommand({
            Bucket: context.bucket,
            Key: key,
            Body: request.body,
            ContentType: asset.mimeType
          })
        );
        await pool.query(
          "INSERT INTO assets (id, notebook_id, client_id, hash, mime_type, size, object_key) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (notebook_id, client_id) DO UPDATE SET hash = EXCLUDED.hash, mime_type = EXCLUDED.mime_type, size = EXCLUDED.size, object_key = EXCLUDED.object_key",
          [
            crypto.randomUUID(),
            shared.notebook_id,
            asset.id,
            asset.hash,
            asset.mimeType,
            asset.size,
            key
          ]
        );
        return reply.code(204).send();
      } catch (error) {
        app.log.error(error, "Public asset upload failed");
        return reply.code(503).send({ error: "Le stockage cloud est indisponible." });
      }
    }
  );

  app.get<{ Params: { token: string; assetId: string } }>(
    "/public/notebooks/:token/assets/:assetId",
    async (request, reply) => {
      if (!validShareToken(request.params.token) || !validClientId(request.params.assetId))
        return reply.code(400).send({ error: "Identifiant d’asset invalide." });
      try {
        const asset = (
          await pool.query<{ object_key: string; mime_type: string }>(
            "SELECT a.object_key, a.mime_type FROM notebook_shares s JOIN notebooks n ON n.id = s.notebook_id JOIN assets a ON a.notebook_id = n.id WHERE s.token_hash = $1 AND a.client_id = $2",
            [shareTokenHash(request.params.token), request.params.assetId]
          )
        ).rows[0];
        if (!asset) return reply.code(404).send({ error: "Asset introuvable." });
        const object = await context.storage.send(
          new GetObjectCommand({ Bucket: context.bucket, Key: asset.object_key })
        );
        if (!object.Body) return reply.code(404).send({ error: "Asset introuvable." });
        return reply
          .type(asset.mime_type)
          .send(Buffer.from(await object.Body.transformToByteArray()));
      } catch (error) {
        app.log.error(error, "Public asset download failed");
        return reply.code(503).send({ error: "Le stockage cloud est indisponible." });
      }
    }
  );
}
