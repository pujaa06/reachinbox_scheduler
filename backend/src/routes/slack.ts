import { Router } from "express";
import crypto from "crypto";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { buildSlackAuthorizeUrl, completeSlackOAuth, disconnectSlack } from "../services/slack";
import { env } from "../config/env";

export const slackRouter = Router();

// Kicks off the real Slack OAuth authorize flow from the dashboard's
// "Connect Slack" button.
slackRouter.get("/oauth/start", requireAuth, (req: AuthedRequest, res) => {
  const state = `${req.userId}.${crypto.randomBytes(8).toString("hex")}`;
  res.cookie("slack_oauth_state", state, { httpOnly: true, maxAge: 5 * 60 * 1000 });
  res.redirect(buildSlackAuthorizeUrl(state));
});

slackRouter.get("/oauth/callback", async (req, res) => {
  const { code, state } = req.query as { code?: string; state?: string };
  const expectedState = req.cookies?.slack_oauth_state;

  if (!code || !state || state !== expectedState) {
    return res.status(400).send("Invalid Slack OAuth state or missing code");
  }

  const userId = state.split(".")[0];

  try {
    await completeSlackOAuth(userId, code);
    res.clearCookie("slack_oauth_state");
    res.redirect(`${env.frontendUrl}/dashboard?slack=connected`);
  } catch (err) {
    console.error("[slack] OAuth failed", err);
    res.redirect(`${env.frontendUrl}/dashboard?slack=error`);
  }
});

slackRouter.post("/disconnect", requireAuth, async (req: AuthedRequest, res) => {
  await disconnectSlack(req.userId!);
  res.json({ ok: true });
});
