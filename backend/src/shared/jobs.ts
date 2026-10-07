import type { EditJobPayload } from "./edits.js";

export type ProbeJobData = {
  assetId: string;
  userId: string;
  jobId: string;
};

export type ImageJobData = {
  assetId: string;
  userId: string;
  jobId: string;
  edit?: EditJobPayload;
};

export type VideoJobData = {
  assetId: string;
  userId: string;
  jobId: string;
  edit?: EditJobPayload;
};

export type NotifyJobData = {
  assetId: string;
  userId: string;
  status: "READY" | "FAILED";
  error?: string;
  photoSent?: boolean;
  fileSent?: boolean;
};

export type CleanupJobData = Record<string, never>;

export type JobCounts = {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
};
