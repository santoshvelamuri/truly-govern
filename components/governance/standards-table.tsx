"use client";

import { useState } from "react";
import type { StandardPolicy } from "@/types/standard-policy";

type SortKey = "policy_id" | "domain" | "subdomain" | "rule_statement" | "rule_severity" | "status" | "source_section";

interface SortState {
  key: SortKey;
  direction: "asc" | "desc";
}

const SEVERITY_RANK: Record<string, number> = { blocking: 3, warning: 2, advisory: 1 };
const STATUS_RANK: Record<string, number> = { active: 3, draft: 2, deprecated: 1 };

function severityBadge(severity: string) {
  const cls =
    severity === "blocking"
      ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
      : severity === "warning"
      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
      : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${cls}`}>
      {severity}
    </span>
  );
}

function statusBadge(status: string) {
  const cls =
    status === "active"
      ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
      : status === "approved"
      ? "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300"
      : status === "in_review"
      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
      : status === "deprecated"
      ? "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300"
      : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${cls}`}>
      {status === "in_review" ? "In Review" : status}
    </span>
  );
}

interface StandardsTableProps {
  policies: StandardPolicy[];
  selectedId: string | null;
  searchQuery: string;
  checkedIds: Set<string>;
  onSelect: (id: string) => void;
  onToggleCheck: (id: string) => void;
  onToggleAll: (ids: string[]) => void;
}

export function StandardsTable({ policies, selectedId, searchQuery, checkedIds, onSelect, onToggleCheck, onToggleAll }: StandardsTableProps) {
  const [sort, setSort] = useState<SortState>({ key: "policy_id", direction: "asc" });

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key ? { key, direction: prev.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" },
    );
  }

  const query = searchQuery.toLowerCase();
  const filtered = policies.filter((p) => {
    if (!query) return true;
    return (
      p.policy_id.toLowerCase().includes(query) ||
      p.domain.toLowerCase().includes(query) ||
      p.subdomain.toLowerCase().includes(query) ||
      p.rule_statement.toLowerCase().includes(query) ||
      (p.source_section ?? "").toLowerCase().includes(query) ||
      p.tags.some((t) => t.toLowerCase().includes(query))
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    const dir = sort.direction === "asc" ? 1 : -1;
    const key = sort.key;
    if (key === "rule_severity") return dir * ((SEVERITY_RANK[a.rule_severity] ?? 0) - (SEVERITY_RANK[b.rule_severity] ?? 0));
    if (key === "status") return dir * ((STATUS_RANK[a.status] ?? 0) - (STATUS_RANK[b.status] ?? 0));
    const aVal = (a[key] ?? "").toString().toLowerCase();
    const bVal = (b[key] ?? "").toString().toLowerCase();
    return dir * aVal.localeCompare(bVal);
  });

  const arrow = (key: SortKey) => (sort.key === key ? (sort.direction === "asc" ? " ↑" : " ↓") : "");

  const headerClass =
    "cursor-pointer select-none whitespace-nowrap px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-auto">
        <table className="w-full min-w-[800px] border-collapse text-xs">
          <thead className="sticky top-0 z-10 border-b border-border/70 bg-surface-elevated/95 backdrop-blur">
            <tr>
              <th className="px-2 py-2">
                <input
                  type="checkbox"
                  checked={sorted.length > 0 && sorted.every((p) => checkedIds.has(p.id))}
                  onChange={() => onToggleAll(sorted.map((p) => p.id))}
                  className="h-3 w-3 accent-[var(--brand-primary)]"
                />
              </th>
              <th className={headerClass} onClick={() => toggleSort("policy_id")}>Policy ID{arrow("policy_id")}</th>
              <th className={headerClass} onClick={() => toggleSort("domain")}>Domain{arrow("domain")}</th>
              <th className={headerClass} onClick={() => toggleSort("subdomain")}>Subdomain{arrow("subdomain")}</th>
              <th className={`${headerClass} w-[40%]`} onClick={() => toggleSort("rule_statement")}>Statement{arrow("rule_statement")}</th>
              <th className={headerClass} onClick={() => toggleSort("rule_severity")}>Severity{arrow("rule_severity")}</th>
              <th className={headerClass} onClick={() => toggleSort("status")}>Status{arrow("status")}</th>
              <th className={headerClass} onClick={() => toggleSort("source_section")}>Source{arrow("source_section")}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const isSelected = p.id === selectedId;
              return (
                <tr
                  key={p.id}
                  onClick={() => onSelect(p.id)}
                  className={`cursor-pointer border-b border-border/40 transition-colors ${
                    isSelected
                      ? "bg-brand-primary/10 dark:bg-brand-primary/20"
                      : "hover:bg-muted/30"
                  }`}
                >
                  <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={checkedIds.has(p.id)}
                      onChange={() => onToggleCheck(p.id)}
                      className="h-3 w-3 accent-[var(--brand-primary)]"
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono font-medium text-foreground">{p.policy_id}</td>
                  <td className="whitespace-nowrap px-3 py-2 capitalize text-foreground/80">{p.domain}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-foreground/80">{p.subdomain}</td>
                  <td className="px-3 py-2 text-foreground/90">
                    <span className="line-clamp-2">{p.rule_statement}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{severityBadge(p.rule_severity)}</td>
                  <td className="whitespace-nowrap px-3 py-2">{statusBadge(p.status)}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-foreground/60">{p.source_section ?? "—"}</td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                  No policies found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
