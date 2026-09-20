export type AssetStatus =
  | 'PENDING'
  | 'UPLOADED'
  | 'PROCESSING'
  | 'READY'
  | 'FAILED';

export interface Asset {
  id: string;
  originalName: string;
  contentType: string;
  status: AssetStatus;
  url: string;
  createdAt: string;
}
