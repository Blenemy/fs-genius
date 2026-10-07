import { getRedis } from "./redis.js";
import { childLogger } from "./logger.js";

const log = childLogger({ lib: "storage-ops" });

/** Counter outlives its month so the previous total stays readable for a while. */
const KEY_TTL_SEC = 40 * 24 * 60 * 60;

/** R2 bills writes (Class A) per calendar month in UTC. */
export function writeOpsKey(now = new Date()): string {
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `s3ops:write:${now.getUTCFullYear()}-${month}`;
}

/** Best effort: a lost increment must never fail the upload that caused it. */
export function countWriteOps(count = 1): void {
  if (count <= 0) return;
  const key = writeOpsKey();
  const redis = getRedis();
  void redis
    .multi()
    .incrby(key, count)
    .expire(key, KEY_TTL_SEC)
    .exec()
    .catch((err: unknown) => {
      log.warn({ err, count }, "write op count lost");
    });
}

export async function readWriteOps(): Promise<number> {
  const raw = await getRedis().get(writeOpsKey());
  const value = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(value) ? value : 0;
}
