"use client";

import { useState } from "react";
import { Button } from "./Button";

interface SendLaterModalProps {
  open: boolean;
  onCancel: () => void;
  onDone: (startTime: Date, hourlyLimit: number) => void;
  initialHourlyLimit: number;
}

function nextDayAt(hour: number, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hour, minute, 0, 0);
  return d;
}

const quickOptions: { label: string; getDate: () => Date }[] = [
  { label: "Tomorrow", getDate: () => nextDayAt(9, 0) },
  { label: "Tomorrow, 10:00 AM", getDate: () => nextDayAt(10, 0) },
  { label: "Tomorrow, 11:00 AM", getDate: () => nextDayAt(11, 0) },
  { label: "Tomorrow, 3:00 PM", getDate: () => nextDayAt(15, 0) },
];

export function SendLaterModal({ open, onCancel, onDone, initialHourlyLimit }: SendLaterModalProps) {
  const [selectedQuick, setSelectedQuick] = useState<string | null>(null);
  const [customDateTime, setCustomDateTime] = useState("");
  const [hourlyLimit, setHourlyLimit] = useState(initialHourlyLimit);

  if (!open) return null;

  function resolveStartTime(): Date | null {
    if (customDateTime) return new Date(customDateTime);
    const match = quickOptions.find((o) => o.label === selectedQuick);
    return match ? match.getDate() : null;
  }

  function handleDone() {
    const startTime = resolveStartTime();
    if (!startTime) return;
    onDone(startTime, hourlyLimit);
  }

  return (
    <div className="absolute bottom-full right-0 z-10 mb-2 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
      <p className="mb-2 text-sm font-semibold text-slate-700">Send Later</p>

      <label className="mb-3 flex flex-col gap-1 text-xs">
        <span className="text-slate-500">Pick date &amp; time</span>
        <input
          type="datetime-local"
          value={customDateTime}
          onChange={(e) => {
            setCustomDateTime(e.target.value);
            setSelectedQuick(null);
          }}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-brand-500"
        />
      </label>

      <div className="mb-3 flex flex-col gap-1">
        {quickOptions.map((opt) => (
          <button
            key={opt.label}
            type="button"
            onClick={() => {
              setSelectedQuick(opt.label);
              setCustomDateTime("");
            }}
            className={`rounded-md px-2 py-1.5 text-left text-sm ${
              selectedQuick === opt.label ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <label className="mb-4 flex items-center justify-between gap-2 text-xs">
        <span className="text-slate-500">Hourly Limit</span>
        <input
          type="number"
          min={1}
          value={hourlyLimit}
          onChange={(e) => setHourlyLimit(Number(e.target.value))}
          className="w-16 rounded-md border border-slate-300 px-2 py-1 text-sm outline-none focus:border-brand-500"
        />
      </label>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleDone} disabled={!customDateTime && !selectedQuick}>
          Done
        </Button>
      </div>
    </div>
  );
}
