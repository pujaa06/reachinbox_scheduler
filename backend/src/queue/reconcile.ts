import { prisma } from "../db/prisma";
import { emailQueue, enqueueEmailJob } from "./queue";

/**
 * BullMQ + Redis already survive a plain server/process restart on their
 * own (delayed jobs live in Redis, not in process memory). This function
 * covers the harder edge case: Redis itself was flushed/replaced while
 * Postgres still has rows in PENDING/QUEUED/DELAYED_RATE_LIMIT state.
 *
 * On boot we diff "emails that should have a job" against "jobs that
 * actually exist in BullMQ" and only re-enqueue the gap - so this is safe
 * to run every time the process starts, not just after a real disaster.
 */
export async function reconcileScheduledEmails(): Promise<void> {
  const candidates = await prisma.email.findMany({
    where: { status: { in: ["PENDING", "QUEUED", "DELAYED_RATE_LIMIT"] } },
  });

  let requeued = 0;
  for (const email of candidates) {
    const existingJob = await emailQueue.getJob(email.id);
    if (existingJob) continue; // job already lives in Redis, nothing to do

    const jobId = await enqueueEmailJob(email.id, email.scheduledFor);
    await prisma.email.update({ where: { id: email.id }, data: { status: "QUEUED", jobId } });
    requeued++;
  }

  if (requeued > 0) {
    console.log(`[reconcile] re-enqueued ${requeued} email(s) missing from the queue`);
  } else {
    console.log("[reconcile] no orphaned emails found, queue state is consistent");
  }
}
