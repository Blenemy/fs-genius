import type { JobCancelStore } from "../lib/job-cancel.js";
import {
  isJobCanceledError,
  isWorkerShutdownError,
  JobCanceledError,
  WorkerShutdownError,
} from "../shared/cancel.js";
import { markCanceledForAsset, markEditCanceled } from "./media-status.js";
import type { MediaEventsPublisher } from "../lib/media-events-publisher.js";

export function startJobAbort(
  cancel: JobCancelStore,
  jobId: string,
  assetId: string,
  shutdown?: AbortSignal,
): { signal: AbortSignal; stop: () => void } {
  const controller = new AbortController();
  const stopWatch = cancel.watch(jobId, controller, assetId);
  const onShutdown = () => {
    if (!controller.signal.aborted) controller.abort();
  };
  shutdown?.addEventListener("abort", onShutdown);
  if (shutdown?.aborted) onShutdown();

  return {
    signal: controller.signal,
    stop: () => {
      stopWatch();
      shutdown?.removeEventListener("abort", onShutdown);
    },
  };
}

export async function persistCanceled(
  assetId: string,
  userId: string,
  mediaEvents: MediaEventsPublisher,
): Promise<void> {
  await markCanceledForAsset(assetId);
  await mediaEvents.publish({
    userId,
    assetId,
    status: "CANCELED",
  });
}

export async function persistEditCanceled(
  assetId: string,
  userId: string,
  mediaEvents: MediaEventsPublisher,
): Promise<void> {
  await markEditCanceled(assetId);
  await mediaEvents.publish({
    userId,
    assetId,
    status: "READY",
  });
}

export async function resolveAbort(
  err: unknown,
  cancel: JobCancelStore,
  jobId: string,
  assetId: string,
  shutdown?: AbortSignal,
): Promise<"canceled" | "shutdown" | "other"> {
  if (isWorkerShutdownError(err) || shutdown?.aborted) {
    if (await cancel.isCanceled(jobId, assetId)) return "canceled";
    return "shutdown";
  }
  if (isJobCanceledError(err) || (await cancel.isCanceled(jobId, assetId))) {
    return "canceled";
  }
  return "other";
}

export { isJobCanceledError, WorkerShutdownError, JobCanceledError };
