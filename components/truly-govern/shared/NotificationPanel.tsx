"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { X, Loader2, Bell } from "lucide-react";

interface Notification {
  id: string;
  event_type: string;
  entity_type: string | null;
  title: string;
  body: string | null;
  action_label: string | null;
  action_url: string | null;
  urgent: boolean;
  read: boolean;
  read_at: string | null;
  created_at: string;
}

interface NotificationPanelProps {
  onClose: () => void;
  onNavigate?: (url: string) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  review: "bg-teal-500",
  condition: "bg-amber-500",
  decision: "bg-purple-500",
  arb_meeting: "bg-purple-500",
  adr: "bg-blue-500",
  policy: "bg-red-400",
  pattern: "bg-emerald-500",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString();
}

export default function NotificationPanel({ onClose, onNavigate }: NotificationPanelProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  const loadNotifications = useCallback(async () => {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) return;

    const params = new URLSearchParams({ limit: "30" });
    if (showUnreadOnly) params.set("unread_only", "true");

    const res = await fetch(`/api/truly-govern/notifications?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    setNotifications(json.data ?? []);
    setLoading(false);
  }, [showUnreadOnly]);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  async function markRead(ids: string[]) {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    await fetch("/api/truly-govern/notifications/mark-read", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ids }),
    });
    setNotifications((prev) => prev.map((n) => ids.includes(n.id) ? { ...n, read: true, read_at: new Date().toISOString() } : n));
  }

  async function markAllRead() {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    await fetch("/api/truly-govern/notifications/mark-read", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ all: true }),
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true, read_at: new Date().toISOString() })));
  }

  function handleClick(n: Notification) {
    if (!n.read) markRead([n.id]);
    if (n.action_url && onNavigate) onNavigate(n.action_url);
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="w-[380px] rounded-lg border border-neutral-200 bg-white shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
        <span className="text-sm font-semibold text-neutral-900">Notifications</span>
        <div className="flex items-center gap-3">
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="text-[11px] text-blue-600 hover:text-blue-800">Mark all read</button>
          )}
          <button onClick={onClose} className="rounded p-0.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"><X size={14} /></button>
        </div>
      </div>

      {/* Unread toggle */}
      <div className="flex items-center justify-between border-b border-neutral-50 px-4 py-2">
        <span className="text-[11px] text-neutral-500">{unreadCount} unread</span>
        <button
          onClick={() => setShowUnreadOnly(!showUnreadOnly)}
          className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${showUnreadOnly ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`}
        >
          {showUnreadOnly ? "Show all" : "Unread only"}
        </button>
      </div>

      {/* List */}
      <div className="max-h-[360px] overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-10"><Loader2 size={16} className="animate-spin text-neutral-300" /></div>
        ) : notifications.length === 0 ? (
          <div className="py-12 text-center">
            <Bell size={20} className="mx-auto mb-2 text-neutral-200" />
            <p className="text-xs text-neutral-400">{showUnreadOnly ? "All caught up!" : "No notifications yet"}</p>
          </div>
        ) : (
          notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => handleClick(n)}
              className={`flex w-full gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-neutral-50 ${!n.read ? "bg-blue-50/40" : ""}`}
            >
              {/* Dot */}
              <div className="mt-1.5 shrink-0">
                <div className={`h-1.5 w-1.5 rounded-full ${n.read ? "bg-neutral-200" : CATEGORY_COLORS[n.entity_type ?? ""] ?? "bg-neutral-400"}`} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`truncate text-[12px] leading-tight ${n.read ? "text-neutral-500" : "font-medium text-neutral-900"}`}>{n.title}</span>
                  <span className="shrink-0 text-[10px] text-neutral-400">{timeAgo(n.created_at)}</span>
                </div>
                {n.body && <p className="mt-0.5 text-[11px] text-neutral-400 line-clamp-1">{n.body}</p>}
                {n.urgent && <span className="mt-0.5 inline-block rounded bg-red-50 px-1 py-0.5 text-[9px] font-semibold text-red-600">Urgent</span>}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
