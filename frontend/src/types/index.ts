export type EmailStatus = "PENDING" | "QUEUED" | "SENDING" | "SENT" | "FAILED" | "DELAYED_RATE_LIMIT";

export interface EmailRow {
  id: string;
  recipient: string;
  subject: string;
  body: string;
  status: EmailStatus;
  scheduledFor: string;
  sentAt: string | null;
  failReason: string | null;
}

export interface Sender {
  id: string;
  name: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  maxPerHour: number;
}

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  slackConnected: boolean;
}

export interface ScheduleEmailPayload {
  subject: string;
  body: string;
  startTime: string;
  delayMs: number;
  hourlyLimit: number;
  recipients: string[];
  senderId?: string;
}
