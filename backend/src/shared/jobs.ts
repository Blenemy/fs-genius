export type ProbeJobData = {
  assetId: string;
  userId: string;
  jobId: string;
};

export type ImageJobData = {
  assetId: string;
  userId: string;
};

export type JobCounts = {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
};
