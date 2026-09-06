import { OAuth2Client } from "google-auth-library";
import { env } from "../config/env";
import { prisma } from "../db/prisma";
import jwt from "jsonwebtoken";

export const googleClient = new OAuth2Client(
  env.google.clientId,
  env.google.clientSecret,
  env.google.redirectUri
);

export function buildGoogleAuthorizeUrl(state: string): string {
  return googleClient.generateAuthUrl({
    access_type: "online",
    scope: ["openid", "email", "profile"],
    prompt: "select_account",
    state,
  });
}

export async function completeGoogleOAuth(code: string) {
  const { tokens } = await googleClient.getToken(code);
  const ticket = await googleClient.verifyIdToken({
    idToken: tokens.id_token!,
    audience: env.google.clientId,
  });

  const payload = ticket.getPayload();
  if (!payload || !payload.sub || !payload.email) {
    throw new Error("Google did not return a valid ID token payload");
  }

  const user = await prisma.user.upsert({
    where: { googleId: payload.sub },
    create: {
      googleId: payload.sub,
      email: payload.email,
      name: payload.name ?? payload.email,
      avatarUrl: payload.picture,
    },
    update: {
      email: payload.email,
      name: payload.name ?? payload.email,
      avatarUrl: payload.picture,
    },
  });

  return user;
}

export function issueSessionToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.jwtSecret, { expiresIn: "7d" });
}

export function verifySessionToken(token: string): { sub: string } {
  return jwt.verify(token, env.jwtSecret) as { sub: string };
}
