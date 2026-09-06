import nodemailer, { Transporter } from "nodemailer";
import { env } from "../config/env";
import type { Sender } from "@prisma/client";

const transporterCache = new Map<string, Transporter>();

function getTransporterFor(sender: { smtpHost: string; smtpPort: number; smtpUser: string; smtpPass: string }): Transporter {
  const cacheKey = sender.smtpUser;
  const cached = transporterCache.get(cacheKey);
  if (cached) return cached;

  const transporter = nodemailer.createTransport({
    host: sender.smtpHost,
    port: sender.smtpPort,
    secure: false, // Ethereal uses STARTTLS on 587
    auth: {
      user: sender.smtpUser,
      pass: sender.smtpPass,
    },
  });

  transporterCache.set(cacheKey, transporter);
  return transporter;
}

/** Falls back to the first configured Ethereal sender in .env if no DB Sender row is attached. */
function defaultSenderConfig() {
  const [first] = env.etherealSenders;
  if (!first) {
    throw new Error("No Ethereal sender configured. Set ETHEREAL_SENDERS in .env or attach a Sender to the email.");
  }
  return {
    smtpHost: first.host,
    smtpPort: first.port,
    smtpUser: first.user,
    smtpPass: first.pass,
    name: first.name,
  };
}

export async function sendMail(
  sender: Sender | null,
  message: { to: string; subject: string; html: string }
): Promise<{ messageId: string; previewUrl: string | false }> {
  const senderConfig = sender ?? defaultSenderConfig();
  const transporter = getTransporterFor(senderConfig);

  const info = await transporter.sendMail({
    from: `"${"name" in senderConfig ? senderConfig.name : "ReachInbox"}" <${senderConfig.smtpUser}>`,
    to: message.to,
    subject: message.subject,
    html: message.html,
  });

  return {
    messageId: info.messageId,
    previewUrl: nodemailer.getTestMessageUrl(info),
  };
}

/** Helper used by the "add sender" admin flow to mint a fresh Ethereal test account on demand. */
export async function createEtherealTestAccount() {
  const account = await nodemailer.createTestAccount();
  return {
    host: account.smtp.host,
    port: account.smtp.port,
    user: account.user,
    pass: account.pass,
  };
}
