/**
 * Local filesystem storage adapter — saves files to a storage/ directory
 * and serves them via Express static route at /storage/{key}.
 */

import fs from "fs";
import path from "path";
import { logger } from "../lib/logger.js";
import { config } from "../lib/config.js";
import type { IStorageProvider } from "./interfaces.js";

const STORAGE_DIR = path.resolve("storage");

function ensureDir(): void {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
    logger.info("storage_dir_created", { path: STORAGE_DIR });
  }
}

export function createLocalStorageProvider(): IStorageProvider {
  return {
    async upload(key: string, data: Buffer, _contentType?: string): Promise<string> {
      ensureDir();
      const filePath = path.join(STORAGE_DIR, key);
      fs.writeFileSync(filePath, data);

      const url = this.getUrl(key);
      logger.info("storage_uploaded", { key, bytes: data.length, url });
      return url;
    },

    async download(key: string): Promise<Buffer> {
      const filePath = path.join(STORAGE_DIR, key);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Storage file not found: ${key}`);
      }
      return fs.readFileSync(filePath);
    },

    async delete(key: string): Promise<void> {
      const filePath = path.join(STORAGE_DIR, key);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.info("storage_deleted", { key });
      }
    },

    getUrl(key: string): string {
      return `${config.webhookBaseUrl}/storage/${key}`;
    },
  };
}
