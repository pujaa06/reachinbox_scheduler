import { Router } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { enqueueEmailJob } from "../queue/queue";
import { searchEmails } from "../services/search";

export const emailsRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function extractEmails(fileBuffer: Buffer, mimetype: string): string[] {
  const text = fileBuffer.toString("utf-8");

  let candidates: string[] = [];
  if (mimetype === "text/csv" || text.includes(",") || text.includes("\n")) {
    try {
      const records: string[][] = parse(text, { skip_empty_lines: true, relax_column_count: true });
      candidates = records.flat();
    } catch {
      candidates = text.split(/[\s,]+/);
    }
  } else {
    candidates = text.split(/[\s,]+/);
  }

  const unique = new Set(
    candidates.map((c) => c.trim().toLowerCase()).filter((c) => EMAIL_REGEX.test(c))
  );
  return Array.from(unique);
}

// Parses a lead file and returns detected addresses without scheduling anything -
// used by the compose modal to show "N email addresses detected".
emailsRouter.post("/parse-leads", requireAuth, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const emails = extractEmails(req.file.buffer, req.file.mimetype);
  res.json({ count: emails.length, emails });
});

const scheduleSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
  startTime: z.string().datetime(),
  delayMs: z.coerce.number().int().min(0),
  hourlyLimit: z.coerce.number().int().min(1),
  recipients: z.array(z.string().email()).min(1),
  senderId: z.string().uuid().optional(),
});

emailsRouter.post("/schedule", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = scheduleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }
  const { subject, body, startTime, delayMs, hourlyLimit, recipients, senderId } = parsed.data;
  const userId = req.userId!;
  const start = new Date(startTime);

  const batch = await prisma.batch.create({
    data: {
      userId,
      subject,
      body,
      startTime: start,
      delayMs,
      hourlyLimit,
      totalRecipients: recipients.length,
    },
  });

  // Stagger scheduledFor per recipient using the requested delay so the
  // dashboard reflects realistic per-email send times even before the
  // worker's own rate limiter kicks in.
  const created = [];
  for (let i = 0; i < recipients.length; i++) {
    const scheduledFor = new Date(start.getTime() + i * delayMs);
    const email = await prisma.email.create({
      data: {
        userId,
        batchId: batch.id,
        senderId: senderId ?? null,
        recipient: recipients[i],
        subject,
        body,
        status: "PENDING",
        scheduledFor,
      },
    });

    const jobId = await enqueueEmailJob(email.id, scheduledFor);
    await prisma.email.update({ where: { id: email.id }, data: { status: "QUEUED", jobId } });
    created.push(email.id);
  }

  res.status(201).json({ batchId: batch.id, scheduled: created.length });
});

emailsRouter.get("/scheduled", requireAuth, async (req: AuthedRequest, res) => {
  const emails = await prisma.email.findMany({
    where: {
      userId: req.userId,
      status: { in: ["PENDING", "QUEUED", "SENDING", "DELAYED_RATE_LIMIT"] },
    },
    orderBy: { scheduledFor: "asc" },
    take: 200,
  });
  res.json(emails);
});

emailsRouter.get("/sent", requireAuth, async (req: AuthedRequest, res) => {
  const emails = await prisma.email.findMany({
    where: { userId: req.userId, status: { in: ["SENT", "FAILED"] } },
    orderBy: { sentAt: "desc" },
    take: 200,
  });
  res.json(emails);
});

// Elasticsearch-backed full text search across a user's emails.
emailsRouter.get("/search", requireAuth, async (req: AuthedRequest, res) => {
  const { q, status } = req.query as { q?: string; status?: string };
  const result = await searchEmails({ userId: req.userId!, query: q, status });
  res.json(result);
});
