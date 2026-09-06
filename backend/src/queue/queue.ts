import { Queue } from "bullmq";
import { redisConnection } from "../db/redis";
import { env } from "../config/env";

export const EMAIL_QUEUE_NAME = "email-send-queue";

export const emailQueue = new Queue(EMAIL_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { age: 3600 * 24 * 7 }, // keep 7 days for dashboard visibility
    removeOnFail: { age: 3600 * 24 * 30 },
  },
});

export interface EmailJobData {
  emailId: string;
}

/**
 * Enqueues a delayed job for a single email row.
 *
 * Idempotency: we use the email's own DB id as the BullMQ jobId. BullMQ
 * refuses to create a second job with the same jobId while one already
 * exists/is active, so calling this twice for the same email (e.g. after
 * a server restart replays a "pending" row) is a safe no-op rather than
 * a duplicate send.
 */
export async function enqueueEmailJob(emailId: string, scheduledFor: Date): Promise<string> {
  const delay = Math.max(0, scheduledFor.getTime() - Date.now());

  const job = await emailQueue.add(
    "send-email",
    { emailId } satisfies EmailJobData,
    {
      jobId: emailId,
      delay,
    }
  );

  return job.id as string;
}

/** Re-enqueues a job into the next hour window when a rate limit is hit. */
export async function rescheduleForNextWindow(emailId: string, msUntilNextWindow: number): Promise<void> {
  // Remove any existing job with this id first (it's the one currently
  // executing / about to fail the rate check) then re-add with a fresh
  // delay. Because jobId === emailId, this preserves idempotency.
  const existing = await emailQueue.getJob(emailId);
  if (existing) {
    await existing.remove();
  }
  await emailQueue.add(
    "send-email",
    { emailId } satisfies EmailJobData,
    {
      jobId: `${emailId}:${Date.now()}`, // new id required since old one is "used"
      delay: msUntilNextWindow + 1000,
    }
  );
}

export const workerConcurrency = env.rateLimit.workerConcurrency;
