import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import sharp from "sharp";
import { getObjectToFile } from "../../lib/s3.js";

/** sendPhoto cap is 10 MB; stills we make are far smaller. */
export async function jpegFromStorageKey(storageKey: string): Promise<Buffer> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "tg-jpeg-"));
  try {
    const sourcePath = path.join(tmpDir, "source");
    await getObjectToFile(storageKey, sourcePath);
    return await sharp(sourcePath).jpeg({ quality: 80 }).toBuffer();
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
