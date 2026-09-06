import axios from "axios";
import { env } from "../config/env";
import { prisma } from "../db/prisma";
import type { SlackIntegration } from "@prisma/client";

export function buildSlackAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.slack.clientId,
    scope: env.slack.scopes,
    redirect_uri: env.slack.redirectUri,
    state,
  });
  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

interface SlackOAuthResponse {
  ok: boolean;
  access_token: string;
  team: { id: string; name: string };
  incoming_webhook?: { url: string; channel: string };
  error?: string;
}

/** Exchanges the OAuth `code` for a real access token + incoming webhook, then persists it. */
export async function completeSlackOAuth(userId: string, code: string): Promise<SlackIntegration> {
  const response = await axios.post<SlackOAuthResponse>(
    "https://slack.com/api/oauth.v2.access",
    new URLSearchParams({
      client_id: env.slack.clientId,
      client_secret: env.slack.clientSecret,
      code,
      redirect_uri: env.slack.redirectUri,
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  const data = response.data;
  if (!data.ok || !data.incoming_webhook) {
    throw new Error(`Slack OAuth failed: ${data.error ?? "no incoming_webhook granted"}`);
  }

  return prisma.slackIntegration.upsert({
    where: { userId },
    create: {
      userId,
      teamId: data.team.id,
      teamName: data.team.name,
      accessToken: data.access_token,
      webhookUrl: data.incoming_webhook.url,
      channel: data.incoming_webhook.channel,
    },
    update: {
      teamId: data.team.id,
      teamName: data.team.name,
      accessToken: data.access_token,
      webhookUrl: data.incoming_webhook.url,
      channel: data.incoming_webhook.channel,
    },
  });
}

export async function disconnectSlack(userId: string): Promise<void> {
  await prisma.slackIntegration.deleteMany({ where: { userId } });
}

interface RateLimitHitPayload {
  scope: string;
  senderId: string | null;
  emailId: string;
  nextWindowInMs: number;
}

/**
 * Fires a live message to the user's connected Slack webhook the moment an
 * hourly limit is hit. If the user hasn't connected Slack, callers simply
 * skip this (see worker.ts) - no crash, and nothing to do here.
 *
 * If they connect later, this starts working immediately since we always
 * re-read the current SlackIntegration row - no redeploy needed.
 */
export async function notifyRateLimitHit(
  integration: SlackIntegration,
  payload: RateLimitHitPayload
): Promise<void> {
  const minutes = Math.ceil(payload.nextWindowInMs / 60000);
  const scopeLabel = payload.scope === "global" ? "global hourly limit" : `sender ${payload.scope} hourly limit`;

  try {
    await axios.post(integration.webhookUrl, {
      text:
        `:rotating_light: *ReachInbox rate limit hit*\n` +
        `The ${scopeLabel} was reached while processing email \`${payload.emailId}\`. ` +
        `This job has been automatically rescheduled into the next hour window (~${minutes} min).`,
    });
  } catch (err) {
    console.error("[slack] failed to deliver rate-limit notification", err);
  }
}
