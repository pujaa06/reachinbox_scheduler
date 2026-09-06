"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { Button } from "@/components/Button";
import { EmailTable } from "@/components/EmailTable";
import { ComposeModal } from "@/components/ComposeModal";
import { api, ApiError } from "@/lib/api";
import type { CurrentUser, EmailRow } from "@/types";

type Tab = "scheduled" | "sent";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [tab, setTab] = useState<Tab>("scheduled");
  const [scheduled, setScheduled] = useState<EmailRow[]>([]);
  const [sent, setSent] = useState<EmailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);

  const loadUser = useCallback(async () => {
    try {
      const me = await api.me();
      setUser(me);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace("/login");
      }
    } finally {
      setAuthChecked(true);
    }
  }, [router]);

  const loadEmails = useCallback(async () => {
    setLoading(true);
    try {
      const [scheduledRes, sentRes] = await Promise.all([api.scheduledEmails(), api.sentEmails()]);
      setScheduled(scheduledRes);
      setSent(sentRes);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  useEffect(() => {
    if (user) loadEmails();
  }, [user, loadEmails]);

  // Light polling so the dashboard reflects worker activity without a manual refresh.
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(loadEmails, 10000);
    return () => clearInterval(interval);
  }, [user, loadEmails]);

  if (!authChecked || !user) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  return (
    <main className="flex h-screen flex-col bg-slate-50">
      <Header user={user} onLoggedOut={() => router.replace("/login")} onSlackChange={loadUser} />

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar: Compose + section nav, matching the Figma homepage rail */}
        <aside className="flex w-60 shrink-0 flex-col gap-1 border-r border-slate-200 bg-white px-4 py-6">
          <Button className="mb-4 w-full" onClick={() => setComposeOpen(true)}>
            + Compose New Email
          </Button>

          <button
            onClick={() => setTab("scheduled")}
            className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              tab === "scheduled" ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <span>Scheduled</span>
            <span className="rounded-full bg-slate-100 px-2 text-xs text-slate-500">{scheduled.length}</span>
          </button>

          <button
            onClick={() => setTab("sent")}
            className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              tab === "sent" ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <span>Sent</span>
            <span className="rounded-full bg-slate-100 px-2 text-xs text-slate-500">{sent.length}</span>
          </button>
        </aside>

        {/* Main list */}
        <section className="flex-1 overflow-y-auto px-6 py-6">
          <h1 className="mb-4 text-lg font-semibold text-slate-800">
            {tab === "scheduled" ? "Scheduled Emails" : "Sent Emails"}
          </h1>

          {tab === "scheduled" ? (
            <EmailTable rows={scheduled} loading={loading} mode="scheduled" />
          ) : (
            <EmailTable rows={sent} loading={loading} mode="sent" />
          )}
        </section>
      </div>

      <ComposeModal open={composeOpen} onClose={() => setComposeOpen(false)} onScheduled={loadEmails} />
    </main>
  );
}
