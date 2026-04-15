"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Loader2, Search, AlertTriangle, Clock, CheckCircle, X, ShieldCheck, User, Users } from "lucide-react";
import { DEVIATION_STATUS_LABELS, DEVIATION_SOURCE_LABELS } from "@/lib/truly-govern/constants";
import type { GovernanceView } from "@/lib/truly-govern/governance-views";

interface DeviationRow {
  id: string; source_type: string; title: string; severity: string; status: string;
  service_name: string | null; domain_id: string | null; owner_id: string | null;
  due_date: string | null; expiry_date: string | null; debt_score: number;
  escalation_level: number; created_at: string; resolution_evidence: string | null;
}

interface Summary { open: number; overdue: number; expiring: number; resolved_this_month: number }
interface DomainOption { id: string; name: string }

interface DeviationRegisterProps { onNavigate: (view: GovernanceView) => void }

const SOURCE_COLORS: Record<string, string> = { condition: "bg-blue-50 text-blue-700", waiver: "bg-amber-50 text-amber-700", exception: "bg-red-50 text-red-700" };
const SEVERITY_COLORS: Record<string, string> = { critical: "bg-red-50 text-red-700", high: "bg-orange-50 text-orange-700", medium: "bg-amber-50 text-amber-700", low: "bg-blue-50 text-blue-700" };
const STATUS_COLORS: Record<string, string> = { open: "bg-blue-50 text-blue-700", pending_verification: "bg-amber-50 text-amber-700", overdue: "bg-red-50 text-red-700", expiring: "bg-amber-50 text-amber-700", expired: "bg-red-100 text-red-800", resolved: "bg-emerald-50 text-emerald-700", renewed: "bg-purple-50 text-purple-700" };
const STATUS_ICONS: Record<string, React.ReactNode> = {
  overdue: <AlertTriangle size={10} />,
  expiring: <Clock size={10} />,
  resolved: <CheckCircle size={10} />,
};

type SortField = "title" | "severity" | "status" | "debt_score" | "created_at";

function relativeDueDate(date: string | null, status: string): { text: string; color: string } {
  if (!date) return { text: "—", color: "text-neutral-400" };
  const days = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, color: "text-red-600 font-medium" };
  if (days === 0) return { text: "Due today", color: "text-red-600 font-medium" };
  if (days <= 7) return { text: `${days}d left`, color: "text-amber-600" };
  return { text: new Date(date).toLocaleDateString(), color: "text-neutral-400" };
}

export default function DeviationRegister({ onNavigate }: DeviationRegisterProps) {
  const [deviations, setDeviations] = useState<DeviationRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [domains, setDomains] = useState<DomainOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [ownerMap, setOwnerMap] = useState<Map<string, string>>(new Map());

  // Filters
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [filterDomain, setFilterDomain] = useState("all");
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("debt_score");
  const [sortAsc, setSortAsc] = useState(false);

  // Detail slide-over
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resolveReason, setResolveReason] = useState("");
  const [showResolveForm, setShowResolveForm] = useState(false);

  // Fetch current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setCurrentUserId(data.user.id);
    });
  }, []);

  // Load deviations + summary
  const loadData = useCallback(async () => {
    if (!currentUserId) return;
    setLoading(true);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    const ownerParam = scope === "mine" ? `&owner_id=${currentUserId}` : "";

    const [devRes, sumRes] = await Promise.all([
      fetch(`/api/truly-govern/deviations?limit=200${ownerParam}`, { headers }).then(r => r.json()),
      fetch(`/api/truly-govern/deviations/summary?${ownerParam.replace("&", "")}`, { headers }).then(r => r.json()),
    ]);
    setDeviations(devRes.data ?? []);
    setSummary(sumRes);

    // Load domains
    const { data: doms } = await supabase.from("capability_domains").select("id, name").order("name");
    setDomains(doms ?? []);

    // Resolve owner names for "all" scope
    if (scope === "all") {
      const ownerIds = [...new Set((devRes.data ?? []).map((d: DeviationRow) => d.owner_id).filter(Boolean))];
      if (ownerIds.length > 0) {
        const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", ownerIds);
        setOwnerMap(new Map((profiles ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name || "Unknown"])));
      }
    }

    setLoading(false);
  }, [currentUserId, scope]);

  useEffect(() => { loadData(); }, [loadData]);

  const domainMap = new Map(domains.map(d => [d.id, d.name]));

  const filtered = useMemo(() => {
    let result = deviations;
    if (filterStatus !== "all") result = result.filter(d => d.status === filterStatus);
    if (filterType !== "all") result = result.filter(d => d.source_type === filterType);
    if (filterSeverity !== "all") result = result.filter(d => d.severity === filterSeverity);
    if (filterDomain !== "all") result = result.filter(d => d.domain_id === filterDomain);
    if (search) { const q = search.toLowerCase(); result = result.filter(d => d.title.toLowerCase().includes(q) || (d.service_name ?? "").toLowerCase().includes(q)); }
    return [...result].sort((a, b) => {
      if (a.status === "overdue" && b.status !== "overdue") return -1;
      if (b.status === "overdue" && a.status !== "overdue") return 1;
      const av = (a[sortField] ?? "") as string | number;
      const bv = (b[sortField] ?? "") as string | number;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortAsc ? cmp : -cmp;
    });
  }, [deviations, filterStatus, filterType, filterSeverity, filterDomain, search, sortField, sortAsc]);

  const selected = selectedId ? deviations.find(d => d.id === selectedId) : null;

  function toggleSort(field: SortField) { if (sortField === field) setSortAsc(!sortAsc); else { setSortField(field); setSortAsc(true); } }
  function SortHeader({ field, label, className }: { field: SortField; label: string; className?: string }) {
    return <th onClick={() => toggleSort(field)} className={`cursor-pointer select-none px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500 hover:text-neutral-700 ${className ?? ""}`}>{label} {sortField === field ? (sortAsc ? "↑" : "↓") : ""}</th>;
  }

  async function overrideResolve(id: string, reason: string) {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    await fetch("/api/truly-govern/deviations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id, action: "override-resolve", reason }),
    });
    setDeviations(prev => prev.map(d => d.id === id ? { ...d, status: "resolved" } : d));
    setSelectedId(null);
    setShowResolveForm(false);
    setResolveReason("");
  }

  if (loading) return <div className="flex items-center gap-2 text-sm text-neutral-500"><Loader2 size={16} className="animate-spin" /> Loading deviations...</div>;

  return (
    <div>
      {/* (A) Header with scope toggle */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Deviations & Waivers</h1>
          <p className="text-sm text-neutral-500">Track conditions, waivers, and exceptions from governance reviews</p>
        </div>
        <div className="flex rounded-lg border border-neutral-200 bg-neutral-100 p-0.5">
          <button
            onClick={() => { setScope("mine"); setFilterStatus("all"); }}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-all ${scope === "mine" ? "bg-white font-medium text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-700"}`}
          >
            <User size={14} /> My Deviations
          </button>
          <button
            onClick={() => { setScope("all"); setFilterStatus("all"); }}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-all ${scope === "all" ? "bg-white font-medium text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-700"}`}
          >
            <Users size={14} /> All Deviations
          </button>
        </div>
      </div>

      {/* (B) Summary cards */}
      {summary && (
        <div className="mb-6 grid grid-cols-4 gap-4">
          <button onClick={() => setFilterStatus(filterStatus === "open" ? "all" : "open")} className={`rounded-lg border p-4 text-left transition-colors ${filterStatus === "open" ? "border-neutral-900 ring-1 ring-neutral-900" : "border-neutral-200 bg-white hover:border-neutral-300"}`}>
            <div className="text-xs font-medium uppercase text-neutral-400">Needs Action</div>
            <div className="mt-1 text-2xl font-semibold">{summary.open}</div>
          </button>
          <button onClick={() => setFilterStatus(filterStatus === "overdue" ? "all" : "overdue")} className={`rounded-lg border p-4 text-left transition-colors ${filterStatus === "overdue" ? "border-red-500 ring-1 ring-red-500" : summary.overdue > 0 ? "border-red-200 bg-red-50 hover:border-red-300" : "border-neutral-200 bg-white hover:border-neutral-300"}`}>
            <div className="text-xs font-medium uppercase text-neutral-400">Overdue</div>
            <div className={`mt-1 text-2xl font-semibold ${summary.overdue > 0 ? "text-red-700" : ""}`}>{summary.overdue}</div>
          </button>
          <button onClick={() => setFilterStatus(filterStatus === "expiring" ? "all" : "expiring")} className={`rounded-lg border p-4 text-left transition-colors ${filterStatus === "expiring" ? "border-amber-500 ring-1 ring-amber-500" : summary.expiring > 0 ? "border-amber-200 bg-amber-50 hover:border-amber-300" : "border-neutral-200 bg-white hover:border-neutral-300"}`}>
            <div className="text-xs font-medium uppercase text-neutral-400">Expiring Soon</div>
            <div className={`mt-1 text-2xl font-semibold ${summary.expiring > 0 ? "text-amber-700" : ""}`}>{summary.expiring}</div>
          </button>
          <div className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="text-xs font-medium uppercase text-neutral-400">Resolved (month)</div>
            <div className="mt-1 text-2xl font-semibold text-emerald-600">{summary.resolved_this_month}</div>
          </div>
        </div>
      )}

      {/* (C) Toolbar */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-2.5 text-neutral-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by title or service..." className="w-full rounded-md border border-neutral-300 py-2 pl-9 pr-3 text-sm" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
          <option value="all">All statuses</option>
          {Object.entries(DEVIATION_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
          <option value="all">All types</option>
          {Object.entries(DEVIATION_SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)} className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
          <option value="all">All severities</option>
          {["critical", "high", "medium", "low"].map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
        </select>
        {domains.length > 0 && (
          <select value={filterDomain} onChange={e => setFilterDomain(e.target.value)} className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
            <option value="all">All domains</option>
            {domains.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}
        <div className="flex-1" />
        <span className="text-xs text-neutral-400">{filtered.length} items</span>
      </div>

      {/* (D) Table */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 p-12 text-center">
          <ShieldCheck size={32} className="mx-auto mb-3 text-emerald-300" />
          <div className="text-sm font-medium text-neutral-700">
            {scope === "mine" ? "You have no outstanding deviations" : "No deviations match the current filters"}
          </div>
          <div className="mt-1 text-xs text-neutral-400">
            {scope === "mine" ? "All your governance obligations are clear." : "Try adjusting your filters."}
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <table className="w-full">
            <thead className="border-b border-neutral-200 bg-neutral-50">
              <tr>
                <SortHeader field="title" label="Title" className="w-[35%]" />
                <SortHeader field="severity" label="Severity" />
                <SortHeader field="status" label="Status" />
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Service / Domain</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Due</th>
                <SortHeader field="debt_score" label="Debt" />
                {scope === "all" && <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Owner</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 bg-white">
              {filtered.map(d => {
                const due = relativeDueDate(d.due_date ?? d.expiry_date, d.status);
                const isResolved = d.status === "resolved";
                const rowAccent = d.status === "overdue" ? "border-l-2 border-l-red-400" : d.status === "expiring" ? "border-l-2 border-l-amber-400" : "";
                return (
                  <tr key={d.id} onClick={() => setSelectedId(d.id)} className={`cursor-pointer transition-colors hover:bg-neutral-50 ${rowAccent} ${isResolved ? "opacity-60" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-neutral-900 line-clamp-1">{d.title}</span>
                      </div>
                      <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${SOURCE_COLORS[d.source_type] ?? "bg-neutral-100"}`}>{DEVIATION_SOURCE_LABELS[d.source_type as keyof typeof DEVIATION_SOURCE_LABELS]}</span>
                    </td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${SEVERITY_COLORS[d.severity] ?? "bg-neutral-100"}`}>{d.severity}</span></td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[d.status] ?? "bg-neutral-100"}`}>
                        {STATUS_ICONS[d.status] ?? null}
                        {DEVIATION_STATUS_LABELS[d.status as keyof typeof DEVIATION_STATUS_LABELS] ?? d.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-neutral-700">{d.service_name ?? "—"}</div>
                      {d.domain_id && <div className="text-[10px] text-neutral-400">{domainMap.get(d.domain_id) ?? ""}</div>}
                    </td>
                    <td className="px-4 py-3"><span className={`text-xs ${due.color}`}>{due.text}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <div className="h-1.5 w-12 rounded-full bg-neutral-100 overflow-hidden">
                          <div className={`h-full rounded-full ${d.debt_score > 60 ? "bg-red-400" : d.debt_score > 30 ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${Math.min(d.debt_score, 100)}%` }} />
                        </div>
                        <span className="text-xs font-mono text-neutral-500">{d.debt_score}</span>
                      </div>
                    </td>
                    {scope === "all" && (
                      <td className="px-4 py-3"><span className="text-xs text-neutral-500">{d.owner_id ? ownerMap.get(d.owner_id) ?? "—" : "—"}</span></td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail slide-over */}
      {selected && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => { setSelectedId(null); setShowResolveForm(false); }} />
          <div className="fixed inset-y-0 right-0 z-50 w-[560px] overflow-y-auto bg-white shadow-xl transition-transform">
            <div className="border-b border-neutral-200 px-6 py-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold">Deviation Detail</h3>
                <button onClick={() => { setSelectedId(null); setShowResolveForm(false); }} className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100"><X size={16} /></button>
              </div>
              <p className="text-sm text-neutral-700">{selected.title}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${SOURCE_COLORS[selected.source_type]}`}>{DEVIATION_SOURCE_LABELS[selected.source_type as keyof typeof DEVIATION_SOURCE_LABELS]}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${SEVERITY_COLORS[selected.severity]}`}>{selected.severity}</span>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[selected.status]}`}>
                  {STATUS_ICONS[selected.status] ?? null}
                  {DEVIATION_STATUS_LABELS[selected.status as keyof typeof DEVIATION_STATUS_LABELS]}
                </span>
              </div>
            </div>

            <div className="px-6 py-4 space-y-4">
              {/* Metadata grid */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-medium uppercase text-neutral-400">Service</div>
                  <div className="mt-0.5 text-sm">{selected.service_name ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs font-medium uppercase text-neutral-400">Domain</div>
                  <div className="mt-0.5 text-sm">{selected.domain_id ? domainMap.get(selected.domain_id) ?? "—" : "—"}</div>
                </div>
                <div>
                  <div className="text-xs font-medium uppercase text-neutral-400">Owner</div>
                  <div className="mt-0.5 text-sm">{selected.owner_id ? ownerMap.get(selected.owner_id) ?? "—" : "—"}</div>
                </div>
                <div>
                  <div className="text-xs font-medium uppercase text-neutral-400">Created</div>
                  <div className="mt-0.5 text-sm">{new Date(selected.created_at).toLocaleDateString()}</div>
                </div>
                <div>
                  <div className="text-xs font-medium uppercase text-neutral-400">Due Date</div>
                  <div className="mt-0.5 text-sm">{selected.due_date ? new Date(selected.due_date).toLocaleDateString() : "—"}</div>
                </div>
                <div>
                  <div className="text-xs font-medium uppercase text-neutral-400">Expiry Date</div>
                  <div className="mt-0.5 text-sm">{selected.expiry_date ? new Date(selected.expiry_date).toLocaleDateString() : "—"}</div>
                </div>
              </div>

              {/* Debt score bar */}
              <div>
                <div className="text-xs font-medium uppercase text-neutral-400 mb-1">Debt Score</div>
                <div className="flex items-center gap-3">
                  <div className="h-2 flex-1 rounded-full bg-neutral-100 overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${selected.debt_score > 60 ? "bg-red-400" : selected.debt_score > 30 ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${Math.min(selected.debt_score, 100)}%` }} />
                  </div>
                  <span className="text-sm font-mono font-medium">{selected.debt_score}</span>
                </div>
              </div>

              {/* Escalation */}
              {selected.escalation_level > 0 && (
                <div>
                  <div className="text-xs font-medium uppercase text-neutral-400 mb-1">Escalation Level</div>
                  <div className="flex gap-1">
                    {[1, 2, 3].map(level => (
                      <div key={level} className={`h-2 w-8 rounded-full ${level <= selected.escalation_level ? "bg-red-400" : "bg-neutral-200"}`} />
                    ))}
                    <span className="ml-2 text-xs text-neutral-500">Level {selected.escalation_level}</span>
                  </div>
                </div>
              )}

              {/* Resolution evidence */}
              {selected.resolution_evidence && (
                <div>
                  <div className="text-xs font-medium uppercase text-neutral-400 mb-1">Resolution Evidence</div>
                  <div className="rounded-md bg-neutral-50 p-3 text-sm text-neutral-600">{selected.resolution_evidence}</div>
                </div>
              )}

              {/* Actions */}
              {selected.status !== "resolved" && (
                <div className="border-t border-neutral-200 pt-4">
                  {!showResolveForm ? (
                    <button
                      onClick={() => setShowResolveForm(true)}
                      className="w-full rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
                    >
                      Mark Resolved
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <div className="text-sm font-medium">Resolve Deviation</div>
                      <textarea
                        value={resolveReason}
                        onChange={e => setResolveReason(e.target.value)}
                        rows={3}
                        placeholder="Describe the resolution or provide evidence..."
                        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                      />
                      <div className="flex gap-2">
                        <button onClick={() => { setShowResolveForm(false); setResolveReason(""); }} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">Cancel</button>
                        <button
                          onClick={() => { if (resolveReason.trim()) overrideResolve(selected.id, resolveReason); }}
                          disabled={!resolveReason.trim()}
                          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
                        >
                          Confirm Resolution
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
