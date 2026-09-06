import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { createEtherealTestAccount } from "../services/mailer";
import { env } from "../config/env";
import type { Sender } from "@prisma/client";

export const sendersRouter = Router();

sendersRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const senders = await prisma.sender.findMany({ where: { userId: req.userId } });
  // never leak smtpPass to the frontend
  res.json(senders.map(({ smtpPass, ...s }: Sender) => s));
});

const createSenderSchema = z.object({
  name: z.string().min(1),
  maxPerHour: z.coerce.number().int().min(1).default(env.rateLimit.maxEmailsPerHourPerSender),
  // if omitted, we mint a brand new Ethereal test account automatically
  smtpHost: z.string().optional(),
  smtpPort: z.coerce.number().optional(),
  smtpUser: z.string().optional(),
  smtpPass: z.string().optional(),
});

sendersRouter.post("/", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = createSenderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { name, maxPerHour, smtpHost, smtpPort, smtpUser, smtpPass } = parsed.data;

  const creds =
    smtpHost && smtpPort && smtpUser && smtpPass
      ? { smtpHost, smtpPort, smtpUser, smtpPass }
      : await createEtherealTestAccount().then((a) => ({
          smtpHost: a.host,
          smtpPort: a.port,
          smtpUser: a.user,
          smtpPass: a.pass,
        }));

  const sender = await prisma.sender.create({
    data: { userId: req.userId!, name, maxPerHour, ...creds },
  });

  const { smtpPass: _omit, ...safe } = sender;
  res.status(201).json(safe);
});
