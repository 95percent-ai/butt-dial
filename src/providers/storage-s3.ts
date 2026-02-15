/**
 * S3 storage adapter — uses AWS S3 REST API.
 * Implements IStorageProvider for cloud file storage.
 * Zero external dependencies — uses AWS Signature V4 via Node.js crypto.
 */

import { createHmac, createHash } from "crypto";
import { logger } from "../lib/logger.js";
import type { IStorageProvider } from "./interfaces.js";

interface S3Config {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string; // Optional custom endpoint (for R2, MinIO, etc.)
  publicUrl?: string; // Public URL prefix for getUrl()
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function getSignatureKey(secretKey: string, date: string, region: string, service: string): Buffer {
  const kDate = hmacSha256(`AWS4${secretKey}`, date);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}

function signRequest(
  method: string,
  path: string,
  headers: Record<string, string>,
  body: Buffer | string,
  cfg: S3Config
): Record<string, string> {
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z/, "Z");

  headers["x-amz-date"] = amzDate;
  headers["x-amz-content-sha256"] = sha256(body);

  const signedHeaders = Object.keys(headers).sort().join(";").toLowerCase();
  const canonicalHeaders = Object.entries(headers)
    .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map(([k, v]) => `${k.toLowerCase()}:${v.trim()}\n`)
    .join("");

  const canonicalRequest = [
    method,
    path,
    "", // query string
    canonicalHeaders,
    signedHeaders,
    sha256(body),
  ].join("\n");

  const credentialScope = `${dateStamp}/${cfg.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");

  const signingKey = getSignatureKey(cfg.secretAccessKey, dateStamp, cfg.region, "s3");
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");

  headers["Authorization"] = `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return headers;
}

export function createS3StorageProvider(cfg: S3Config): IStorageProvider {
  const endpoint = cfg.endpoint || `https://${cfg.bucket}.s3.${cfg.region}.amazonaws.com`;

  logger.info("s3_provider_created", { bucket: cfg.bucket, region: cfg.region });

  return {
    async upload(key: string, data: Buffer, contentType?: string): Promise<string> {
      const path = `/${key}`;
      const headers: Record<string, string> = {
        Host: new URL(endpoint).host,
        "Content-Type": contentType || "application/octet-stream",
        "Content-Length": String(data.length),
      };

      const signed = signRequest("PUT", path, headers, data, cfg);

      const resp = await fetch(`${endpoint}${path}`, {
        method: "PUT",
        headers: signed,
        body: data,
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`S3 upload failed (HTTP ${resp.status}): ${errText.slice(0, 200)}`);
      }

      const url = cfg.publicUrl ? `${cfg.publicUrl}/${key}` : `${endpoint}/${key}`;
      logger.info("s3_upload_success", { key, size: data.length });
      return url;
    },

    async download(key: string): Promise<Buffer> {
      const path = `/${key}`;
      const headers: Record<string, string> = {
        Host: new URL(endpoint).host,
      };

      const signed = signRequest("GET", path, headers, "", cfg);

      const resp = await fetch(`${endpoint}${path}`, {
        method: "GET",
        headers: signed,
      });

      if (!resp.ok) {
        throw new Error(`S3 download failed (HTTP ${resp.status})`);
      }

      const buf = Buffer.from(await resp.arrayBuffer());
      logger.info("s3_download_success", { key, size: buf.length });
      return buf;
    },

    async delete(key: string): Promise<void> {
      const path = `/${key}`;
      const headers: Record<string, string> = {
        Host: new URL(endpoint).host,
      };

      const signed = signRequest("DELETE", path, headers, "", cfg);

      const resp = await fetch(`${endpoint}${path}`, {
        method: "DELETE",
        headers: signed,
      });

      if (!resp.ok) {
        throw new Error(`S3 delete failed (HTTP ${resp.status})`);
      }

      logger.info("s3_delete_success", { key });
    },

    getUrl(key: string): string {
      return cfg.publicUrl ? `${cfg.publicUrl}/${key}` : `${endpoint}/${key}`;
    },
  };
}
