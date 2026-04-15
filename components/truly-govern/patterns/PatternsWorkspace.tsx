"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Plus, Loader2, Search } from "lucide-react";
import { PATTERN_STATUS_LABELS } from "@/lib/truly-govern/constants";
import type { GovernanceView } from "@/lib/truly-govern/governance-views";

interface PatternRow {
  id: string; name: string; problem: string; status: string; domain_id: string | null;
  completeness_score: number | null; known_uses: string[]; updated_at: string;
  pattern_clauses: { id: string; clause_type: string }[];
  pattern_review_links: { id: string }[];
}

interface DomainOption { id: string; name: string }
interface PatternsWorkspaceProps { onNavigate: (view: GovernanceView) => void }

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-blue-50 text-blue-700", in_review: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700", deprecated: "bg-neutral-100 text-neutral-500",
};

type SortField = "name" | "status" | "completeness_score" | "updated_at";

export default function PatternsWorkspace({ onNavigate }: PatternsWorkspaceProps) {
  const [patterns, setPatterns] = useState<PatternRow[]>([]);
  const [domains, setDomains] = useState<DomainOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDomain, setFilterDomain] = useState("all");
  const [showDeprecated, setShowDeprecated] = useState(false);
  const [sortField, setSortField] = useState<SortField>("updated_at");
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    async function load() {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) return;
      const [patRes, domRes] = await Promise.all([
        fetch("/api/truly-govern/patterns", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
        supabase.from("capability_domains").select("id, name").order("name"),
      ]);
      setPatterns(patRes.data ?? []);
      setDomains(domRes.data ?? []);
      setLoading(false);
    }
    load();
  }, []);

  const domainMap = new Map(domains.map((d) => [d.id, d.name]));

  const filtered = useMemo(() => {
    let result = patterns;
    if (!showDeprecated) result = result.filter((p) => p.status !== "deprecated");
    if (filterStatus !== "all") result = result.filter((p) => p.status === filterStatus);
    if (filterDomain !== "all") result = result.filter((p) => filterDomain === "cross" ? !p.domain_id : p.domain_id === filterDomain);
    if (search) { const q = search.toLowerCase(); result = result.filter((p) => p.name.toLowerCase().includes(q) || p.problem.toLowerCase().includes(q)); }
    return [...result].sort((a, b) => {
      const av = (a[sortField] ?? "") as string | number;
      const bv = (b[sortField] ?? "") as string | number;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortAsc ? cmp : -cmp;
    });
  }, [patterns, filterStatus, filterDomain, showDeprecated, search, sortField, sortAsc]);

  function toggleSort(field: SortField) { if (sortField === field) setSortAsc(!sortAsc); else { setSortField(field); setSortAsc(true); } }
  function SortHeader({ field, label, className }: { field: SortField; label: string; className?: string }) {
    return <th onClick={() => toggleSort(field)} className={`cursor-pointer select-none px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500 hover:text-neutral-700 ${className ?? ""}`}>{label} {sortField === field ? (sortAsc ? "↑" : "↓") : ""}</th>;
  }

  if (loading) return <div className="flex items-center gap-2 text-sm text-neutral-500"><Loader2 size={16} className="animate-spin" /> Loading patterns...</div>;

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-2.5 text-neutral-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search patterns..." className="w-full rounded-md border border-neutral-300 py-2 pl-9 pr-3 text-sm" />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
          <option value="all">All statuses</option>
          {Object.entries(PATTERN_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterDomain} onChange={(e) => setFilterDomain(e.target.value)} className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
          <option value="all">All domains</option>
          <option value="cross">Cross-domain</option>
          {domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-neutral-600">
          <input type="checkbox" checked={showDeprecated} onChange={(e) => setShowDeprecated(e.target.checked)} className="rounded" /> Deprecated
        </label>
        <div className="flex-1" />
        <span className="text-xs text-neutral-400">{filtered.length} patterns</span>
        <button onClick={() => onNavigate({ page: "patterns-new" })} className="flex items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-2 text-sm text-white hover:bg-neutral-800">
          <Plus size={14} /> New Pattern
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
          No patterns yet. <button onClick={() => onNavigate({ page: "patterns-new" })} className="text-neutral-700 underline">Author your first pattern</button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <table className="w-full">
            <thead className="border-b border-neutral-200 bg-neutral-50">
              <tr>
                <SortHeader field="name" label="Title" className="w-[30%]" />
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Domain</th>
                <SortHeader field="status" label="Status" />
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Clauses</th>
                <SortHeader field="completeness_score" label="Completeness" />
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Usage</th>
                <SortHeader field="updated_at" label="Updated" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 bg-white">
              {filtered.map((p) => {
                const constraintCount = (p.pattern_clauses ?? []).filter((c) => c.clause_type === "constraint").length;
                const guidanceCount = (p.pattern_clauses ?? []).length - constraintCount;
                return (
                  <tr key={p.id} onClick={() => onNavigate({ page: "patterns-detail", id: p.id })} className="cursor-pointer transition-colors hover:bg-neutral-50">
                    <td className="px-4 py-3"><span className="text-sm font-medium text-neutral-900">{p.name}</span></td>
                    <td className="px-4 py-3"><span className="text-xs text-neutral-600">{p.domain_id ? domainMap.get(p.domain_id) ?? "—" : "Cross-domain"}</span></td>
                    <td className="px-4 py-3"><span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[p.status] ?? "bg-neutral-100"}`}>{PATTERN_STATUS_LABELS[p.status as keyof typeof PATTERN_STATUS_LABELS] ?? p.status}</span></td>
                    <td className="px-4 py-3"><span className="text-xs text-neutral-500">{constraintCount}C {guidanceCount}G</span></td>
                    <td className="px-4 py-3"><span className={`text-xs font-medium ${(p.completeness_score ?? 0) >= 60 ? "text-emerald-600" : "text-amber-600"}`}>{p.completeness_score ?? 0}%</span></td>
                    <td className="px-4 py-3"><span className="text-xs text-neutral-400">{p.pattern_review_links?.length ?? 0} reviews</span></td>
                    <td className="px-4 py-3"><span className="text-xs text-neutral-400">{new Date(p.updated_at).toLocaleDateString()}</span></td>
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
