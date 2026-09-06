import { Worker, Job } from "bullmq";
import { redisConnection } from "../db/redis";
import { prisma } from "../db/prisma";
import { EMAIL_QUEUE_NAME, EmailJobData, workerConcurrency, rescheduleForNextWindow } from "./queue";
import { tryConsumeRateLimit, minDelayMs } from "../services/rateLimiter";
import { sendMail } from "../services/mailer";
import { indexEmail } from "../services/search";
import { notifyRateLimitHit } from "../services/slack";
import { ensureEmailIndex } from "../services/search";

ensureEmailIndex().catch((err) => console.error("[worker] failed to ensure ES index", err));

/**
 * Simple in-process spacing guard: BullMQ's own `limiter` option throttles
 * *global* throughput for the whole queue, which is exactly the "minimum
 * delay between individual sends" requirement. We still keep a defensive
 * per-process timestamp check in case concurrency > 1 lets two jobs start
 * within the same tick.
 */
let lastSendAt = 0;
async function enforceMinDelay(): Promise<void> {
  const now = Date.now();
  const wait = lastSendAt + minDelayMs - now;
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait));
  }
  lastSendAt = Date.now();
}

async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  const { emailId } = job.data;

  const email = await prisma.email.findUnique({
    where: { id: emailId },
    include: { sender: true, user: { include: { slackIntegration: true } } },
  });

  if (!email) {
    console.warn(`[worker] email ${emailId} no longer exists, skipping`);
    return;
  }

  // --- Idempotency guard -------------------------------------------------
  // This is the real safety net (independent of BullMQ jobId bookkeeping):
  // if this row is already terminal, never send again.
  if (email.status === "SENT") {
    console.log(`[worker] email ${emailId} already SENT, skipping duplicate`);
    return;
  }

  // --- Rate limit check (Redis-backed, safe across workers) --------------
  const rateResult = await tryConsumeRateLimit(email.senderId);
  if (!rateResult.allowed) {
    await prisma.email.update({
      where: { id: email.id },
      data: { status: "DELAYED_RATE_LIMIT" },
    });

    if (email.user.slackIntegration) {
      await notifyRateLimitHit(email.user.slackIntegration, {
        scope: rateResult.scope,
        senderId: email.senderId,
        emailId: email.id,
        nextWindowInMs: rateResult.msUntilNextWindow,
      });
    }

    // Push the job into the next hour window rather than failing it.
    await rescheduleForNextWindow(email.id, rateResult.msUntilNextWindow);
    return;
  }

  // --- Minimum delay between sends ---------------------------------------
  await enforceMinDelay();

  await prisma.email.update({ where: { id: email.id }, data: { status: "SENDING" } });

  try {
    await sendMail(email.sender, {
      to: email.recipient,
      subject: email.subject,
      html: email.body,
    });

    const updated = await prisma.email.update({
      where: { id: email.id },
      data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 } },
    });

    await indexEmail(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown send error";
    const updated = await prisma.email.update({
      where: { id: email.id },
      data: { status: "FAILED", failReason: message, attempts: { increment: 1 } },
    });
    await indexEmail(updated);
    throw err; // let BullMQ's retry/backoff handle re-attempts
  }
}

export const emailWorker = new Worker<EmailJobData>(EMAIL_QUEUE_NAME, processEmailJob, {
  connection: redisConnection,
  concurrency: workerConcurrency,
  // Global throttling: at most 1 job started per minDelayMs across the
  // whole queue. This is the BullMQ-native way to satisfy "minimum delay
  // between individual email sends" required by the assignment, layered
  // on top of the defensive enforceMinDelay() above.
  limiter: {
    max: 1,
    duration: minDelayMs,
  },
});

emailWorker.on("completed", (job) => {
  console.log(`[worker] job ${job.id} completed`);
});

emailWorker.on("failed", (job, err) => {
  console.error(`[worker] job ${job?.id} failed:`, err.message);
});

console.log(`[worker] listening on queue "${EMAIL_QUEUE_NAME}" with concurrency ${workerConcurrency}`);
