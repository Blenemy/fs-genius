export interface ReportResponse {
  cached: boolean;
  cacheKey: string;
  tookMs: number;
  total: number;
  limit: number;
  offset: number;
  rows: unknown[];
}

export interface ReportRun {
  id: number;
  cached: boolean;
  tookMs: number;
  wallMs: number;
}
