import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { jobMetrics } from './job-metrics';

type JobHandler = (data: unknown) => Promise<void> | void;

export type EnqueueOptions = {
  jobId?: string;
  /** Await handler when using in-process fallback (and for interactive UX) */
  awaitInline?: boolean;
  /**
   * BullMQ priority: lower number = higher priority.
   * Interactive single-product work should use 1; bulk batch uses 10+.
   */
  priority?: number;
  organizationId?: string;
  correlationId?: string;
  jobType?: string;
  /** Skip per-org concurrency gate (internal / already-accounted jobs) */
  bypassOrgLimit?: boolean;
};

const DEFAULT_ORG_CONCURRENCY = Number(process.env.AI_ORG_JOB_CONCURRENCY || 2);
const INTERACTIVE_PRIORITY = 1;
const BATCH_PRIORITY = 10;

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private handlers = new Map<string, JobHandler>();
  private bullConnection: any = null;
  private queues = new Map<string, any>();
  private workers = new Map<string, any>();
  private useInProcess = true;
  /** In-process semaphore: orgId -> running count */
  private orgRunning = new Map<string, number>();
  private waiters: Array<() => void> = [];

  constructor() {
    void this.initRedis();
  }

  static priorities = { interactive: INTERACTIVE_PRIORITY, batch: BATCH_PRIORITY };

  private async initRedis() {
    const url = process.env.REDIS_URL;
    if (!url) {
      this.logger.warn('REDIS_URL not set — using in-process queue fallback');
      return;
    }
    try {
      const { Queue, Worker } = await import('bullmq');
      const IORedis = (await import('ioredis')).default;
      this.bullConnection = new IORedis(url, { maxRetriesPerRequest: null });
      await this.bullConnection.ping();
      this.useInProcess = false;
      (this as any).Queue = Queue;
      (this as any).Worker = Worker;
      this.logger.log('BullMQ connected via REDIS_URL');
    } catch (err) {
      this.logger.warn(`Redis/BullMQ unavailable — in-process fallback: ${(err as Error).message}`);
      this.useInProcess = true;
      if (this.bullConnection) {
        try {
          await this.bullConnection.quit();
        } catch {
          /* ignore */
        }
        this.bullConnection = null;
      }
    }
  }

  registerHandler(queueName: string, handler: JobHandler) {
    this.handlers.set(queueName, handler);
    if (!this.useInProcess && this.bullConnection && (this as any).Worker) {
      if (!this.workers.has(queueName)) {
        const worker = new (this as any).Worker(
          queueName,
          async (job: { id?: string; data: any; opts?: { priority?: number } }) => {
            await this.executeTracked(queueName, job.data, {
              organizationId: job.data?.organizationId,
              correlationId: job.data?.correlationId,
              jobType: job.data?.jobType || queueName,
              priority: job.opts?.priority,
              bypassOrgLimit: Boolean(job.data?._bypassOrgLimit),
            });
          },
          {
            connection: this.bullConnection,
            concurrency: Number(process.env.AI_WORKER_CONCURRENCY || 4),
          },
        );
        worker.on('failed', (job: any, err: Error) => {
          this.logger.error(
            JSON.stringify({
              msg: 'job_failed',
              queue: queueName,
              jobId: job?.id,
              correlationId: job?.data?.correlationId,
              organizationId: job?.data?.organizationId,
              error: err.message,
            }),
          );
        });
        this.workers.set(queueName, worker);
      }
    }
  }

  private async acquireOrgSlot(organizationId: string | undefined, bypass?: boolean) {
    if (!organizationId || bypass) return;
    const limit = DEFAULT_ORG_CONCURRENCY;
    for (;;) {
      const running = this.orgRunning.get(organizationId) || 0;
      const metricsRunning = jobMetrics.getOrgRunning(organizationId);
      const effective = Math.max(running, metricsRunning);
      if (effective < limit) {
        this.orgRunning.set(organizationId, running + 1);
        return;
      }
      jobMetrics.record({
        queueName: '_rate_limit',
        organizationId,
        status: 'rate_limited',
      });
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
        setTimeout(resolve, 50);
      });
    }
  }

  private releaseOrgSlot(organizationId: string | undefined, bypass?: boolean) {
    if (!organizationId || bypass) return;
    const running = this.orgRunning.get(organizationId) || 0;
    this.orgRunning.set(organizationId, Math.max(0, running - 1));
    const waiters = this.waiters.splice(0, this.waiters.length);
    for (const w of waiters) w();
  }

  private async executeTracked(
    queueName: string,
    data: unknown,
    meta: {
      organizationId?: string;
      correlationId?: string;
      jobType?: string;
      priority?: number;
      bypassOrgLimit?: boolean;
    },
  ) {
    const handler = this.handlers.get(queueName);
    const started = Date.now();
    await this.acquireOrgSlot(meta.organizationId, meta.bypassOrgLimit);
    jobMetrics.record({
      queueName,
      jobType: meta.jobType,
      organizationId: meta.organizationId,
      correlationId: meta.correlationId,
      priority: meta.priority,
      status: 'started',
    });
    this.logger.log(
      JSON.stringify({
        msg: 'job_started',
        queue: queueName,
        jobType: meta.jobType,
        correlationId: meta.correlationId,
        organizationId: meta.organizationId,
        priority: meta.priority,
      }),
    );
    try {
      await Promise.resolve(handler?.(data));
      const durationMs = Date.now() - started;
      jobMetrics.record({
        queueName,
        jobType: meta.jobType,
        organizationId: meta.organizationId,
        correlationId: meta.correlationId,
        status: 'completed',
        durationMs,
      });
      this.logger.log(
        JSON.stringify({
          msg: 'job_completed',
          queue: queueName,
          jobType: meta.jobType,
          correlationId: meta.correlationId,
          organizationId: meta.organizationId,
          durationMs,
        }),
      );
    } catch (err) {
      const durationMs = Date.now() - started;
      jobMetrics.record({
        queueName,
        jobType: meta.jobType,
        organizationId: meta.organizationId,
        correlationId: meta.correlationId,
        status: 'failed',
        durationMs,
        error: (err as Error).message,
      });
      this.logger.error(
        JSON.stringify({
          msg: 'job_failed',
          queue: queueName,
          jobType: meta.jobType,
          correlationId: meta.correlationId,
          organizationId: meta.organizationId,
          error: (err as Error).message,
          durationMs,
        }),
      );
      throw err;
    } finally {
      this.releaseOrgSlot(meta.organizationId, meta.bypassOrgLimit);
    }
  }

  async enqueue(queueName: string, data: unknown, opts?: EnqueueOptions) {
    const handler = this.handlers.get(queueName);
    const correlationId =
      opts?.correlationId ||
      (data && typeof data === 'object' && (data as any).correlationId) ||
      randomUUID();
    const organizationId =
      opts?.organizationId ||
      (data && typeof data === 'object' ? (data as any).organizationId : undefined);
    const jobType = opts?.jobType || queueName;
    const priority = opts?.priority ?? BATCH_PRIORITY;

    const payload =
      data && typeof data === 'object'
        ? {
            ...(data as object),
            correlationId,
            organizationId,
            jobType,
            _bypassOrgLimit: opts?.bypassOrgLimit,
          }
        : data;

    jobMetrics.record({
      queueName,
      jobType,
      organizationId,
      correlationId,
      priority,
      status: 'queued',
    });

    const runTracked = () =>
      this.executeTracked(queueName, payload, {
        organizationId,
        correlationId,
        jobType,
        priority,
        bypassOrgLimit: opts?.bypassOrgLimit,
      });

    // Interactive / awaitInline: always execute now (works with or without BullMQ).
    if (opts?.awaitInline) {
      await runTracked();
      return {
        id: opts?.jobId || `inline-${Date.now()}`,
        mode: (this.useInProcess || !this.bullConnection
          ? 'in-process'
          : 'inline') as 'in-process' | 'inline',
        correlationId,
        priority,
      };
    }

    if (this.useInProcess || !this.bullConnection) {
      setImmediate(() => {
        runTracked().catch((err) =>
          this.logger.error(`In-process job ${queueName} failed: ${(err as Error).message}`),
        );
      });
      return {
        id: opts?.jobId || `local-${Date.now()}`,
        mode: 'in-process' as const,
        correlationId,
        priority,
      };
    }

    let queue = this.queues.get(queueName);
    if (!queue) {
      queue = new (this as any).Queue(queueName, { connection: this.bullConnection });
      this.queues.set(queueName, queue);
    }
    const job = await queue.add(queueName, payload, {
      jobId: opts?.jobId,
      priority,
      removeOnComplete: 1000,
      removeOnFail: 1000,
    });

    return {
      id: String(job.id),
      mode: 'bullmq' as const,
      correlationId,
      priority,
    };
  }

  getMetrics() {
    return jobMetrics.snapshot();
  }

  async getQueueDepths(): Promise<Record<string, number>> {
    const depths: Record<string, number> = {};
    if (this.useInProcess || !this.bullConnection) {
      const snap = jobMetrics.snapshot();
      for (const [name, row] of Object.entries(snap.queues)) {
        depths[name] = row.queued + row.running;
      }
      return depths;
    }
    for (const [name, queue] of this.queues) {
      const counts = await queue.getJobCounts('wait', 'active', 'delayed');
      depths[name] = (counts.wait || 0) + (counts.active || 0) + (counts.delayed || 0);
    }
    return depths;
  }

  async onModuleDestroy() {
    for (const w of this.workers.values()) {
      try {
        await w.close();
      } catch {
        /* ignore */
      }
    }
    for (const q of this.queues.values()) {
      try {
        await q.close();
      } catch {
        /* ignore */
      }
    }
    if (this.bullConnection) {
      try {
        await this.bullConnection.quit();
      } catch {
        /* ignore */
      }
    }
  }
}

export function newCorrelationId() {
  return randomUUID();
}
