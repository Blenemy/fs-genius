export const CANCEL_KEY_PREFIX = "cancel:";
export const CANCEL_TTL_SEC = 2 * 60 * 60;

export function cancelKey(jobId: string): string {
  return `${CANCEL_KEY_PREFIX}${jobId}`;
}

export function assetCancelKey(assetId: string): string {
  return `${CANCEL_KEY_PREFIX}asset:${assetId}`;
}

export class JobCanceledError extends Error {
  constructor(message = "Job canceled") {
    super(message);
    this.name = "JobCanceledError";
  }
}

export class WorkerShutdownError extends Error {
  constructor(message = "Worker shutting down") {
    super(message);
    this.name = "WorkerShutdownError";
  }
}

export function isJobCanceledError(err: unknown): boolean {
  return err instanceof JobCanceledError || (err instanceof Error && err.name === "JobCanceledError");
}

export function isWorkerShutdownError(err: unknown): boolean {
  return (
    err instanceof WorkerShutdownError ||
    (err instanceof Error && err.name === "WorkerShutdownError")
  );
}
