export type JobMetricEvent = {
  queueName: string;
  jobType?: string;
  organizationId?: string;
  correlationId?: string;
  priority?: number;
  status: 'queued' | 'started' | 'completed' | 'failed' | 'rate_limited';
  durationMs?: number;
  error?: string;
  at?: number;
};

export type QueueMetricsSnapshot = {
  queues: Record<
    string,
    {
      queued: number;
      running: number;
      completed: number;
      failed: number;
      avgDurationMs: number;
      rateLimitHits: number;
    }
  >;
  orgs: Record<
    string,
    {
      running: number;
      completed: number;
      failed: number;
      rateLimitHits: number;
    }
  >;
  depthOverTime: Array<{ ts: number; depth: number }>;
  recent: Array<{
    queueName: string;
    jobType?: string;
    organizationId?: string;
    correlationId?: string;
    status: string;
    durationMs?: number;
    at: number;
    error?: string;
  }>;
  totals: {
    queued: number;
    running: number;
    completed: number;
    failed: number;
    rateLimitHits: number;
  };
};

/**
 * In-process metrics for AI/BullMQ jobs. Process-local by design —
 * good enough for single-API-node demos; swap for Redis counters later.
 */
export class JobMetricsRegistry {
  private queues = new Map<
    string,
    {
      queued: number;
      running: number;
      completed: number;
      failed: number;
      totalDurationMs: number;
      rateLimitHits: number;
    }
  >();
  private orgs = new Map<
    string,
    { running: number; completed: number; failed: number; rateLimitHits: number }
  >();
  private depthOverTime: Array<{ ts: number; depth: number }> = [];
  private recent: QueueMetricsSnapshot['recent'] = [];
  private readonly maxRecent = 100;
  private readonly maxDepthSamples = 120;

  private q(name: string) {
    if (!this.queues.has(name)) {
      this.queues.set(name, {
        queued: 0,
        running: 0,
        completed: 0,
        failed: 0,
        totalDurationMs: 0,
        rateLimitHits: 0,
      });
    }
    return this.queues.get(name)!;
  }

  private o(orgId: string) {
    if (!this.orgs.has(orgId)) {
      this.orgs.set(orgId, { running: 0, completed: 0, failed: 0, rateLimitHits: 0 });
    }
    return this.orgs.get(orgId)!;
  }

  record(event: JobMetricEvent) {
    const at = event.at || Date.now();
    const q = this.q(event.queueName);
    const org = event.organizationId ? this.o(event.organizationId) : null;

    switch (event.status) {
      case 'queued':
        q.queued += 1;
        break;
      case 'started':
        q.queued = Math.max(0, q.queued - 1);
        q.running += 1;
        if (org) org.running += 1;
        break;
      case 'completed':
        q.running = Math.max(0, q.running - 1);
        q.completed += 1;
        if (event.durationMs != null) q.totalDurationMs += event.durationMs;
        if (org) {
          org.running = Math.max(0, org.running - 1);
          org.completed += 1;
        }
        break;
      case 'failed':
        q.running = Math.max(0, q.running - 1);
        q.failed += 1;
        if (org) {
          org.running = Math.max(0, org.running - 1);
          org.failed += 1;
        }
        break;
      case 'rate_limited':
        q.rateLimitHits += 1;
        if (org) org.rateLimitHits += 1;
        break;
    }

    this.recent.unshift({
      queueName: event.queueName,
      jobType: event.jobType,
      organizationId: event.organizationId,
      correlationId: event.correlationId,
      status: event.status,
      durationMs: event.durationMs,
      at,
      error: event.error,
    });
    if (this.recent.length > this.maxRecent) this.recent.length = this.maxRecent;

    const depth = [...this.queues.values()].reduce((n, row) => n + row.queued + row.running, 0);
    this.depthOverTime.push({ ts: at, depth });
    if (this.depthOverTime.length > this.maxDepthSamples) {
      this.depthOverTime.splice(0, this.depthOverTime.length - this.maxDepthSamples);
    }
  }

  getOrgRunning(organizationId: string): number {
    return this.o(organizationId).running;
  }

  snapshot(): QueueMetricsSnapshot {
    const queues: QueueMetricsSnapshot['queues'] = {};
    let queued = 0;
    let running = 0;
    let completed = 0;
    let failed = 0;
    let rateLimitHits = 0;

    for (const [name, row] of this.queues) {
      queues[name] = {
        queued: row.queued,
        running: row.running,
        completed: row.completed,
        failed: row.failed,
        avgDurationMs: row.completed ? Math.round(row.totalDurationMs / row.completed) : 0,
        rateLimitHits: row.rateLimitHits,
      };
      queued += row.queued;
      running += row.running;
      completed += row.completed;
      failed += row.failed;
      rateLimitHits += row.rateLimitHits;
    }

    const orgs: QueueMetricsSnapshot['orgs'] = {};
    for (const [id, row] of this.orgs) {
      orgs[id] = { ...row };
    }

    return {
      queues,
      orgs,
      depthOverTime: [...this.depthOverTime],
      recent: [...this.recent],
      totals: { queued, running, completed, failed, rateLimitHits },
    };
  }

  /** Test helper */
  reset() {
    this.queues.clear();
    this.orgs.clear();
    this.depthOverTime = [];
    this.recent = [];
  }
}

export const jobMetrics = new JobMetricsRegistry();
