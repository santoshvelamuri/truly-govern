"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Check, Minus } from "lucide-react";
import { SEVERITY_COLORS } from "@/lib/truly-govern/constants";
import type { Severity } from "@/lib/truly-govern/types";

export interface PreviewClause {
  heading: string;
  content: string;
  severity: string;
}

export interface PreviewPolicy {
  policy_id: string;
  domain: string;
  tech_domain_id: string | null;
  subdomain: string;
  tags: string[];
  rule_statement: string;
  rule_rationale: string;
  rule_severity: string;
  rule_examples?: Record<string, unknown>;
  scope?: Record<string, unknown>;
  remediation_hint: string;
  remediation_docs_url?: string | null;
  provenance?: Record<string, unknown>;
  source_document: string;
  source_section?: string | null;
  clauses: PreviewClause[];
  // editable title derived from policy_id or added during preview
  title?: string;
}

interface Props {
  policies: PreviewPolicy[];
  onConfirm: (selected: PreviewPolicy[]) => void;
  onCancel: () => void;
  loading?: boolean;
}

export default function ImportPreviewTable({ policies: initialPolicies, onConfirm, onCancel, loading }: Props) {
  const [policies, setPolicies] = useState<PreviewPolicy[]>(initialPolicies);
  const [selected, setSelected] = useState<Set<number>>(() => new Set(initialPolicies.map((_, i) => i)));
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const allSelected = selected.size === policies.length;
  const noneSelected = selected.size === 0;

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(policies.map((_, i) => i)));
    }
  }

  function toggleOne(idx: number) {
    const next = new Set(selected);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setSelected(next);
  }

  function toggleExpand(idx: number) {
    const next = new Set(expanded);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setExpanded(next);
  }

  function updatePolicy(idx: number, field: keyof PreviewPolicy, value: string) {
    const next = [...policies];
    next[idx] = { ...next[idx], [field]: value };
    setPolicies(next);
  }

  function updateClause(pIdx: number, cIdx: number, field: keyof PreviewClause, value: string) {
    const next = [...policies];
    const clauses = [...next[pIdx].clauses];
    clauses[cIdx] = { ...clauses[cIdx], [field]: value };
    next[pIdx] = { ...next[pIdx], clauses };
    setPolicies(next);
  }

  function removeClause(pIdx: number, cIdx: number) {
    const next = [...policies];
    next[pIdx] = { ...next[pIdx], clauses: next[pIdx].clauses.filter((_, i) => i !== cIdx) };
    setPolicies(next);
  }

  function addClause(pIdx: number) {
    const next = [...policies];
    next[pIdx] = {
      ...next[pIdx],
      clauses: [...next[pIdx].clauses, { heading: "", content: "", severity: "warning" }],
    };
    setPolicies(next);
  }

  function handleConfirm() {
    const selectedPolicies = policies.filter((_, i) => selected.has(i));
    onConfirm(selectedPolicies);
  }

  return (
    <div className="flex flex-col">
      {/* Header with select all and count */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={toggleAll}
            className={`flex h-5 w-5 items-center justify-center rounded border ${
              allSelected ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300"
            }`}
          >
            {allSelected ? <Check size={12} /> : !noneSelected ? <Minus size={12} /> : null}
          </button>
          <span className="text-sm text-neutral-600">
            {selected.size} of {policies.length} selected
          </span>
        </div>
      </div>

      {/* Policy rows */}
      <div className="max-h-[420px] space-y-1 overflow-y-auto rounded-lg border border-neutral-200">
        {policies.map((p, idx) => {
          const isSelected = selected.has(idx);
          const isExpanded = expanded.has(idx);

          return (
            <div key={idx} className={`border-b border-neutral-100 last:border-b-0 ${isSelected ? "bg-white" : "bg-neutral-50 opacity-60"}`}>
              {/* Main row */}
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  onClick={() => toggleOne(idx)}
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                    isSelected ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300"
                  }`}
                >
                  {isSelected && <Check size={12} />}
                </button>

                <button onClick={() => toggleExpand(idx)} className="shrink-0 text-neutral-400 hover:text-neutral-600">
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>

                {/* Title — editable inline */}
                <input
                  value={p.title ?? p.policy_id}
                  onChange={(e) => updatePolicy(idx, "title", e.target.value)}
                  className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-medium hover:border-neutral-200 focus:border-neutral-300 focus:outline-none"
                />

                {/* Domain badge */}
                <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                  {p.domain || "—"}
                </span>

                {/* Severity selector */}
                <select
                  value={p.rule_severity}
                  onChange={(e) => updatePolicy(idx, "rule_severity", e.target.value)}
                  className={`shrink-0 rounded-full border-0 px-2 py-0.5 text-xs font-medium ${SEVERITY_COLORS[p.rule_severity as Severity] || "bg-neutral-100"}`}
                >
                  <option value="blocking">Blocking</option>
                  <option value="warning">Warning</option>
                  <option value="advisory">Advisory</option>
                </select>

                {/* Clause count */}
                {p.clauses.length > 0 && (
                  <span className="shrink-0 text-xs text-neutral-400">{p.clauses.length} clauses</span>
                )}
              </div>

              {/* Statement preview */}
              {!isExpanded && (
                <div className="px-14 pb-2 text-xs text-neutral-500 line-clamp-1">
                  {p.rule_statement}
                </div>
              )}

              {/* Expanded detail */}
              {isExpanded && (
                <div className="border-t border-neutral-100 bg-neutral-50/50 px-14 py-3 space-y-3">
                  {/* Statement */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-500">Statement</label>
                    <textarea
                      value={p.rule_statement}
                      onChange={(e) => updatePolicy(idx, "rule_statement", e.target.value)}
                      rows={2}
                      className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs"
                    />
                  </div>

                  {/* Rationale */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-500">Rationale</label>
                    <textarea
                      value={p.rule_rationale}
                      onChange={(e) => updatePolicy(idx, "rule_rationale", e.target.value)}
                      rows={2}
                      className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs"
                    />
                  </div>

                  {/* Clauses */}
                  {p.clauses.length > 0 && (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-neutral-500">Clauses</label>
                      <div className="space-y-2">
                        {p.clauses.map((c, ci) => (
                          <div key={ci} className="rounded-md border border-neutral-200 bg-white p-2">
                            <div className="mb-1 flex items-center gap-2">
                              <input
                                value={c.heading}
                                onChange={(e) => updateClause(idx, ci, "heading", e.target.value)}
                                placeholder="Clause heading"
                                className="flex-1 rounded border border-neutral-200 px-2 py-1 text-xs"
                              />
                              <select
                                value={c.severity}
                                onChange={(e) => updateClause(idx, ci, "severity", e.target.value)}
                                className={`rounded-full border-0 px-2 py-0.5 text-xs ${SEVERITY_COLORS[c.severity as Severity] || "bg-neutral-100"}`}
                              >
                                <option value="blocking">Blocking</option>
                                <option value="warning">Warning</option>
                                <option value="advisory">Advisory</option>
                              </select>
                              <button
                                onClick={() => removeClause(idx, ci)}
                                className="text-xs text-neutral-400 hover:text-red-500"
                              >
                                &times;
                              </button>
                            </div>
                            <textarea
                              value={c.content}
                              onChange={(e) => updateClause(idx, ci, "content", e.target.value)}
                              rows={2}
                              placeholder="Clause content"
                              className="w-full rounded border border-neutral-200 px-2 py-1 text-xs"
                            />
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => addClause(idx)}
                        className="mt-1 text-xs text-neutral-500 hover:text-neutral-700"
                      >
                        + Add clause
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer actions */}
      <div className="mt-4 flex items-center justify-between">
        <button onClick={onCancel} className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          disabled={noneSelected || loading}
          className="flex items-center gap-2 rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {loading ? "Importing..." : `Import ${selected.size} selected`}
        </button>
      </div>
    </div>
  );
}
