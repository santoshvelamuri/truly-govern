"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Plus, Loader2, Search } from "lucide-react";
import { ADR_STATUS_LABELS } from "@/lib/truly-govern/constants";
import type { GovernanceView } from "@/lib/truly-govern/governance-views";

interface AdrRow {
  id: string;
  title: string;
  status: string;
  domain_id: string | null;
  decision: string;
  tags: string[];
  custom_fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface DomainOption { id: string; name: string }

interface AdrsWorkspaceProps {
  onNavigate: (view: GovernanceView) => void;
}

const STATUS_COLORS: Record<string, string> = {
  proposed: "bg-blue-50 text-blue-700",
  accepted: "bg-emerald-50 text-emerald-700",
  deprecated: "bg-neutral-100 text-neutral-500",
  superseded: "bg-amber-50 text-amber-700",
};

type SortField = "title" | "status" | "created_at";

export default function AdrsWorkspace({ onNavigate }: AdrsWorkspaceProps) {
  const [adrs, setAdrs] = useState<AdrRow[]>([]);
  const [domains, setDomains] = useState<DomainOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
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

      const [adrRes, domRes] = await Promise.all([
        supabase.from("adrs").select("*").eq("org_id", orgId).order("created_at", { ascending: false }),
        supabase.from("capability_domains").select("id, name").eq("org_id", orgId).eq("archived", false).order("name"),
      ]);
      setAdrs(adrRes.data ?? []);
      setDomains(domRes.data ?? []);
      setLoading(false);
    }
    load();
  }, []);

  const domainMap = new Map(domains.map((d) => [d.id, d.name]));

  const filtered = useMemo(() => {
    let result = adrs;
    if (filterStatus !== "all") result = result.filter((a) => a.status === filterStatus);
    if (filterDomain !== "all") result = result.filter((a) => a.domain_id === filterDomain);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((a) =>
        a.title.toLowerCase().includes(q) ||
        a.decision.toLowerCase().includes(q) ||
        a.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    result = [...result].sort((a, b) => {
      const av = a[sortField] ?? "";
      const bv = b[sortField] ?? "";
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortAsc ? cmp : -cmp;
    });
    return result;
  }, [adrs, filterStatus, filterDomain, search, sortField, sortAsc]);

  function toggleSort(field: SortField) {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(true); }
  }

  function SortHeader({ field, label, className }: { field: SortField; label: string; className?: string }) {
    return (
      <th
        onClick={() => toggleSort(field)}
        className={`cursor-pointer select-none px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500 hover:text-neutral-700 ${className ?? ""}`}
      >
        {label} {sortField === field ? (sortAsc ? "↑" : "↓") : ""}
      </th>
    );
  }

  if (loading) return <div className="flex items-center gap-2 text-sm text-neutral-500"><Loader2 size={16} className="animate-spin" /> Loading ADRs...</div>;

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-2.5 text-neutral-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ADRs..." className="w-full rounded-md border border-neutral-300 py-2 pl-9 pr-3 text-sm" />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
          <option value="all">All statuses</option>
          {Object.entries(ADR_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {domains.length > 0 && (
          <select value={filterDomain} onChange={(e) => setFilterDomain(e.target.value)} className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
            <option value="all">All domains</option>
            {domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}
        <div className="flex-1" />
        <span className="text-xs text-neutral-400">{filtered.length} ADR{filtered.length !== 1 ? "s" : ""}</span>
        <button onClick={() => onNavigate({ page: "adrs-new" })} className="flex items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-2 text-sm text-white hover:bg-neutral-800">
          <Plus size={14} /> New ADR
        </button>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
          No ADRs yet.
          <div className="mt-3">
            <button onClick={() => onNavigate({ page: "adrs-new" })} className="text-neutral-700 underline">Record your first decision</button>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <table className="w-full">
            <thead className="border-b border-neutral-200 bg-neutral-50">
              <tr>
                <SortHeader field="title" label="Title" className="w-[30%]" />
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500 w-[30%]">Decision</th>
                <SortHeader field="status" label="Status" />
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Domain</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Tags</th>
                <SortHeader field="created_at" label="Created" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 bg-white">
              {filtered.map((a) => {
                const statusLabel = ADR_STATUS_LABELS[a.status as keyof typeof ADR_STATUS_LABELS] ?? a.status;
                return (
                  <tr
                    key={a.id}
                    onClick={() => onNavigate({ page: "adrs-detail", id: a.id })}
                    className="cursor-pointer transition-colors hover:bg-neutral-50"
                  >
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-neutral-900">{a.title}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-neutral-600 line-clamp-2">{a.decision}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[a.status] ?? "bg-neutral-100"}`}>
                        {statusLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-neutral-500">{a.domain_id && domainMap.has(a.domain_id) ? domainMap.get(a.domain_id) : "—"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {a.tags.slice(0, 3).map((t) => <span key={t} className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500">{t}</span>)}
                        {a.tags.length > 3 && <span className="text-[10px] text-neutral-400">+{a.tags.length - 3}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-neutral-400">{new Date(a.created_at).toLocaleDateString()}</span>
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
