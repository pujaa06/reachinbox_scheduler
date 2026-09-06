import { Router } from "express";
import crypto from "crypto";
import { buildGoogleAuthorizeUrl, completeGoogleOAuth, issueSessionToken } from "../services/googleAuth";
import { env } from "../config/env";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { prisma } from "../db/prisma";

export const authRouter = Router();

authRouter.get("/google", (req, res) => {
  const state = crypto.randomBytes(16).toString("hex");
  res.cookie("oauth_state", state, { httpOnly: true, maxAge: 5 * 60 * 1000 });
  res.redirect(buildGoogleAuthorizeUrl(state));
});

authRouter.get("/google/callback", async (req, res) => {
  const { code, state } = req.query as { code?: string; state?: string };
  const expectedState = req.cookies?.oauth_state;

  if (!code || !state || state !== expectedState) {
    return res.status(400).send("Invalid OAuth state or missing code");
  }

  try {
    const user = await completeGoogleOAuth(code);
    const token = issueSessionToken(user.id);
    res.cookie("session", token, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: "lax",
    });
    res.clearCookie("oauth_state");
    res.redirect(`${env.frontendUrl}/dashboard`);
  } catch (err) {
    console.error("[auth] Google OAuth failed", err);
    res.redirect(`${env.frontendUrl}/login?error=oauth_failed`);
  }
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie("session");
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    include: { slackIntegration: true },
  });
  if (!user) return res.status(404).json({ error: "User not found" });

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    slackConnected: !!user.slackIntegration,
  });
});
