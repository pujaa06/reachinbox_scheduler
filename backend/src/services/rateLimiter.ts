import { redisConnection } from "../db/redis";
import { env } from "../config/env";

/**
 * Fixed-hour-window counters stored in Redis. Every worker/instance
 * shares the same Redis, so counts are never based on in-memory state.
 *
 * Key shape: ratelimit:{scope}:{hourWindowStart}
 *   scope = "global" or the senderId
 *
 * We use INCR (atomic) + EXPIRE (only set once) via a small Lua script
 * so the "read count, compare, increment" sequence can't race between
 * two workers picking up jobs at the same instant.
 */

const INCR_IF_UNDER_LIMIT = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])

local current = redis.call("GET", key)
if current == false then
  current = 0
else
  current = tonumber(current)
end

if current >= limit then
  return -1
end

local newVal = redis.call("INCR", key)
if newVal == 1 then
  redis.call("EXPIRE", key, ttl)
end
return newVal
`;

function hourWindowStart(date: Date = new Date()): number {
  const d = new Date(date);
  d.setMinutes(0, 0, 0);
  return d.getTime();
}

function keyFor(scope: string, windowStart: number): string {
  return `ratelimit:${scope}:${windowStart}`;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  scope: string;
  windowStart: number;
  /** ms until the next hour window opens - useful for rescheduling */
  msUntilNextWindow: number;
}

/**
 * Attempts to atomically consume one slot from both the global and
 * per-sender hourly budgets. If either is exhausted, nothing is
 * consumed (we don't want a partial increment) and the caller should
 * reschedule the job into the next window.
 */
export async function tryConsumeRateLimit(senderId: string | null): Promise<RateLimitCheckResult> {
  const now = new Date();
  const windowStart = hourWindowStart(now);
  const nextWindowStart = windowStart + 60 * 60 * 1000;
  const msUntilNextWindow = nextWindowStart - now.getTime();
  const ttlSeconds = Math.ceil(msUntilNextWindow / 1000) + 60; // small buffer

  const globalKey = keyFor("global", windowStart);
  const globalResult = (await redisConnection.eval(
    INCR_IF_UNDER_LIMIT,
    1,
    globalKey,
    env.rateLimit.maxEmailsPerHour,
    ttlSeconds
  )) as number;

  if (globalResult === -1) {
    return { allowed: false, scope: "global", windowStart, msUntilNextWindow };
  }

  if (senderId) {
    const senderKey = keyFor(senderId, windowStart);
    const senderResult = (await redisConnection.eval(
      INCR_IF_UNDER_LIMIT,
      1,
      senderKey,
      env.rateLimit.maxEmailsPerHourPerSender,
      ttlSeconds
    )) as number;

    if (senderResult === -1) {
      // roll back the global slot we just took since the sender-level
      // check failed and we didn't actually send anything
      await redisConnection.decr(globalKey);
      return { allowed: false, scope: senderId, windowStart, msUntilNextWindow };
    }
  }

  return { allowed: true, scope: "ok", windowStart, msUntilNextWindow };
}

/** Minimum spacing between sends, enforced via BullMQ's limiter on the queue itself. */
export const minDelayMs = env.rateLimit.minDelayMsBetweenSends;
