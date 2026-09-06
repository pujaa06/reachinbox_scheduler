"use client";

import { useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";

interface RecipientChipsInputProps {
  recipients: string[];
  onChange: (recipients: string[]) => void;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function RecipientChipsInput({ recipients, onChange }: RecipientChipsInputProps) {
  const [draft, setDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function addFromDraft() {
    const candidate = draft.trim().toLowerCase();
    if (!candidate) return;
    if (!EMAIL_REGEX.test(candidate)) {
      setError(`"${candidate}" doesn't look like a valid email`);
      return;
    }
    if (!recipients.includes(candidate)) {
      onChange([...recipients, candidate]);
    }
    setDraft("");
    setError(null);
  }

  function removeChip(email: string) {
    onChange(recipients.filter((r) => r !== email));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addFromDraft();
    } else if (e.key === "Backspace" && draft === "" && recipients.length > 0) {
      removeChip(recipients[recipients.length - 1]);
    }
  }

  async function handleFileSelected(file: File) {
    setUploading(true);
    setError(null);
    try {
      const result = await api.parseLeads(file);
      const merged = new Set([...recipients, ...result.emails]);
      onChange(Array.from(merged));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to parse file");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-1 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium text-slate-700">To</span>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          ↑ Upload List
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.txt"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFileSelected(e.target.files[0])}
        />
      </div>

      <div className="flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-lg border border-slate-300 px-2 py-1.5 focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500">
        {recipients.map((email) => (
          <span
            key={email}
            className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
          >
            {email}
            <button
              type="button"
              onClick={() => removeChip(email)}
              className="text-slate-400 hover:text-slate-600"
              aria-label={`Remove ${email}`}
            >
              ✕
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={addFromDraft}
          placeholder={recipients.length === 0 ? "recipient@example.com" : ""}
          className="flex-1 min-w-[140px] border-none py-0.5 text-sm outline-none"
        />
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">
          {uploading
            ? "Parsing file…"
            : recipients.length > 0
            ? `${recipients.length} recipient${recipients.length === 1 ? "" : "s"}`
            : "Type an email and press Enter, or upload a list"}
        </span>
        {error && <span className="text-red-600">{error}</span>}
      </div>
    </div>
  );
}
