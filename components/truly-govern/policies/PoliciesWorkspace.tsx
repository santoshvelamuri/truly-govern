"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Search, Plus, Upload, Loader2 } from "lucide-react";
import { SEVERITY_COLORS, POLICY_STATUS_LABELS } from "@/lib/truly-govern/constants";
import type { Severity } from "@/lib/truly-govern/types";
import type { GovernanceView } from "@/lib/truly-govern/governance-views";
import ImportPolicyModal from "@/components/truly-govern/policies/ImportPolicyModal";

interface PolicyRow {
  id: string;
  policy_id: string;
  title: string | null;
  domain: string;
  tech_domain_id: string | null;
  subdomain: string;
  layer: string;
  mandatory: boolean;
  status: string;
  rule_statement: string;
  rule_severity: Severity;
  ingestion_status: string;
  tags: string[];
  updated_at: string;
}

interface TechDomainRow { id: string; name: string }

interface PoliciesWorkspaceProps {
  onNavigate: (view: GovernanceView) => void;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-blue-50 text-blue-700",
  in_review: "bg-amber-50 text-amber-700",
  approved: "bg-teal-50 text-teal-700",
  active: "bg-emerald-50 text-emerald-700",
  deprecated: "bg-neutral-100 text-neutral-500",
};

type SortField = "title" | "domain" | "status" | "rule_severity" | "updated_at";

export default function PoliciesWorkspace({ onNavigate }: PoliciesWorkspaceProps) {
  const [policies, setPolicies] = useState<PolicyRow[]>([]);
  const [techDomains, setTechDomains] = useState<TechDomainRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterDomain, setFilterDomain] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterMandatory, setFilterMandatory] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [sortField, setSortField] = useState<SortField>("updated_at");
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
      if (!profile) return;
      const orgId = profile.org_id;

      const [polRes, domRes] = await Promise.all([
        supabase.from("standard_policies").select("*").eq("org_id", orgId).order("policy_id"),
        supabase.from("technology_domains").select("id, name").eq("org_id", orgId).eq("archived", false).order("sort_order"),
      ]);
      setPolicies(polRes.data ?? []);
      setTechDomains(domRes.data ?? []);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = useMemo(() => {
    let result = policies;
    if (filterDomain !== "all") result = result.filter((p) => p.tech_domain_id === filterDomain);
    if (filterStatus !== "all") result = result.filter((p) => p.status === filterStatus);
    if (filterMandatory) result = result.filter((p) => p.mandatory);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((p) =>
        (p.title ?? "").toLowerCase().includes(q) ||
        p.rule_statement.toLowerCase().includes(q) ||
        p.policy_id.toLowerCase().includes(q),
      );
    }
    result = [...result].sort((a, b) => {
      const av = (a[sortField] ?? a.title ?? "") as string;
      const bv = (b[sortField] ?? b.title ?? "") as string;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortAsc ? cmp : -cmp;
    });
    return result;
  }, [policies, filterDomain, filterStatus, filterMandatory, search, sortField, sortAsc]);

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

  if (loading) return <div className="flex items-center gap-2 text-sm text-neutral-500"><Loader2 size={16} className="animate-spin" /> Loading policies...</div>;

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-2.5 text-neutral-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search policies..." className="w-full rounded-md border border-neutral-300 py-2 pl-9 pr-3 text-sm" />
        </div>
        <select value={filterDomain} onChange={(e) => setFilterDomain(e.target.value)} className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
          <option value="all">All domains</option>
          {techDomains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
          <option value="all">All statuses</option>
          {Object.entries(POLICY_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-neutral-600">
          <input type="checkbox" checked={filterMandatory} onChange={(e) => setFilterMandatory(e.target.checked)} className="rounded" />
          Mandatory
        </label>
        <div className="flex-1" />
        <span className="text-xs text-neutral-400">{filtered.length} of {policies.length}</span>
        <button onClick={() => setShowImport(true)} className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50">
          <Upload size={14} /> Import
        </button>
        <button onClick={() => onNavigate({ page: "policies-new" })} className="flex items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-2 text-sm text-white hover:bg-neutral-800">
          <Plus size={14} /> Author
        </button>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
          No policies found.
          <div className="mt-3 flex justify-center gap-3">
            <button onClick={() => setShowImport(true)} className="text-neutral-700 underline">Import from Confluence</button>
            <button onClick={() => onNavigate({ page: "policies-new" })} className="text-neutral-700 underline">Author a policy</button>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <table className="w-full">
            <thead className="border-b border-neutral-200 bg-neutral-50">
              <tr>
                <SortHeader field="title" label="Title" className="w-[30%]" />
                <SortHeader field="domain" label="Domain" />
                <SortHeader field="rule_severity" label="Severity" />
                <SortHeader field="status" label="Status" />
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Layer</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Mandatory</th>
                <SortHeader field="updated_at" label="Updated" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 bg-white">
              {filtered.map((p) => {
                const statusLabel = POLICY_STATUS_LABELS[p.status as keyof typeof POLICY_STATUS_LABELS] ?? p.status;
                return (
                  <tr
                    key={p.id}
                    onClick={() => onNavigate({ page: "policies-detail", id: p.id })}
                    className="cursor-pointer transition-colors hover:bg-neutral-50"
                  >
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-neutral-900">{p.title || p.policy_id}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-neutral-600">{p.domain || "—"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${SEVERITY_COLORS[p.rule_severity]}`}>
                        {p.rule_severity}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[p.status] ?? "bg-neutral-100 text-neutral-600"}`}>
                        {statusLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-neutral-500 capitalize">{p.layer}</span>
                    </td>
                    <td className="px-4 py-3">
                      {p.mandatory ? (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">Yes</span>
                      ) : (
                        <span className="text-xs text-neutral-400">No</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-neutral-400">{new Date(p.updated_at).toLocaleDateString()}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showImport && (
        <ImportPolicyModal
          onClose={() => setShowImport(false)}
          onImported={(id) => {
            setShowImport(false);
            if (id) {
              onNavigate({ page: "policies-detail", id });
            } else {
              onNavigate({ page: "policies" });
            }
          }}
        />
      )}
    </div>
  );
}
