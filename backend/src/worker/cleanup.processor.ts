import type { Job } from "bullmq";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { childLogger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";
import { isS3Configured, listObjectKeys, deleteObject } from "../lib/s3.js";
import type { CleanupJobData } from "../shared/jobs.js";
import { purgeAsset } from "../modules/cleanup/purge.js";
import {
  DRAFT_MAX_AGE_MS,
  TMP_DIR_PREFIXES,
  TMP_MAX_AGE_MS,
} from "../modules/quota/limits.js";

export class CleanupProcessor {
  private readonly log = childLogger({ processor: "cleanup" });

  async process(_job: Job<CleanupJobData>): Promise<void> {
    const drafts = await this.purgeDrafts();
    const expired = await this.purgeExpired();
    const orphans = await this.purgeOrphans();
    const tmp = await this.purgeTmp();
    this.log.info({ drafts, expired, orphans, tmp }, "cleanup tick");
  }

  private async purgeDrafts(): Promise<number> {
    const cutoff = new Date(Date.now() - DRAFT_MAX_AGE_MS);
    const rows = await prisma.asset.findMany({
      where: { status: "PENDING", createdAt: { lt: cutoff } },
      select: { id: true },
    });
    for (const row of rows) {
      try {
        await purgeAsset(prisma, row.id);
      } catch (err) {
        this.log.warn({ err, assetId: row.id }, "draft purge failed");
      }
    }
    return rows.length;
  }

  private async purgeExpired(): Promise<number> {
    const rows = await prisma.asset.findMany({
      where: {
        expiresAt: { lt: new Date() },
        status: { not: "PENDING" },
      },
      select: { id: true },
    });
    for (const row of rows) {
      try {
        await purgeAsset(prisma, row.id);
      } catch (err) {
        this.log.warn({ err, assetId: row.id }, "expired purge failed");
      }
    }
    return rows.length;
  }

  private async purgeOrphans(): Promise<number> {
    if (!isS3Configured()) return 0;

    const [assets, derivs] = await Promise.all([
      prisma.asset.findMany({ select: { storageKey: true } }),
      prisma.derivative.findMany({ select: { storageKey: true } }),
    ]);
    const known = new Set([
      ...assets.map((row) => row.storageKey),
      ...derivs.map((row) => row.storageKey),
    ]);

    let keys: string[];
    try {
      keys = await listObjectKeys("u/");
    } catch (err) {
      this.log.warn({ err }, "orphan list failed");
      return 0;
    }

    let removed = 0;
    for (const key of keys) {
      if (known.has(key)) continue;
      try {
        await deleteObject(key);
        removed += 1;
      } catch (err) {
        this.log.warn({ err, key }, "orphan delete failed");
      }
    }
    return removed;
  }

  private async purgeTmp(): Promise<number> {
    const root = os.tmpdir();
    let names: string[];
    try {
      names = await fs.readdir(root);
    } catch {
      return 0;
    }

    const cutoff = Date.now() - TMP_MAX_AGE_MS;
    let removed = 0;
    for (const name of names) {
      if (!TMP_DIR_PREFIXES.some((prefix) => name.startsWith(prefix))) {
        continue;
      }
      const full = path.join(root, name);
      try {
        const stat = await fs.stat(full);
        if (stat.mtimeMs > cutoff) continue;
        await fs.rm(full, { recursive: true, force: true });
        removed += 1;
      } catch (err) {
        this.log.warn({ err, path: full }, "tmp purge failed");
      }
    }
    return removed;
  }
}
