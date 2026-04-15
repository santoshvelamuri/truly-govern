"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Loader2, Pencil, AlertTriangle, ArrowLeft, Save, X, Plus, Trash2 } from "lucide-react";
import { SEVERITY_COLORS, POLICY_STATUS_LABELS } from "@/lib/truly-govern/constants";
import type { Severity } from "@/lib/truly-govern/types";
import type { GovernanceView } from "@/lib/truly-govern/governance-views";

interface PolicyData {
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
  rule_rationale: string;
  rule_severity: Severity;
  ingestion_status: string;
  tags: string[];
  version: string;
  updated_at: string;
  created_at: string;
}

interface ClauseData {
  id: string;
  heading: string;
  content: string;
  severity: Severity;
  clause_index: number;
}

interface TechDomainOption {
  id: string;
  name: string;
}

// Editing clause: existing clauses have an id, new ones have a temp key
interface EditClause {
  id?: string;
  _tempKey?: string;
  heading: string;
  content: string;
  severity: Severity;
  clause_index: number;
}

interface PolicyDetailWorkspaceProps {
  policyId: string;
  onNavigate: (view: GovernanceView) => void;
}

const inputClass = "w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:border-neutral-500 focus:outline-none";

export default function PolicyDetailWorkspace({ policyId, onNavigate }: PolicyDetailWorkspaceProps) {
  const [policy, setPolicy] = useState<PolicyData | null>(null);
  const [clauses, setClauses] = useState<ClauseData[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"clauses" | "usage" | "history">("clauses");
  const [updating, setUpdating] = useState(false);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<PolicyData | null>(null);
  const [editClauses, setEditClauses] = useState<EditClause[]>([]);
  const [deletedClauseIds, setDeletedClauseIds] = useState<string[]>([]);
  const [techDomains, setTechDomains] = useState<TechDomainOption[]>([]);
  const [tagInput, setTagInput] = useState("");

  const load = useCallback(async () => {
    const [polRes, clauseRes] = await Promise.all([
      supabase.from("standard_policies").select("*").eq("id", policyId).single(),
      supabase.from("policy_clauses").select("*").eq("policy_id", policyId).order("clause_index"),
    ]);
    setPolicy(polRes.data);
    setClauses(clauseRes.data ?? []);
    setLoading(false);
  }, [policyId]);

  useEffect(() => { load(); }, [load]);

  // Load tech domains for the edit dropdown
  useEffect(() => {
    async function loadTechDomains() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
      if (!profile) return;
      const { data } = await supabase.from("technology_domains").select("id, name").eq("org_id", profile.org_id).eq("archived", false).order("sort_order");
      setTechDomains(data ?? []);
    }
    loadTechDomains();
  }, []);

  async function updateStatus(newStatus: string) {
    setUpdating(true);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    await fetch("/api/truly-govern/policies", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: policyId, status: newStatus }),
    });
    await load();
    setUpdating(false);
  }

  async function triggerIngestion() {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    await fetch("/api/truly-govern/ingestion", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ policy_id: policyId }),
    });
    await load();
  }

  function enterEditMode() {
    if (!policy) return;
    setDraft({ ...policy });
    setEditClauses(clauses.map((c) => ({ ...c })));
    setDeletedClauseIds([]);
    setTagInput("");
    setIsEditing(true);
    setTab("clauses");
  }

  function cancelEdit() {
    setIsEditing(false);
    setDraft(null);
    setEditClauses([]);
    setDeletedClauseIds([]);
    setTagInput("");
  }

  function updateDraft(updates: Partial<PolicyData>) {
    setDraft((prev) => (prev ? { ...prev, ...updates } : prev));
  }

  function addTag() {
    if (!draft) return;
    const tag = tagInput.trim();
    if (tag && !draft.tags.includes(tag)) {
      updateDraft({ tags: [...draft.tags, tag] });
      setTagInput("");
    }
  }

  function removeTag(tag: string) {
    if (!draft) return;
    updateDraft({ tags: draft.tags.filter((t) => t !== tag) });
  }

  function updateEditClause(index: number, updates: Partial<EditClause>) {
    setEditClauses((prev) => prev.map((c, i) => (i === index ? { ...c, ...updates } : c)));
  }

  function addEditClause() {
    setEditClauses((prev) => [
      ...prev,
      { _tempKey: `new-${Date.now()}`, heading: "", content: "", severity: "warning" as Severity, clause_index: prev.length },
    ]);
  }

  function removeEditClause(index: number) {
    const clause = editClauses[index];
    if (clause.id) {
      setDeletedClauseIds((prev) => [...prev, clause.id!]);
    }
    setEditClauses((prev) => prev.filter((_, i) => i !== index).map((c, i) => ({ ...c, clause_index: i })));
  }

  async function saveEdit() {
    if (!draft) return;
    setSaving(true);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

    // 1. Save policy metadata
    const policyUpdates: Record<string, unknown> = {
      id: policyId,
      title: draft.title,
      rule_statement: draft.rule_statement,
      rule_rationale: draft.rule_rationale,
      rule_severity: draft.rule_severity,
      tech_domain_id: draft.tech_domain_id,
      subdomain: draft.subdomain,
      layer: draft.layer,
      mandatory: draft.mandatory,
      tags: draft.tags,
    };

    // If tech_domain_id changed, update denormalized domain name
    if (draft.tech_domain_id) {
      const td = techDomains.find((d) => d.id === draft.tech_domain_id);
      if (td) policyUpdates.domain = td.name;
    } else {
      policyUpdates.domain = "";
    }

    const polRes = await fetch("/api/truly-govern/policies", {
      method: "PATCH",
      headers,
      body: JSON.stringify(policyUpdates),
    });

    if (!polRes.ok) {
      setSaving(false);
      return;
    }

    // 2. Delete removed clauses
    for (const clauseId of deletedClauseIds) {
      await fetch("/api/truly-govern/policies/clauses", {
        method: "DELETE",
        headers,
        body: JSON.stringify({ id: clauseId }),
      });
    }

    // 3. Update existing clauses and create new ones
    for (let i = 0; i < editClauses.length; i++) {
      const c = editClauses[i];
      if (!c.heading && !c.content) continue;

      if (c.id) {
        // Update existing
        await fetch("/api/truly-govern/policies/clauses", {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            id: c.id,
            heading: c.heading,
            content: c.content,
            severity: c.severity,
            clause_index: i,
          }),
        });
      } else {
        // Create new
        await fetch("/api/truly-govern/policies/clauses", {
          method: "POST",
          headers,
          body: JSON.stringify({
            policy_id: policyId,
            heading: c.heading,
            content: c.content,
            severity: c.severity,
            clause_index: i,
          }),
        });
      }
    }

    // 4. Reload and exit edit mode
    await load();
    setIsEditing(false);
    setDraft(null);
    setEditClauses([]);
    setDeletedClauseIds([]);
    setSaving(false);
  }

  if (loading) return <div className="flex items-center gap-2 text-sm text-neutral-500"><Loader2 size={16} className="animate-spin" /> Loading...</div>;
  if (!policy) return <div className="text-sm text-neutral-500">Policy not found.</div>;

  const statusLabel = POLICY_STATUS_LABELS[policy.status as keyof typeof POLICY_STATUS_LABELS] ?? policy.status;
  const viewData = isEditing && draft ? draft : policy;

  return (
    <div className="max-w-4xl">
      {/* Back button */}
      <button onClick={() => onNavigate({ page: "policies" })} className="mb-4 flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700">
        <ArrowLeft size={14} /> Back to policies
      </button>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            {isEditing ? (
              <input
                value={draft?.title ?? ""}
                onChange={(e) => updateDraft({ title: e.target.value })}
                className={`${inputClass} text-xl font-semibold`}
                placeholder="Policy title"
              />
            ) : (
              <h1 className="text-2xl font-semibold">{policy.title || policy.policy_id}</h1>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className={`rounded-full px-2 py-0.5 ${policy.status === "active" ? "bg-emerald-50 text-emerald-700" : policy.status === "deprecated" ? "bg-neutral-100 text-neutral-500" : "bg-blue-50 text-blue-700"}`}>
                {statusLabel}
              </span>
              {viewData.mandatory && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">Mandatory</span>}
              <span className="rounded-full bg-neutral-100 px-2 py-0.5">{viewData.domain}</span>
              <span className="rounded-full bg-neutral-100 px-2 py-0.5">{viewData.layer}</span>
              <span className="text-neutral-400">v{policy.version}</span>
            </div>
          </div>
          <div className="ml-4 flex items-center gap-2">
            {isEditing ? (
              <>
                <button onClick={saveEdit} disabled={saving} className="flex items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-800 disabled:opacity-50">
                  <Save size={14} /> {saving ? "Saving..." : "Save"}
                </button>
                <button onClick={cancelEdit} disabled={saving} className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50">
                  <X size={14} /> Cancel
                </button>
              </>
            ) : (
              <>
                {policy.status === "draft" && (
                  <button onClick={() => updateStatus("active")} disabled={updating} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-50">Activate</button>
                )}
                {policy.status === "active" && (
                  <button onClick={() => updateStatus("deprecated")} disabled={updating} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50 disabled:opacity-50">Deprecate</button>
                )}
                {policy.status !== "deprecated" && (
                  <button onClick={enterEditMode} className="rounded-md border border-neutral-300 p-1.5 text-neutral-400 hover:bg-neutral-50 hover:text-neutral-600">
                    <Pencil size={14} />
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Statement */}
        {isEditing ? (
          <div className="mt-3 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">Statement</label>
              <textarea
                value={draft?.rule_statement ?? ""}
                onChange={(e) => updateDraft({ rule_statement: e.target.value })}
                rows={3}
                className={inputClass}
                placeholder="Policy statement"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">Rationale</label>
              <textarea
                value={draft?.rule_rationale ?? ""}
                onChange={(e) => updateDraft({ rule_rationale: e.target.value })}
                rows={2}
                className={inputClass}
                placeholder="Why this policy exists"
              />
            </div>
          </div>
        ) : (
          <>
            {policy.rule_statement && <p className="mt-3 text-sm text-neutral-600">{policy.rule_statement}</p>}
            {policy.rule_rationale && <p className="mt-2 text-sm text-neutral-400 italic">{policy.rule_rationale}</p>}
          </>
        )}

        {/* Edit form: metadata fields */}
        {isEditing && draft && (
          <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-neutral-200 bg-white p-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">Technology Domain</label>
              <select value={draft.tech_domain_id ?? ""} onChange={(e) => updateDraft({ tech_domain_id: e.target.value || null })} className={inputClass}>
                <option value="">None</option>
                {techDomains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">Subdomain</label>
              <input value={draft.subdomain} onChange={(e) => updateDraft({ subdomain: e.target.value })} className={inputClass} placeholder="e.g. access-control" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">Layer</label>
              <select value={draft.layer} onChange={(e) => updateDraft({ layer: e.target.value })} className={inputClass}>
                <option value="domain">Domain</option>
                <option value="org">Organisation</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">Severity</label>
              <select value={draft.rule_severity} onChange={(e) => updateDraft({ rule_severity: e.target.value as Severity })} className={inputClass}>
                <option value="blocking">Blocking</option>
                <option value="warning">Warning</option>
                <option value="advisory">Advisory</option>
              </select>
            </div>
            <div className="col-span-2 flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={draft.mandatory} onChange={(e) => updateDraft({ mandatory: e.target.checked })} className="rounded" />
                Mandatory
              </label>
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-neutral-500">Tags</label>
              <div className="mb-2 flex flex-wrap gap-1">
                {draft.tags.map((t) => (
                  <span key={t} className="flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs">
                    {t}
                    <button onClick={() => removeTag(t)} className="text-neutral-400 hover:text-neutral-600">&times;</button>
                  </span>
                ))}
              </div>
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                className={inputClass}
                placeholder="Type and press Enter"
              />
            </div>
          </div>
        )}

        {/* Ingestion status (view mode only) */}
        {!isEditing && (
          <div className="mt-3 flex items-center gap-2 text-xs">
            {policy.ingestion_status === "processing" ? (
              <span className="flex items-center gap-1 text-amber-600"><Loader2 size={12} className="animate-spin" /> Indexing...</span>
            ) : policy.ingestion_status === "failed" ? (
              <span className="flex items-center gap-1 text-red-600"><AlertTriangle size={12} /> Ingestion failed — <button onClick={triggerIngestion} className="underline">retry</button></span>
            ) : policy.ingestion_status === "complete" ? (
              <span className="text-emerald-600">Indexed</span>
            ) : (
              <button onClick={triggerIngestion} className="text-blue-600 underline">Trigger indexing</button>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 border-b border-neutral-200">
        {(["clauses", "usage", "history"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`border-b-2 px-4 py-2 text-sm capitalize ${tab === t ? "border-neutral-900 font-medium text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-700"}`}>
            {t === "clauses" ? `Clauses (${isEditing ? editClauses.length : clauses.length})` : t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "clauses" && !isEditing && (
        <div className="space-y-2">
          {clauses.length === 0 ? (
            <p className="text-sm text-neutral-500">No clauses defined yet.</p>
          ) : (
            clauses.map((c, i) => (
              <div key={c.id} className={`rounded-md border-l-4 bg-white p-4 shadow-sm ${c.severity === "blocking" ? "border-red-500" : c.severity === "advisory" ? "border-blue-500" : "border-amber-500"}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-neutral-400">#{i + 1}</span>
                    <span className="text-sm font-medium">{c.heading}</span>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] ${SEVERITY_COLORS[c.severity]}`}>{c.severity}</span>
                </div>
                <p className="mt-1 text-sm text-neutral-600">{c.content}</p>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "clauses" && isEditing && (
        <div className="space-y-3">
          {editClauses.map((c, i) => (
            <div key={c.id ?? c._tempKey} className="rounded-lg border border-neutral-200 bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-neutral-600">Clause {i + 1}</span>
                <div className="flex items-center gap-2">
                  <select value={c.severity} onChange={(e) => updateEditClause(i, { severity: e.target.value as Severity })} className="rounded-md border border-neutral-300 px-2 py-1 text-xs">
                    <option value="blocking">Blocking</option>
                    <option value="warning">Warning</option>
                    <option value="advisory">Advisory</option>
                  </select>
                  {editClauses.length > 0 && (
                    <button onClick={() => removeEditClause(i)} className="text-neutral-400 hover:text-red-500">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
              <input
                value={c.heading}
                onChange={(e) => updateEditClause(i, { heading: e.target.value })}
                placeholder="Clause heading"
                className={`${inputClass} mb-2`}
              />
              <textarea
                value={c.content}
                onChange={(e) => updateEditClause(i, { content: e.target.value })}
                rows={3}
                placeholder="Clause content — the specific requirement"
                className={inputClass}
              />
            </div>
          ))}
          <button onClick={addEditClause} className="flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-900">
            <Plus size={14} /> Add clause
          </button>
        </div>
      )}

      {tab === "usage" && (
        <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
          Coming soon — will show reviews that reference this policy.
        </div>
      )}

      {tab === "history" && (
        <div className="text-sm text-neutral-600">
          <div className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="font-medium">Version {policy.version}</div>
            <div className="text-xs text-neutral-400">Created {new Date(policy.created_at).toLocaleString()}</div>
          </div>
        </div>
      )}
    </div>
  );
}
