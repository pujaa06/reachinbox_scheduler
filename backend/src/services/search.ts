import { Client } from "@elastic/elasticsearch";
import { env } from "../config/env";
import type { Email } from "@prisma/client";

export const esClient = new Client({ node: env.elasticsearch.node });

const INDEX = env.elasticsearch.index;

export async function ensureEmailIndex(): Promise<void> {
  const exists = await esClient.indices.exists({ index: INDEX });
  if (exists) return;

  await esClient.indices.create({
    index: INDEX,
    mappings: {
      properties: {
        id: { type: "keyword" },
        userId: { type: "keyword" },
        recipient: { type: "text", fields: { keyword: { type: "keyword" } } },
        subject: { type: "text" },
        body: { type: "text" },
        status: { type: "keyword" },
        scheduledFor: { type: "date" },
        sentAt: { type: "date" },
        senderId: { type: "keyword" },
        batchId: { type: "keyword" },
      },
    },
  });
  console.log(`[elasticsearch] created index "${INDEX}"`);
}

export async function indexEmail(email: Email): Promise<void> {
  try {
    await esClient.index({
      index: INDEX,
      id: email.id,
      document: {
        id: email.id,
        userId: email.userId,
        recipient: email.recipient,
        subject: email.subject,
        body: email.body,
        status: email.status,
        scheduledFor: email.scheduledFor,
        sentAt: email.sentAt,
        senderId: email.senderId,
        batchId: email.batchId,
      },
      refresh: "wait_for",
    });
  } catch (err) {
    // Search indexing must never block the send pipeline - log and move on.
    console.error("[elasticsearch] failed to index email", email.id, err);
  }
}

export interface EmailSearchParams {
  userId: string;
  query?: string;
  status?: string;
  from?: number;
  size?: number;
}

export async function searchEmails({ userId, query, status, from = 0, size = 20 }: EmailSearchParams) {
  const filter: any[] = [{ term: { userId } }];
  if (status) filter.push({ term: { status } });

  const must: any[] = query
    ? [{ multi_match: { query, fields: ["subject", "body", "recipient"] } }]
    : [{ match_all: {} }];

  const result = await esClient.search({
    index: INDEX,
    from,
    size,
    query: {
      bool: { must, filter },
    },
    sort: [{ scheduledFor: { order: "desc" } }],
  });

  return {
    total:
      typeof result.hits.total === "number" ? result.hits.total : result.hits.total?.value ?? 0,
    hits: result.hits.hits.map((h) => h._source),
  };
}
