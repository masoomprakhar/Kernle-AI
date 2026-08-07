import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

type JobHandler = (data: unknown) => Promise<void> | void;

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private handlers = new Map<string, JobHandler>();
  private bullConnection: any = null;
  private queues = new Map<string, any>();
  private workers = new Map<string, any>();
  private useInProcess = true;

  constructor() {
    void this.initRedis();
  }

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
          async (job: { data: unknown }) => {
            const h = this.handlers.get(queueName);
            if (h) await h(job.data);
          },
          { connection: this.bullConnection },
        );
        worker.on('failed', (job: any, err: Error) => {
          this.logger.error(`Job ${queueName}/${job?.id} failed: ${err.message}`);
        });
        this.workers.set(queueName, worker);
      }
    }
  }

  async enqueue(queueName: string, data: unknown, opts?: { jobId?: string }) {
    const handler = this.handlers.get(queueName);
    if (this.useInProcess || !this.bullConnection) {
      setImmediate(() => {
        Promise.resolve(handler?.(data)).catch((err) =>
          this.logger.error(`In-process job ${queueName} failed: ${(err as Error).message}`),
        );
      });
      return { id: opts?.jobId || `local-${Date.now()}`, mode: 'in-process' as const };
    }

    let queue = this.queues.get(queueName);
    if (!queue) {
      queue = new (this as any).Queue(queueName, { connection: this.bullConnection });
      this.queues.set(queueName, queue);
    }
    const job = await queue.add(queueName, data, { jobId: opts?.jobId });
    return { id: String(job.id), mode: 'bullmq' as const };
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
