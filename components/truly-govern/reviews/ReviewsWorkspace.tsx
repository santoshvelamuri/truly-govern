"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Plus, Loader2, Clock } from "lucide-react";
import { REVIEW_STATUS_LABELS, RISK_COLORS } from "@/lib/truly-govern/constants";
import type { GovernanceView } from "@/lib/truly-govern/governance-views";

interface ReviewRow {
  id: string;
  title: string;
  status: string;
  risk_level: string | null;
  domain_id: string | null;
  tech_stack: string[];
  created_at: string;
  updated_at: string;
  review_items: { id: string; severity: string; status: string; is_violation: boolean }[];
}

interface DomainOption { id: string; name: string }

interface ReviewsWorkspaceProps {
  onNavigate: (view: GovernanceView) => void;
}

function daysBetween(a: string, b: string): number {
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-neutral-100 text-neutral-600",
  submitted: "bg-amber-50 text-amber-700",
  self_assessment: "bg-purple-50 text-purple-700",
  in_review: "bg-blue-50 text-blue-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
  deferred: "bg-neutral-100 text-neutral-500",
};

type SortField = "title" | "status" | "risk_level" | "created_at";

export default function ReviewsWorkspace({ onNavigate }: ReviewsWorkspaceProps) {
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [domains, setDomains] = useState<DomainOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterRisk, setFilterRisk] = useState("all");
  const [filterDomain, setFilterDomain] = useState("all");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
      if (!profile) return;
      const orgId = profile.org_id;

      const [revRes, domRes] = await Promise.all([
        supabase
          .from("reviews")
          .select("*, review_items(id, severity, status, is_violation)")
          .eq("org_id", orgId)
          .order("created_at", { ascending: false }),
        supabase
          .from("capability_domains")
          .select("id, name")
          .eq("org_id", orgId)
          .eq("archived", false)
          .order("name"),
      ]);

      setReviews(revRes.data ?? []);
      setDomains(domRes.data ?? []);
      setLoading(false);
    }
    load();
  }, []);

  const now = new Date().toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  const filtered = useMemo(() => {
    let result = reviews.filter((r) => {
      if (filterStatus !== "all" && r.status !== filterStatus) return false;
      if (filterRisk !== "all" && r.risk_level !== filterRisk) return false;
      if (filterDomain !== "all" && r.domain_id !== filterDomain) return false;
      return true;
    });
    result = [...result].sort((a, b) => {
      const av = (a[sortField] ?? "") as string;
      const bv = (b[sortField] ?? "") as string;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortAsc ? cmp : -cmp;
    });
    return result;
  }, [reviews, filterStatus, filterRisk, filterDomain, sortField, sortAsc]);

  const stats = useMemo(() => {
    const openReviews = reviews.filter((r) => r.status === "submitted" || r.status === "in_review" || r.status === "pending").length;
    const recentCompleted = reviews.filter((r) => (r.status === "approved" || r.status === "rejected") && r.updated_at >= thirtyDaysAgo);
    const avgReviewDays = recentCompleted.length > 0
      ? Math.round(recentCompleted.reduce((sum, r) => sum + daysBetween(r.created_at, r.updated_at), 0) / recentCompleted.length)
      : 0;
    const recentDecided = reviews.filter((r) => r.updated_at >= thirtyDaysAgo && (r.status === "approved" || r.status === "rejected"));
    const approvalRate = recentDecided.length > 0
      ? Math.round((recentDecided.filter((r) => r.status === "approved").length / recentDecided.length) * 100)
      : 0;
    const overdue = reviews.filter((r) => r.status === "in_review" && daysBetween(r.created_at, now) > 14).length;
    return { openReviews, avgReviewDays, approvalRate, overdue };
  }, [reviews, thirtyDaysAgo, now]);

  function toggleSort(field: SortField) {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(true); }
  }

  function SortHeader({ field, label, className }: { field: SortField; label: string; className?: string }) {
    return (
      <th onClick={() => toggleSort(field)} className={`cursor-pointer select-none px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500 hover:text-neutral-700 ${className ?? ""}`}>
        {label} {sortField === field ? (sortAsc ? "↑" : "↓") : ""}
      </th>
    );
  }

  if (loading) return <div className="flex items-center gap-2 text-sm text-neutral-500"><Loader2 size={16} className="animate-spin" /> Loading reviews...</div>;

  const domainMap = new Map(domains.map((d) => [d.id, d.name]));

  return (
    <div>
      {/* Stats row */}
      <div className="mb-6 grid grid-cols-4 gap-4">
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <div className="text-xs font-medium uppercase text-neutral-400">Open Reviews</div>
          <div className="mt-1 text-2xl font-semibold">{stats.openReviews}</div>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <div className="text-xs font-medium uppercase text-neutral-400">Avg Review Time (30d)</div>
          <div className="mt-1 text-2xl font-semibold">{stats.avgReviewDays} <span className="text-sm text-neutral-400">days</span></div>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <div className="text-xs font-medium uppercase text-neutral-400">Approval Rate (30d)</div>
          <div className="mt-1 text-2xl font-semibold">{stats.approvalRate}%</div>
        </div>
        <div className={`rounded-lg border p-4 ${stats.overdue > 0 ? "border-amber-200 bg-amber-50" : "border-neutral-200 bg-white"}`}>
          <div className="text-xs font-medium uppercase text-neutral-400">Overdue (&gt;14d)</div>
          <div className={`mt-1 text-2xl font-semibold ${stats.overdue > 0 ? "text-amber-700" : ""}`}>{stats.overdue}</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex items-center gap-3">
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
          <option value="all">All statuses</option>
          {Object.entries(REVIEW_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterRisk} onChange={(e) => setFilterRisk(e.target.value)} className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
          <option value="all">All risk levels</option>
          {["low", "medium", "high", "critical"].map((r) => <option key={r} value={r} className="capitalize">{r}</option>)}
        </select>
        {domains.length > 0 && (
          <select value={filterDomain} onChange={(e) => setFilterDomain(e.target.value)} className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
            <option value="all">All domains</option>
            {domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}
        <div className="flex-1" />
        <span className="text-xs text-neutral-400">{filtered.length} review{filtered.length !== 1 ? "s" : ""}</span>
        <button onClick={() => onNavigate({ page: "reviews-new" })} className="flex items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-2 text-sm text-white hover:bg-neutral-800">
          <Plus size={14} /> New Review
        </button>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
          No reviews yet.
          <div className="mt-3">
            <button onClick={() => onNavigate({ page: "reviews-new" })} className="text-neutral-700 underline">Submit your first design review</button>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <table className="w-full">
            <thead className="border-b border-neutral-200 bg-neutral-50">
              <tr>
                <SortHeader field="title" label="Title" className="w-[30%]" />
                <SortHeader field="status" label="Status" />
                <SortHeader field="risk_level" label="Risk" />
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Domain</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Items</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Waiting</th>
                <SortHeader field="created_at" label="Created" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 bg-white">
              {filtered.map((r) => {
                const itemCount = r.review_items?.length ?? 0;
                const mandatoryPending = (r.review_items ?? []).filter((i) => i.severity === "blocking" && (i.status === "open" || i.status === "failed")).length;
                const waitingDays = (r.status === "in_review" || r.status === "submitted") ? daysBetween(r.created_at, now) : 0;
                const isOverdue = waitingDays > 14;
                const statusLabel = REVIEW_STATUS_LABELS[r.status as keyof typeof REVIEW_STATUS_LABELS] ?? r.status;

                return (
                  <tr
                    key={r.id}
                    onClick={() => onNavigate({ page: "reviews-detail", id: r.id })}
                    className={`cursor-pointer transition-colors hover:bg-neutral-50 ${isOverdue ? "bg-amber-50/30" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-neutral-900">{r.title}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[r.status] ?? "bg-neutral-100 text-neutral-600"}`}>
                        {statusLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {r.risk_level ? (
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${RISK_COLORS[r.risk_level as keyof typeof RISK_COLORS] ?? "bg-neutral-100"}`}>
                          {r.risk_level}
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-neutral-500">{r.domain_id ? domainMap.get(r.domain_id) ?? "—" : "—"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-neutral-500">
                        {itemCount > 0 ? `${itemCount}${mandatoryPending > 0 ? ` (${mandatoryPending} blocking)` : ""}` : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {waitingDays > 0 ? (
                        <span className={`flex items-center gap-1 text-xs ${isOverdue ? "font-medium text-amber-600" : "text-neutral-400"}`}>
                          <Clock size={10} /> {waitingDays}d
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-neutral-400">{new Date(r.created_at).toLocaleDateString()}</span>
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
