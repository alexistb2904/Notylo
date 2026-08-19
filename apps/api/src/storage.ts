import {
  CreateBucketCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  S3Client
} from "@aws-sdk/client-s3";
import type { Pool } from "pg";

export function createStorage(): S3Client {
  return new S3Client({
    endpoint: required("MINIO_ENDPOINT"),
    forcePathStyle: true,
    region: "eu-west-3",
    credentials: {
      accessKeyId: required("MINIO_ACCESS_KEY"),
      secretAccessKey: required("MINIO_SECRET_KEY")
    }
  });
}

export async function ensureBucket(storage: S3Client, bucket: string): Promise<void> {
  try {
    await storage.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await storage.send(new CreateBucketCommand({ Bucket: bucket }));
  }
}

export async function drainPendingAssetDeletions(
  pool: Pool,
  storage: S3Client,
  bucket: string,
  log: (error: unknown, message: string) => void,
  objectKeys?: readonly string[]
): Promise<void> {
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
      log(error, "Deferred asset deletion failed");
    }
  }
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
