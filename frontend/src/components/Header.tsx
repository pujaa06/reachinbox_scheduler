"use client";

import type { CurrentUser } from "@/types";
import { Button } from "./Button";
import { api } from "@/lib/api";

interface HeaderProps {
  user: CurrentUser;
  onLoggedOut: () => void;
  onSlackChange: () => void;
}

export function Header({ user, onLoggedOut, onSlackChange }: HeaderProps) {
  async function handleLogout() {
    await api.logout();
    onLoggedOut();
  }

  async function handleSlack() {
    if (user.slackConnected) {
      await api.disconnectSlack();
      onSlackChange();
    } else {
      window.location.href = api.slackConnectUrl();
    }
  }

  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-brand-500" />
        <span className="text-base font-semibold">ReachInbox Scheduler</span>
      </div>

      <div className="flex items-center gap-4">
        <Button variant={user.slackConnected ? "secondary" : "primary"} onClick={handleSlack}>
          {user.slackConnected ? "Slack connected ✓" : "Connect Slack"}
        </Button>

        <div className="flex items-center gap-2">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt={user.name} className="h-8 w-8 rounded-full" />
          ) : (
            <div className="h-8 w-8 rounded-full bg-slate-200" />
          )}
          <div className="text-sm leading-tight">
            <p className="font-medium text-slate-800">{user.name}</p>
            <p className="text-xs text-slate-400">{user.email}</p>
          </div>
        </div>

        <Button variant="ghost" onClick={handleLogout}>
          Logout
        </Button>
      </div>
    </header>
  );
}
