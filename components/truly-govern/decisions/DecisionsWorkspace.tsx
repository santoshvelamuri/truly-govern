"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Plus, Loader2, User, Users } from "lucide-react";
import { DECISION_STATUS_LABELS, RISK_COLORS } from "@/lib/truly-govern/constants";
import type { GovernanceView } from "@/lib/truly-govern/governance-views";

interface DecisionRow {
  id: string;
  title: string;
  type: string;
  risk_level: string;
  status: string;
  routing_path: string | null;
  submitted_by: string;
  resolved_arb_board_id: string | null;
  created_at: string;
  updated_at: string;
  decision_options: { id: string }[];
  arb_boards: { id: string; name: string } | null;
}

interface BoardOption { id: string; name: string }

interface DecisionsWorkspaceProps {
  onNavigate: (view: GovernanceView) => void;
}

const TYPE_LABELS: Record<string, string> = {
  buy_build: "Buy vs Build",
  technology_adoption: "Technology Adoption",
  vendor_selection: "Vendor Selection",
  architecture_pattern: "Architecture Pattern",
  security_exception: "Security Exception",
  cross_domain: "Cross-Domain",
  strategic_principle: "Strategic Principle",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-neutral-100 text-neutral-600",
  submitted: "bg-amber-50 text-amber-700",
  in_review: "bg-purple-50 text-purple-700",
  decided: "bg-emerald-50 text-emerald-700",
};

export default function DecisionsWorkspace({ onNavigate }: DecisionsWorkspaceProps) {
  const [decisions, setDecisions] = useState<DecisionRow[]>([]);
  const [boards, setBoards] = useState<BoardOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterBoard, setFilterBoard] = useState("all");
  const [sortField, setSortField] = useState<"created_at" | "title" | "status" | "risk_level">("created_at");
  const [sortAsc, setSortAsc] = useState(false);

  // Fetch current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setCurrentUserId(data.user.id);
    });
  }, []);

  // Load decisions and boards
  const loadData = useCallback(async () => {
    if (!currentUserId) return;
    setLoading(true);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };

    const ownerParam = scope === "mine" ? `&submitted_by=${currentUserId}` : "";
    const [decRes, boardRes] = await Promise.all([
      fetch(`/api/truly-govern/decisions?limit=200${ownerParam}`, { headers }).then(r => r.json()),
      fetch("/api/truly-govern/boards", { headers }).then(r => r.json()),
    ]);

    setDecisions(decRes.data ?? []);
    setBoards((boardRes.data ?? []).map((b: { id: string; name: string }) => ({ id: b.id, name: b.name })));
    setLoading(false);
  }, [currentUserId, scope]);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = useMemo(() => {
    let result = decisions.filter((d) => {
      if (filterStatus !== "all" && d.status !== filterStatus) return false;
      if (filterType !== "all" && d.type !== filterType) return false;
      if (filterBoard !== "all" && d.resolved_arb_board_id !== filterBoard) return false;
      return true;
    });
    result = [...result].sort((a, b) => {
      const av = a[sortField] ?? "";
      const bv = b[sortField] ?? "";
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortAsc ? cmp : -cmp;
    });
    return result;
  }, [decisions, filterStatus, filterType, filterBoard, sortField, sortAsc]);

  function toggleSort(field: typeof sortField) {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(true); }
  }

  function SortHeader({ field, label, className }: { field: typeof sortField; label: string; className?: string }) {
    return (
      <th
        onClick={() => toggleSort(field)}
        className={`cursor-pointer select-none px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500 hover:text-neutral-700 ${className ?? ""}`}
      >
        {label} {sortField === field ? (sortAsc ? "↑" : "↓") : ""}
      </th>
    );
  }

  if (loading) return <div className="flex items-center gap-2 text-sm text-neutral-500"><Loader2 size={16} className="animate-spin" /> Loading...</div>;

  return (
    <div>
      {/* Header with scope toggle */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Decision Requests</h1>
          <p className="text-sm text-neutral-500">Track architecture and technology decision requests</p>
        </div>
        <div className="flex rounded-lg border border-neutral-200 bg-neutral-100 p-0.5">
          <button
            onClick={() => { setScope("mine"); setFilterBoard("all"); }}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-all ${scope === "mine" ? "bg-white font-medium text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-700"}`}
          >
            <User size={14} /> My Requests
          </button>
          <button
            onClick={() => { setScope("all"); setFilterBoard("all"); }}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-all ${scope === "all" ? "bg-white font-medium text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-700"}`}
          >
            <Users size={14} /> All Requests
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex items-center gap-3">
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
          <option value="all">All statuses</option>
          {Object.entries(DECISION_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
          <option value="all">All types</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {boards.length > 0 && (
          <select value={filterBoard} onChange={(e) => setFilterBoard(e.target.value)} className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
            <option value="all">All boards</option>
            {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        <div className="flex-1" />
        <span className="text-xs text-neutral-400">{filtered.length} request{filtered.length !== 1 ? "s" : ""}</span>
        <button onClick={() => onNavigate({ page: "decisions-new" })} className="flex items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-2 text-sm text-white hover:bg-neutral-800">
          <Plus size={14} /> New Request
        </button>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
          {scope === "mine" ? "You have no decision requests." : "No decision requests match the current filters."}
          <div className="mt-3">
            <button onClick={() => onNavigate({ page: "decisions-new" })} className="text-neutral-700 underline">Submit your first decision request</button>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <table className="w-full">
            <thead className="border-b border-neutral-200 bg-neutral-50">
              <tr>
                <SortHeader field="title" label="Title" className="w-[30%]" />
                <SortHeader field="status" label="Status" />
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Type</th>
                <SortHeader field="risk_level" label="Risk" />
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Board</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Options</th>
                <SortHeader field="created_at" label="Created" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 bg-white">
              {filtered.map((d) => {
                const statusLabel = DECISION_STATUS_LABELS[d.status as keyof typeof DECISION_STATUS_LABELS] ?? d.status;
                const boardName = d.arb_boards?.name ?? null;
                return (
                  <tr
                    key={d.id}
                    onClick={() => onNavigate({ page: "decisions-detail", id: d.id })}
                    className="cursor-pointer transition-colors hover:bg-neutral-50"
                  >
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-neutral-900">{d.title}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[d.status] ?? "bg-neutral-100 text-neutral-600"}`}>
                        {statusLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-neutral-600">{TYPE_LABELS[d.type] ?? d.type}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${RISK_COLORS[d.risk_level as keyof typeof RISK_COLORS] ?? "bg-neutral-100"}`}>
                        {d.risk_level}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {boardName ? (
                        <span className="inline-block rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700">
                          {boardName}
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-neutral-500">{d.decision_options?.length ?? 0}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-neutral-400">{new Date(d.created_at).toLocaleDateString()}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
