import { prisma } from "../lib/prisma.js";

export async function markJobRunning(jobId: string, attemptsMade: number) {
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "RUNNING",
      attempts: attemptsMade + 1,
      startedAt: new Date(),
      error: null,
    },
  });
}

export async function markJobDone(jobId: string) {
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "DONE",
      progress: 100,
      finishedAt: new Date(),
      error: null,
    },
  });
}

export async function markJobFailed(jobId: string, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "FAILED",
      error: message.slice(0, 4000),
      finishedAt: new Date(),
    },
  });
}

export async function markAssetProcessing(assetId: string) {
  await prisma.asset.update({
    where: { id: assetId },
    data: { status: "PROCESSING" },
  });
}

export async function markAssetReady(assetId: string) {
  await prisma.asset.update({
    where: { id: assetId },
    data: { status: "READY" },
  });
}

export async function markAssetFailed(assetId: string) {
  await prisma.asset.update({
    where: { id: assetId },
    data: { status: "FAILED" },
  });
}

export function isDuplicateJobId(err: unknown): boolean {
  return err instanceof Error && /already exists/i.test(err.message);
}

export function isUnreadableMedia(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("unsupported") ||
    msg.includes("corrupt") ||
    msg.includes("limitinputpixels") ||
    msg.includes("too large") ||
    msg.includes("input file is missing") ||
    msg.includes("vips") ||
    msg.includes("unreadable video") ||
    msg.includes("ffmpeg failed") ||
    msg.includes("no video stream") ||
    msg.includes("moov atom")
  );
}

export function isFatalJobError(
  err: unknown,
  attemptsMade: number,
  attempts: number | undefined,
): boolean {
  return (
    isUnreadableMedia(err) ||
    attemptsMade + 1 >= (attempts ?? 1)
  );
}
