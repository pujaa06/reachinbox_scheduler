"use client";

import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { TextField } from "./Input";
import { RecipientChipsInput } from "./RecipientChipsInput";
import { RichTextEditor } from "./RichTextEditor";
import { SendLaterModal } from "./SendLaterModal";
import { api, ApiError } from "@/lib/api";
import type { Sender } from "@/types";

interface ComposeModalProps {
  open: boolean;
  onClose: () => void;
  onScheduled: () => void;
}

export function ComposeModal({ open, onClose, onScheduled }: ComposeModalProps) {
  const [senders, setSenders] = useState<Sender[]>([]);
  const [senderId, setSenderId] = useState<string>("default");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [delaySeconds, setDelaySeconds] = useState(2);
  const [hourlyLimit, setHourlyLimit] = useState(100);
  const [sendLaterOpen, setSendLaterOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      api.listSenders().then(setSenders).catch(() => setSenders([]));
    }
  }, [open]);

  function reset() {
    setRecipients([]);
    setSubject("");
    setBody("");
    setSenderId("default");
    setError(null);
  }

  async function submit(startTime: Date, limitOverride?: number) {
    if (!subject || !body || recipients.length === 0) {
      setError("Subject, body, and at least one recipient are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.scheduleEmails({
        subject,
        body,
        startTime: startTime.toISOString(),
        delayMs: delaySeconds * 1000,
        hourlyLimit: limitOverride ?? hourlyLimit,
        recipients,
        senderId: senderId === "default" ? undefined : senderId,
      });
      reset();
      onScheduled();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to schedule emails");
    } finally {
      setSubmitting(false);
      setSendLaterOpen(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Compose New Email"
      footer={
        <div className="relative flex items-center gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={() => setSendLaterOpen((v) => !v)}>
            Send Later
          </Button>
          <Button onClick={() => submit(new Date())} disabled={submitting}>
            {submitting ? "Sending…" : "Send"}
          </Button>
          <SendLaterModal
            open={sendLaterOpen}
            onCancel={() => setSendLaterOpen(false)}
            onDone={(startTime, limit) => submit(startTime, limit)}
            initialHourlyLimit={hourlyLimit}
          />
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">From</span>
          <select
            value={senderId}
            onChange={(e) => setSenderId(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          >
            <option value="default">Default sender (Ethereal)</option>
            {senders.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — {s.smtpUser}
              </option>
            ))}
          </select>
        </label>

        <RecipientChipsInput recipients={recipients} onChange={setRecipients} />

        <TextField label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />

        <div className="grid grid-cols-2 gap-4">
          <TextField
            label="Delay between 2 emails (sec)"
            type="number"
            min={0}
            value={delaySeconds}
            onChange={(e) => setDelaySeconds(Number(e.target.value))}
          />
          <TextField
            label="Hourly Limit"
            type="number"
            min={1}
            value={hourlyLimit}
            onChange={(e) => setHourlyLimit(Number(e.target.value))}
          />
        </div>

        <RichTextEditor value={body} onChange={setBody} placeholder="Type your reply…" />

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}
