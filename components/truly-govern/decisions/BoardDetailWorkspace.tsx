"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ArrowLeft, Plus, Loader2, Calendar } from "lucide-react";
import { RISK_COLORS } from "@/lib/truly-govern/constants";
import type { GovernanceView } from "@/lib/truly-govern/governance-views";

interface BoardData {
  id: string;
  name: string;
  scope: string;
  scope_type: string;
  governed_domain_ids: string[];
  governed_decision_types: string[];
}

interface DecisionRow {
  id: string;
  title: string;
  type: string;
  risk_level: string;
  status: string;
  domain_id: string | null;
  created_at: string;
}

interface MeetingRow {
  id: string;
  title: string;
  scheduled_at: string;
  status: string;
  meeting_agenda_items: { id: string; outcome: string | null }[];
}

interface DomainOption { id: string; name: string }

interface BoardDetailWorkspaceProps {
  boardId: string;
  onNavigate: (view: GovernanceView) => void;
}

const TYPE_LABELS: Record<string, string> = {
  buy_build: "Buy vs Build", technology_adoption: "Technology", vendor_selection: "Vendor",
  architecture_pattern: "Pattern", security_exception: "Exception", cross_domain: "Cross-Domain", strategic_principle: "Strategic",
};

export default function BoardDetailWorkspace({ boardId, onNavigate }: BoardDetailWorkspaceProps) {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [decisions, setDecisions] = useState<DecisionRow[]>([]);
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [domains, setDomains] = useState<DomainOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateMeeting, setShowCreateMeeting] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
      if (!profile) return;
      const orgId = profile.org_id;

      const [boardRes, decRes, mtgRes, domRes] = await Promise.all([
        supabase.from("arb_boards").select("*").eq("id", boardId).single(),
        supabase.from("decision_requests").select("*").eq("resolved_arb_board_id", boardId).in("status", ["submitted", "in_review", "decided"]).order("created_at", { ascending: false }),
        supabase.from("arb_meetings").select("*, meeting_agenda_items(id, outcome)").eq("board_id", boardId).order("scheduled_at", { ascending: false }).limit(10),
        supabase.from("capability_domains").select("id, name").eq("org_id", orgId).eq("archived", false),
      ]);
      setBoard(boardRes.data);
      setDecisions(decRes.data ?? []);
      setMeetings(mtgRes.data ?? []);
      setDomains(domRes.data ?? []);
      setLoading(false);
    }
    load();
  }, [boardId]);

  const pending = decisions.filter((d) => d.status === "submitted");
  const inMeeting = decisions.filter((d) => d.status === "in_review");
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const decided = decisions.filter((d) => d.status === "decided" && d.created_at >= thirtyDaysAgo);

  const domainMap = new Map(domains.map((d) => [d.id, d.name]));
  const isTopicScoped = board?.scope_type === "topic_scoped";

  function toggleSelect(id: string) {
    setSelectedIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  async function createMeeting() {
    if (!meetingTitle || !meetingDate || selectedIds.size === 0) return;
    setCreating(true);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const res = await fetch("/api/truly-govern/arb", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title: meetingTitle,
        scheduled_at: new Date(meetingDate).toISOString(),
        request_ids: Array.from(selectedIds),
        board_id: boardId,
      }),
    });
    const json = await res.json();
    setCreating(false);
    setShowCreateMeeting(false);
    if (json.data?.id) onNavigate({ page: "arb-detail", id: json.data.id });
  }

  function DecisionCard({ d, selectable }: { d: DecisionRow; selectable?: boolean }) {
    const primaryBadge = isTopicScoped
      ? <span className="rounded bg-purple-50 px-1.5 py-0.5 text-[10px] text-purple-700">{TYPE_LABELS[d.type] ?? d.type}</span>
      : d.domain_id ? <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700">{domainMap.get(d.domain_id) ?? "Domain"}</span> : null;

    const secondaryBadge = isTopicScoped
      ? d.domain_id ? <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px]">{domainMap.get(d.domain_id)}</span> : null
      : <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px]">{TYPE_LABELS[d.type] ?? d.type}</span>;

    return (
      <div
        onClick={selectable ? () => toggleSelect(d.id) : undefined}
        className={`rounded-lg border bg-white p-3 ${selectable ? "cursor-pointer" : ""} ${selectable && selectedIds.has(d.id) ? "border-neutral-900 ring-1 ring-neutral-900" : "border-neutral-200"}`}
      >
        <div className="text-sm font-medium truncate">{d.title}</div>
        <div className="mt-1 flex items-center gap-1.5 text-[10px]">
          {primaryBadge}
          {secondaryBadge}
          <span className={`rounded px-1.5 py-0.5 capitalize ${RISK_COLORS[d.risk_level as keyof typeof RISK_COLORS] ?? "bg-neutral-100"}`}>{d.risk_level}</span>
        </div>
      </div>
    );
  }

  if (loading) return <div className="flex items-center gap-2 text-sm text-neutral-500"><Loader2 size={16} className="animate-spin" /> Loading...</div>;
  if (!board) return <div className="text-sm text-neutral-500">Board not found.</div>;

  return (
    <div>
      <button onClick={() => onNavigate({ page: "arb" })} className="mb-4 flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700">
        <ArrowLeft size={14} /> Back to boards
      </button>

      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">{board.name}</h2>
          <div className="mt-1 flex items-center gap-2 text-xs text-neutral-400">
            <span className="rounded bg-neutral-100 px-1.5 py-0.5">{board.scope_type === "domain_scoped" ? "Domain-scoped" : "Topic-scoped"}</span>
          </div>
        </div>
        <button onClick={() => { setShowCreateMeeting(true); setSelectedIds(new Set()); setMeetingTitle(""); setMeetingDate(""); }} className="flex items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-800">
          <Plus size={14} /> Create Meeting
        </button>
      </div>

      {/* 3-column board */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-600">Pending ({pending.length})</div>
          <div className="space-y-2">
            {pending.map((d) => <DecisionCard key={d.id} d={d} />)}
            {pending.length === 0 && <div className="rounded-lg border border-dashed border-neutral-200 p-4 text-center text-xs text-neutral-400">None</div>}
          </div>
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-blue-600">In Meeting ({inMeeting.length})</div>
          <div className="space-y-2">
            {inMeeting.map((d) => <DecisionCard key={d.id} d={d} />)}
            {inMeeting.length === 0 && <div className="rounded-lg border border-dashed border-neutral-200 p-4 text-center text-xs text-neutral-400">None</div>}
          </div>
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-emerald-600">Decided (30d) ({decided.length})</div>
          <div className="space-y-2">
            {decided.map((d) => <DecisionCard key={d.id} d={d} />)}
            {decided.length === 0 && <div className="rounded-lg border border-dashed border-neutral-200 p-4 text-center text-xs text-neutral-400">None</div>}
          </div>
        </div>
      </div>

      {/* Topic-scoped analytics */}
      {isTopicScoped && decisions.length > 0 && (
        <div className="mt-8">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">Domain Coverage</h3>
          <div className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="flex flex-wrap gap-2">
              {[...new Set(decisions.map((d) => d.domain_id).filter(Boolean))].map((domId) => (
                <span key={domId} className="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-700">
                  {domainMap.get(domId!) ?? domId} ({decisions.filter((d) => d.domain_id === domId).length})
                </span>
              ))}
            </div>
            <div className="mt-2 text-xs text-neutral-400">
              {new Set(decisions.map((d) => d.domain_id).filter(Boolean)).size} domains have submitted to this board
            </div>
          </div>
        </div>
      )}

      {/* Meetings */}
      {meetings.length > 0 && (
        <div className="mt-8">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">Meetings</h3>
          <div className="space-y-2">
            {meetings.map((m) => (
              <button key={m.id} onClick={() => onNavigate({ page: "arb-detail", id: m.id })} className="flex w-full items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3 text-left hover:border-neutral-300">
                <div>
                  <div className="text-sm font-medium">{m.title}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-neutral-400">
                    <Calendar size={10} /> {new Date(m.scheduled_at).toLocaleDateString()}
                    <span>{m.meeting_agenda_items?.length ?? 0} items</span>
                    <span className={`rounded px-1.5 py-0.5 ${m.status === "completed" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}>{m.status}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Create meeting modal */}
      {showCreateMeeting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="border-b border-neutral-200 px-6 py-4"><h2 className="text-lg font-semibold">Create Meeting for {board.name}</h2></div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Title *</label>
                <input value={meetingTitle} onChange={(e) => setMeetingTitle(e.target.value)} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" placeholder="e.g. ARB Meeting — April 2026" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Date & Time *</label>
                <input type="datetime-local" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Select Decisions ({selectedIds.size})</label>
                <div className="max-h-48 overflow-y-auto space-y-1.5">
                  {pending.map((d) => <DecisionCard key={d.id} d={d} selectable />)}
                  {pending.length === 0 && <div className="text-xs text-neutral-400">No pending decisions</div>}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-neutral-200 px-6 py-4">
              <button onClick={() => setShowCreateMeeting(false)} className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">Cancel</button>
              <button onClick={createMeeting} disabled={creating || !meetingTitle || !meetingDate || selectedIds.size === 0} className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-50">
                {creating ? "Creating..." : `Create (${selectedIds.size} items)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
