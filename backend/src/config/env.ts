import dotenv from "dotenv";
dotenv.config();

function required(name: string, fallback?: string): string {
  const val = process.env[name] ?? fallback;
  if (val === undefined) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return val;
}

interface EtherealSenderConfig {
  name: string;
  host: string;
  port: number;
  user: string;
  pass: string;
}

function parseEtherealSenders(): EtherealSenderConfig[] {
  const raw = process.env.ETHEREAL_SENDERS ?? "[]";
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("ETHEREAL_SENDERS must be valid JSON array");
  }
}

export const env = {
  port: parseInt(process.env.PORT ?? "4000", 10),
  nodeEnv: process.env.NODE_ENV ?? "development",
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:3000",
  jwtSecret: required("JWT_SECRET", "dev-secret-change-me"),

  databaseUrl: required("DATABASE_URL"),

  redis: {
    host: process.env.REDIS_HOST ?? "localhost",
    port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  elasticsearch: {
    node: process.env.ELASTICSEARCH_NODE ?? "http://localhost:9200",
    index: process.env.ELASTICSEARCH_INDEX ?? "emails",
  },

  etherealSenders: parseEtherealSenders(),

  rateLimit: {
    workerConcurrency: parseInt(process.env.WORKER_CONCURRENCY ?? "5", 10),
    minDelayMsBetweenSends: parseInt(process.env.MIN_DELAY_MS_BETWEEN_SENDS ?? "2000", 10),
    maxEmailsPerHour: parseInt(process.env.MAX_EMAILS_PER_HOUR ?? "200", 10),
    maxEmailsPerHourPerSender: parseInt(process.env.MAX_EMAILS_PER_HOUR_PER_SENDER ?? "100", 10),
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    redirectUri: process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:4000/api/auth/google/callback",
  },

  slack: {
    clientId: process.env.SLACK_CLIENT_ID ?? "",
    clientSecret: process.env.SLACK_CLIENT_SECRET ?? "",
    redirectUri: process.env.SLACK_REDIRECT_URI ?? "http://localhost:4000/api/slack/oauth/callback",
    scopes: process.env.SLACK_SCOPES ?? "incoming-webhook,chat:write",
  },
};
