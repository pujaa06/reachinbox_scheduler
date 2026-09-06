"use client";

import { api } from "@/lib/api";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 rounded-2xl border border-slate-200 bg-white px-8 py-10 shadow-sm">
        <div className="flex flex-col items-center gap-2">
          <div className="h-10 w-10 rounded-xl bg-brand-500" />
          <h1 className="text-xl font-semibold text-slate-800">Login</h1>
        </div>

        <button
          onClick={() => (window.location.href = api.googleLoginUrl())}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-600"
        >
          <GoogleIcon />
          Login with Google
        </button>

        <p className="text-center text-xs text-slate-400">
          ReachInbox uses Google to verify your identity — no separate password needed.
        </p>
      </div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l6-6C34 5.1 29.3 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.4-.1-2.7-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.6 15.9 19 13 24 13c3.1 0 5.8 1.1 8 3l6-6C34 5.1 29.3 3 24 3 16.1 3 9.3 7.5 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 45c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 36.5 26.7 37 24 37c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.2 40.4 16 45 24 45z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.2 5.2C40.9 36 44 30.5 44 24c0-1.4-.1-2.7-.4-3.5z"
      />
    </svg>
  );
}
