import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";

import { env } from "./config/env";
import { authRouter } from "./routes/auth";
import { slackRouter } from "./routes/slack";
import { emailsRouter } from "./routes/emails";
import { sendersRouter } from "./routes/senders";
import { emailQueue } from "./queue/queue";
import { ensureEmailIndex } from "./services/search";
import { reconcileScheduledEmails } from "./queue/reconcile";

async function main() {
  const app = express();

  app.use(cors({ origin: env.frontendUrl, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  // --- Live BullMQ dashboard (real-time queue visibility) -----------------
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath("/admin/queues");
  createBullBoard({
    queues: [new BullMQAdapter(emailQueue)],
    serverAdapter,
  });
  app.use("/admin/queues", serverAdapter.getRouter());

  // --- API routes -----------------------------------------------------------
  app.use("/api/auth", authRouter);
  app.use("/api/slack", slackRouter);
  app.use("/api/emails", emailsRouter);
  app.use("/api/senders", sendersRouter);

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  await ensureEmailIndex();
  await reconcileScheduledEmails();

  app.listen(env.port, () => {
    console.log(`[server] listening on http://localhost:${env.port}`);
    console.log(`[server] BullMQ dashboard at http://localhost:${env.port}/admin/queues`);
  });
}

main().catch((err) => {
  console.error("[server] fatal startup error", err);
  process.exit(1);
});
