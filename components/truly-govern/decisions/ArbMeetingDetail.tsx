"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ArrowLeft, Loader2, CheckCircle, XCircle, Clock, ChevronDown } from "lucide-react";
import { RISK_COLORS } from "@/lib/truly-govern/constants";
import type { GovernanceView } from "@/lib/truly-govern/governance-views";

interface MeetingData {
  id: string;
  title: string;
  scheduled_at: string;
  status: string;
  notes: string | null;
}

interface AgendaItem {
  id: string;
  position: number;
  estimated_minutes: number;
  outcome: string | null;
  outcome_notes: string | null;
  dissent: string | null;
  decision_requests: {
    id: string;
    title: string;
    type: string;
    problem_statement: string;
    risk_level: string;
    triage_notes: Record<string, unknown> | null;
  };
}

interface ArbMeetingDetailProps {
  meetingId: string;
  onNavigate: (view: GovernanceView) => void;
}

const OUTCOME_OPTIONS = [
  { value: "approved", label: "Approved", color: "bg-emerald-600" },
  { value: "approved_conditionally", label: "Approved with Conditions", color: "bg-amber-600" },
  { value: "rejected", label: "Rejected", color: "bg-red-600" },
  { value: "deferred", label: "Deferred", color: "bg-neutral-500" },
];

const TYPE_LABELS: Record<string, string> = {
  buy_build: "Buy vs Build", technology_adoption: "Technology", vendor_selection: "Vendor",
  architecture_pattern: "Pattern", security_exception: "Exception", cross_domain: "Cross-Domain", strategic_principle: "Strategic",
};

export default function ArbMeetingDetail({ meetingId, onNavigate }: ArbMeetingDetailProps) {
  const [meeting, setMeeting] = useState<MeetingData | null>(null);
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [mtgRes, agendaRes] = await Promise.all([
      supabase.from("arb_meetings").select("*").eq("id", meetingId).single(),
      supabase.from("meeting_agenda_items").select("*, decision_requests(id, title, type, problem_statement, risk_level, triage_notes)").eq("meeting_id", meetingId).order("position"),
    ]);
    setMeeting(mtgRes.data);
    setAgenda(agendaRes.data ?? []);
    setLoading(false);
  }, [meetingId]);

  useEffect(() => { load(); }, [load]);

  async function startMeeting() {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    await fetch("/api/truly-govern/arb", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: meetingId, status: "in_progress" }),
    });
    setMeeting((prev) => prev ? { ...prev, status: "in_progress" } : prev);
  }

  async function closeMeeting() {
    setSaving(true);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    await fetch("/api/truly-govern/arb", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: meetingId, status: "completed" }),
    });
    await load();
    setSaving(false);
  }

  async function updateAgendaItem(itemId: string, updates: Record<string, unknown>) {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    await fetch("/api/truly-govern/arb/agenda", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: itemId, ...updates }),
    });
    await load();
  }

  if (loading) return <div className="flex items-center gap-2 text-sm text-neutral-500"><Loader2 size={16} className="animate-spin" /> Loading...</div>;
  if (!meeting) return <div className="text-sm text-neutral-500">Meeting not found.</div>;

  const isLive = meeting.status === "in_progress";
  const allDecided = agenda.length > 0 && agenda.every((a) => a.outcome);

  return (
    <div className="max-w-4xl">
      <button onClick={() => onNavigate({ page: "arb" })} className="mb-4 flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700">
        <ArrowLeft size={14} /> Back to ARB backlog
      </button>

      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{meeting.title}</h1>
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span className={`rounded-full px-2 py-0.5 ${meeting.status === "completed" ? "bg-emerald-50 text-emerald-700" : meeting.status === "in_progress" ? "bg-blue-50 text-blue-700" : "bg-neutral-100 text-neutral-600"}`}>
              {meeting.status}
            </span>
            <span className="text-neutral-400">{new Date(meeting.scheduled_at).toLocaleString()}</span>
            <span className="text-neutral-400">{agenda.length} agenda items</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {meeting.status === "planned" && (
            <button onClick={startMeeting} className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700">
              Start Meeting
            </button>
          )}
          {isLive && allDecided && (
            <button onClick={closeMeeting} disabled={saving} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-50">
              {saving ? "Closing..." : "Close Meeting"}
            </button>
          )}
        </div>
      </div>

      {/* Agenda */}
      <div className="space-y-3">
        {agenda.map((item) => {
          const dr = item.decision_requests;
          const isExpanded = expandedIds.has(item.id);
          const outcomeIcon = item.outcome === "approved" ? <CheckCircle size={14} className="text-emerald-500" />
            : item.outcome === "rejected" ? <XCircle size={14} className="text-red-500" />
            : item.outcome ? <Clock size={14} className="text-amber-500" />
            : <Clock size={14} className="text-neutral-300" />;

          return (
            <div key={item.id} className={`rounded-lg border bg-white ${item.outcome ? "border-neutral-200" : "border-neutral-300"}`}>
              {/* Item header */}
              <div className="flex items-center gap-3 px-4 py-3">
                {outcomeIcon}
                <span className="text-xs text-neutral-400 font-mono">#{item.position}</span>
                <span className="flex-1 text-sm font-medium">{dr.title}</span>
                <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px]">{TYPE_LABELS[dr.type] ?? dr.type}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] capitalize ${RISK_COLORS[dr.risk_level as keyof typeof RISK_COLORS] ?? "bg-neutral-100"}`}>{dr.risk_level}</span>
                <span className="text-[10px] text-neutral-400">{item.estimated_minutes}min</span>
                <button onClick={() => setExpandedIds((prev) => { const next = new Set(prev); next.has(item.id) ? next.delete(item.id) : next.add(item.id); return next; })} className="text-neutral-400 hover:text-neutral-600">
                  <ChevronDown size={14} className={`transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                </button>
              </div>

              {/* Expanded: problem + triage + outcome capture */}
              {isExpanded && (
                <div className="border-t border-neutral-100 px-4 py-3 space-y-3">
                  <div>
                    <div className="text-[10px] font-medium uppercase text-neutral-400 mb-1">Problem</div>
                    <div className="text-sm text-neutral-600">{dr.problem_statement}</div>
                  </div>

                  {dr.triage_notes && (
                    <div>
                      <div className="text-[10px] font-medium uppercase text-neutral-400 mb-1">Triage Notes</div>
                      <div className="text-xs text-neutral-500">{(dr.triage_notes as Record<string, unknown>).rationale as string}</div>
                    </div>
                  )}

                  {/* Outcome capture (live mode only) */}
                  {isLive && (
                    <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 space-y-2">
                      <div className="text-[10px] font-medium uppercase text-neutral-400">Outcome</div>
                      <div className="flex flex-wrap gap-2">
                        {OUTCOME_OPTIONS.map((o) => (
                          <button
                            key={o.value}
                            onClick={() => updateAgendaItem(item.id, { outcome: o.value })}
                            className={`rounded-md px-3 py-1.5 text-xs text-white ${item.outcome === o.value ? o.color : "bg-neutral-300 hover:bg-neutral-400"}`}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                      {item.outcome && (
                        <textarea
                          defaultValue={item.outcome_notes ?? ""}
                          onBlur={(e) => updateAgendaItem(item.id, { outcome_notes: e.target.value })}
                          rows={2}
                          className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
                          placeholder="Outcome notes..."
                        />
                      )}
                    </div>
                  )}

                  {/* Show outcome in completed mode */}
                  {meeting.status === "completed" && item.outcome && (
                    <div>
                      <div className="text-[10px] font-medium uppercase text-neutral-400 mb-1">Decision</div>
                      <div className={`inline-block rounded-full px-2 py-0.5 text-xs text-white ${OUTCOME_OPTIONS.find((o) => o.value === item.outcome)?.color ?? "bg-neutral-500"}`}>
                        {OUTCOME_OPTIONS.find((o) => o.value === item.outcome)?.label ?? item.outcome}
                      </div>
                      {item.outcome_notes && <div className="mt-1 text-xs text-neutral-500">{item.outcome_notes}</div>}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
