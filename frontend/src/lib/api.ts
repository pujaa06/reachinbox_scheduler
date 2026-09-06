import type { CurrentUser, EmailRow, ScheduleEmailPayload, Sender } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error ?? `Request to ${path} failed with ${res.status}`);
  }
  return res.json();
}

export const api = {
  googleLoginUrl: () => `${API_URL}/api/auth/google`,
  slackConnectUrl: () => `${API_URL}/api/slack/oauth/start`,

  me: () => request<CurrentUser>("/api/auth/me"),
  logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),

  disconnectSlack: () => request<{ ok: true }>("/api/slack/disconnect", { method: "POST" }),

  listSenders: () => request<Sender[]>("/api/senders"),
  createSender: (name: string, maxPerHour: number) =>
    request<Sender>("/api/senders", { method: "POST", body: JSON.stringify({ name, maxPerHour }) }),

  scheduledEmails: () => request<EmailRow[]>("/api/emails/scheduled"),
  sentEmails: () => request<EmailRow[]>("/api/emails/sent"),

  parseLeads: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ count: number; emails: string[] }>("/api/emails/parse-leads", {
      method: "POST",
      body: form,
    });
  },

  scheduleEmails: (payload: ScheduleEmailPayload) =>
    request<{ batchId: string; scheduled: number }>("/api/emails/schedule", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};

export { ApiError };
