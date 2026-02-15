/**
 * Cloudflare R2 storage adapter — S3-compatible object storage.
 * Implements IStorageProvider using the S3 adapter with R2 endpoint.
 *
 * R2 is S3-compatible, so we reuse the S3 adapter with custom endpoint.
 */

import { logger } from "../lib/logger.js";
import { createS3StorageProvider } from "./storage-s3.js";
import type { IStorageProvider } from "./interfaces.js";

interface R2Config {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicUrl?: string;
}

export function createR2StorageProvider(cfg: R2Config): IStorageProvider {
  logger.info("r2_provider_created", { accountId: cfg.accountId, bucket: cfg.bucket });

  return createS3StorageProvider({
    bucket: cfg.bucket,
    region: "auto",
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com/${cfg.bucket}`,
    publicUrl: cfg.publicUrl,
  });
}
