import type { DeliveryFormatRow } from './delivery-format-types';

export type BatchJobSummary = {
  jobId: string;
  organizationId: string;
  source: 'sample1000' | 'seed';
  createdAt: string;
  rowCount: number;
  needsReviewCount: number;
  familyCounts: Record<string, number>;
  rows: DeliveryFormatRow[];
  skus: string[];
};

const jobsByOrg = new Map<string, BatchJobSummary>();

export function saveBatchJob(job: BatchJobSummary) {
  jobsByOrg.set(job.organizationId, job);
}

export function getBatchJob(organizationId: string): BatchJobSummary | null {
  return jobsByOrg.get(organizationId) || null;
}
