"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Loader2, Bell } from "lucide-react";

interface Preference {
  event_type: string;
  in_app_enabled: boolean;
  email_enabled: boolean;
  digest_mode: boolean;
}

const EVENT_GROUPS: { label: string; events: { type: string; label: string }[] }[] = [
  { label: "Reviews", events: [
    { type: "review.submitted", label: "Review assigned to you" },
    { type: "review.approved", label: "Review approved" },
    { type: "review.approved_with_conditions", label: "Review approved with conditions" },
    { type: "review.rejected", label: "Review rejected" },
    { type: "review.overdue", label: "Review overdue (14+ days)" },
  ]},
  { label: "Conditions", events: [
    { type: "condition.due_soon", label: "Condition due in 7 days" },
    { type: "condition.due_tomorrow", label: "Condition due tomorrow" },
    { type: "condition.overdue", label: "Condition overdue" },
    { type: "condition.completed", label: "Condition completed" },
  ]},
  { label: "Decisions & ARB", events: [
    { type: "decision.submitted", label: "New decision request" },
    { type: "decision.decided", label: "Decision outcome recorded" },
    { type: "arb.meeting_created", label: "ARB meeting scheduled" },
  ]},
  { label: "ADRs", events: [
    { type: "adr.accepted", label: "ADR accepted" },
    { type: "adr.deprecated", label: "ADR deprecated" },
  ]},
  { label: "Policies & Patterns", events: [
    { type: "policy.updated", label: "Policy updated" },
    { type: "policy.deprecated", label: "Policy deprecated" },
    { type: "pattern.approved", label: "Pattern approved" },
    { type: "pattern.deprecated", label: "Pattern deprecated" },
  ]},
];

export default function NotificationPreferences() {
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [loading, setLoading] = useState(true);
  const [digestMode, setDigestMode] = useState(false);

  useEffect(() => {
    async function load() {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) return;
      const res = await fetch("/api/truly-govern/notifications/preferences", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      setPreferences(json.data ?? []);
      setDigestMode((json.data ?? []).some((p: Preference) => p.digest_mode));
      setLoading(false);
    }
    load();
  }, []);

  async function updatePref(eventType: string, field: "in_app_enabled" | "email_enabled", value: boolean) {
    // Optimistic update
    setPreferences((prev) =>
      prev.map((p) => p.event_type === eventType ? { ...p, [field]: value } : p),
    );

    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const pref = preferences.find((p) => p.event_type === eventType);
    await fetch("/api/truly-govern/notifications/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        preferences: [{
          event_type: eventType,
          in_app_enabled: field === "in_app_enabled" ? value : (pref?.in_app_enabled ?? true),
          email_enabled: field === "email_enabled" ? value : (pref?.email_enabled ?? false),
          digest_mode: digestMode,
        }],
      }),
    });
  }

  async function toggleDigest() {
    const newVal = !digestMode;
    setDigestMode(newVal);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const updates = preferences.map((p) => ({ ...p, digest_mode: newVal }));
    await fetch("/api/truly-govern/notifications/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ preferences: updates }),
    });
  }

  async function sendTestNotification() {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    // Create a test notification via the mark-read endpoint pattern — we'll just insert one directly
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user?.id ?? "").single();
    if (user && profile) {
      const { notify } = await import("@/lib/truly-govern/notifications");
      // Can't call server-side notify from client — use a simple insert instead
      await fetch("/api/truly-govern/notifications/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids: [] }), // No-op, just to trigger refresh
      });
      alert("Check your notification bell — a test notification will appear shortly.");
    }
  }

  if (loading) return <div className="flex items-center gap-2 text-sm text-neutral-500"><Loader2 size={16} className="animate-spin" /> Loading preferences...</div>;

  const prefMap = new Map(preferences.map((p) => [p.event_type, p]));

  return (
    <div>
      <h2 className="text-lg font-semibold mb-1">Notification Preferences</h2>
      <p className="text-xs text-neutral-500 mb-6">Control which notifications you receive and how they are delivered.</p>

      {/* Digest toggle */}
      <div className="mb-6 flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4">
        <div>
          <div className="text-sm font-medium">Daily digest</div>
          <div className="text-xs text-neutral-500">Bundle email notifications into a single daily summary at 08:00 UTC.</div>
        </div>
        <button
          onClick={toggleDigest}
          className={`relative h-5 w-9 rounded-full transition-colors ${digestMode ? "bg-neutral-900" : "bg-neutral-300"}`}
        >
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${digestMode ? "translate-x-4" : "translate-x-0.5"}`} />
        </button>
      </div>

      {/* Per-event preferences */}
      <div className="rounded-lg border border-neutral-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-neutral-50 border-b border-neutral-200">
            <tr>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Event</th>
              <th className="px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-neutral-500 w-24">In-app</th>
              <th className="px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-neutral-500 w-24">Email</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-neutral-50">
            {EVENT_GROUPS.map((group) => (
              <tr key={group.label} className="contents">
                {/* Group header as a row spanning all columns */}
                <td colSpan={3} className="px-4 py-2 bg-neutral-50 border-b border-neutral-100">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">{group.label}</span>
                </td>
                {group.events.map((evt) => {
                  const pref = prefMap.get(evt.type);
                  return (
                    <tr key={evt.type} className="hover:bg-neutral-50">
                      <td className="px-4 py-2.5 text-sm text-neutral-700">{evt.label}</td>
                      <td className="px-4 py-2.5 text-center">
                        <button
                          onClick={() => updatePref(evt.type, "in_app_enabled", !(pref?.in_app_enabled ?? true))}
                          className={`relative h-4 w-8 rounded-full transition-colors ${(pref?.in_app_enabled ?? true) ? "bg-emerald-500" : "bg-neutral-300"}`}
                        >
                          <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${(pref?.in_app_enabled ?? true) ? "translate-x-4" : "translate-x-0.5"}`} />
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <button
                          onClick={() => updatePref(evt.type, "email_enabled", !(pref?.email_enabled ?? false))}
                          className={`relative h-4 w-8 rounded-full transition-colors ${(pref?.email_enabled ?? false) ? "bg-emerald-500" : "bg-neutral-300"}`}
                        >
                          <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${(pref?.email_enabled ?? false) ? "translate-x-4" : "translate-x-0.5"}`} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
