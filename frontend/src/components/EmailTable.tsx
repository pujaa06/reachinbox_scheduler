import type { EmailRow, EmailStatus } from "@/types";
import { EmptyState, LoadingRows } from "./EmptyState";

const statusStyles: Record<EmailStatus, string> = {
  PENDING: "bg-slate-100 text-slate-600",
  QUEUED: "bg-blue-50 text-blue-600",
  SENDING: "bg-amber-50 text-amber-600",
  SENT: "bg-green-50 text-green-700",
  FAILED: "bg-red-50 text-red-600",
  DELAYED_RATE_LIMIT: "bg-purple-50 text-purple-600",
};

function StatusBadge({ status }: { status: EmailStatus }) {
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyles[status]}`}>
      {status.replace(/_/g, " ").toLowerCase()}
    </span>
  );
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface EmailTableProps {
  rows: EmailRow[];
  loading: boolean;
  mode: "scheduled" | "sent";
}

export function EmailTable({ rows, loading, mode }: EmailTableProps) {
  if (loading) return <LoadingRows />;

  if (rows.length === 0) {
    return (
      <EmptyState
        title={mode === "scheduled" ? "No scheduled emails yet" : "No sent emails yet"}
        subtitle={
          mode === "scheduled"
            ? "Compose a new email to schedule your first send."
            : "Emails will show up here once they've gone out."
        }
      />
    );
  }

  return (
    <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
      {rows.map((row) => {
        const timestamp = mode === "scheduled" ? row.scheduledFor : row.sentAt ?? row.scheduledFor;
        return (
          <div key={row.id} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-600">
              {row.recipient[0]?.toUpperCase() ?? "?"}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="font-medium text-slate-800">To: {row.recipient}</span>
              </div>
              <p className="truncate text-sm text-slate-500">
                <span className="font-medium text-slate-600">{row.subject}</span>
                {row.body && <span> — {stripHtml(row.body)}</span>}
              </p>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="text-xs text-slate-400">{formatTimestamp(timestamp)}</span>
              <StatusBadge status={row.status} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
