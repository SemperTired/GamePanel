import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";
import { DataStore } from "../data.module.js";

const redisConnection = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT || 6379),
  password: process.env.REDIS_PASSWORD || undefined,
};

@Injectable()
export class ProvisioningService implements OnModuleDestroy {
  private queue: Queue | null = null;

  constructor(private readonly data: DataStore) {
    if (process.env.PROVISIONING_QUEUE !== "memory") {
      this.queue = new Queue("provisioning", {
        connection: redisConnection,
        defaultJobOptions: {
          attempts: Number(process.env.PROVISIONING_JOB_ATTEMPTS || 3),
          backoff: { type: "exponential", delay: 5000 },
          removeOnComplete: { age: 86400, count: 1000 },
          removeOnFail: { age: 604800, count: 5000 },
        },
      });
    }
  }

  async enqueue(serviceId: string, action = "install") {
    const now = new Date().toISOString();
    const record = { id: crypto.randomUUID(), service_id: serviceId, action, status: "queued", queue: "memory", created_at: now, updated_at: now };
    try {
      if (this.queue) {
        const job = await this.queue.add(action, { serviceId, action, requestId: record.id });
        record.queue = "redis";
        record.status = "queued";
        Object.assign(record, { bullmq_job_id: String(job.id) });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (process.env.REDIS_REQUIRED === "true" || process.env.NODE_ENV === "production") throw error;
      Object.assign(record, { queue: "memory", warning: `Redis unavailable, job kept in local memory: ${message}` });
    }
    await this.data.saveProvisioningJob(record);
    return record;
  }

  list() {
    return [...this.data.provisioningJobs.values()];
  }

  async onModuleDestroy() {
    await this.queue?.close();
  }
}
