"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Plus, Trash2, GripVertical, ArrowLeft } from "lucide-react";
import { SEVERITY_COLORS } from "@/lib/truly-govern/constants";
import type { Severity } from "@/lib/truly-govern/types";
import type { GovernanceView } from "@/lib/truly-govern/governance-views";

interface ClauseRow {
  heading: string;
  content: string;
  severity: Severity;
}

interface TechDomainOption {
  id: string;
  name: string;
}

interface NewPolicyWorkspaceProps {
  onNavigate: (view: GovernanceView) => void;
}

export default function NewPolicyWorkspace({ onNavigate }: NewPolicyWorkspaceProps) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [techDomains, setTechDomains] = useState<TechDomainOption[]>([]);

  const [details, setDetails] = useState({
    title: "",
    rule_statement: "",
    rule_rationale: "",
    rule_severity: "warning" as string,
    tech_domain_id: "",
    subdomain: "",
    layer: "domain",
    mandatory: true,
    tags: [] as string[],
    tagInput: "",
  });

  const [clauses, setClauses] = useState<ClauseRow[]>([
    { heading: "", content: "", severity: "warning" },
  ]);

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

  function addTag() {
    const tag = details.tagInput.trim();
    if (tag && !details.tags.includes(tag)) {
      setDetails({ ...details, tags: [...details.tags, tag], tagInput: "" });
    }
  }

  function removeTag(tag: string) {
    setDetails({ ...details, tags: details.tags.filter((t) => t !== tag) });
  }

  function addClause() {
    setClauses([...clauses, { heading: "", content: "", severity: "warning" }]);
  }

  function removeClause(i: number) {
    setClauses(clauses.filter((_, idx) => idx !== i));
  }

  function updateClause(i: number, field: keyof ClauseRow, value: string) {
    const next = [...clauses];
    next[i] = { ...next[i], [field]: value };
    setClauses(next);
  }

  async function handleSave(status: "draft" | "active") {
    setSaving(true);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

    const policyRes = await fetch("/api/truly-govern/policies", {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: details.title,
        rule_statement: details.rule_statement,
        rule_rationale: details.rule_rationale,
        rule_severity: details.rule_severity,
        tech_domain_id: details.tech_domain_id || null,
        subdomain: details.subdomain,
        layer: details.layer,
        mandatory: details.mandatory,
        tags: details.tags,
        source_type: "authored",
      }),
    });
    const { data: policy } = await policyRes.json();

    if (policy?.id) {
      for (let i = 0; i < clauses.length; i++) {
        const c = clauses[i];
        if (!c.heading && !c.content) continue;
        await fetch("/api/truly-govern/policies/clauses", {
          method: "POST",
          headers,
          body: JSON.stringify({
            policy_id: policy.id,
            heading: c.heading,
            content: c.content,
            severity: c.severity,
            clause_index: i,
          }),
        });
      }

      if (status === "active") {
        await fetch("/api/truly-govern/policies", {
          method: "PATCH",
          headers,
          body: JSON.stringify({ id: policy.id, status: "active" }),
        });
      }

      onNavigate({ page: "policies-detail", id: policy.id });
    }
    setSaving(false);
  }

  const severityCount = clauses.reduce(
    (acc, c) => ({ ...acc, [c.severity]: (acc[c.severity] || 0) + 1 }),
    {} as Record<string, number>,
  );

  return (
    <div className="max-w-3xl">
      {/* Back button */}
      <button onClick={() => onNavigate({ page: "policies" })} className="mb-4 flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700">
        <ArrowLeft size={14} /> Back to policies
      </button>

      <h1 className="text-2xl font-semibold">Author a New Policy</h1>

      {/* Step indicators */}
      <div className="mt-4 mb-6 flex gap-4 text-sm">
        {["Details", "Clauses", "Review"].map((label, i) => (
          <button key={label} onClick={() => setStep(i + 1)} className={`rounded-full px-3 py-1 ${step === i + 1 ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600"}`}>
            {i + 1}. {label}
          </button>
        ))}
      </div>

      {/* Step 1: Details */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Title</label>
            <input value={details.title} onChange={(e) => setDetails({ ...details, title: e.target.value })} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" placeholder="e.g. AWS Security Baseline" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Statement</label>
            <textarea value={details.rule_statement} onChange={(e) => setDetails({ ...details, rule_statement: e.target.value })} rows={3} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" placeholder="The policy requirement — what must be done or not done" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Rationale</label>
            <textarea value={details.rule_rationale} onChange={(e) => setDetails({ ...details, rule_rationale: e.target.value })} rows={2} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" placeholder="Why this policy exists — the risk or compliance driver" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Technology Domain</label>
            <select value={details.tech_domain_id} onChange={(e) => setDetails({ ...details, tech_domain_id: e.target.value })} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm">
              <option value="">Select a technology domain</option>
              {techDomains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Subdomain</label>
              <input value={details.subdomain} onChange={(e) => setDetails({ ...details, subdomain: e.target.value })} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" placeholder="e.g. access-control, encryption" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Severity</label>
              <select value={details.rule_severity} onChange={(e) => setDetails({ ...details, rule_severity: e.target.value })} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm">
                <option value="blocking">Blocking</option>
                <option value="warning">Warning</option>
                <option value="advisory">Advisory</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Layer</label>
              <select value={details.layer} onChange={(e) => setDetails({ ...details, layer: e.target.value })} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm">
                <option value="domain">Domain</option>
                <option value="org">Organisation</option>
              </select>
            </div>
            <div className="flex items-end gap-2 pb-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={details.mandatory} onChange={(e) => setDetails({ ...details, mandatory: e.target.checked })} className="rounded" />
                Mandatory
              </label>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Tags</label>
            <div className="flex flex-wrap gap-1 mb-2">
              {details.tags.map((t) => (
                <span key={t} className="flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs">
                  {t}
                  <button onClick={() => removeTag(t)} className="text-neutral-400 hover:text-neutral-600">&times;</button>
                </span>
              ))}
            </div>
            <input value={details.tagInput} onChange={(e) => setDetails({ ...details, tagInput: e.target.value })} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" placeholder="Type and press Enter" />
          </div>
          <button onClick={() => setStep(2)} className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800">Next: Clauses</button>
        </div>
      )}

      {/* Step 2: Clauses */}
      {step === 2 && (
        <div className="space-y-3">
          {clauses.map((c, i) => (
            <div key={i} className="rounded-lg border border-neutral-200 bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-neutral-600">
                  <GripVertical size={14} className="text-neutral-300" />
                  Clause {i + 1}
                </div>
                <div className="flex items-center gap-2">
                  <select value={c.severity} onChange={(e) => updateClause(i, "severity", e.target.value)} className="rounded-md border border-neutral-300 px-2 py-1 text-xs">
                    <option value="blocking">Blocking</option>
                    <option value="warning">Warning</option>
                    <option value="advisory">Advisory</option>
                  </select>
                  {clauses.length > 1 && (
                    <button onClick={() => removeClause(i)} className="text-neutral-400 hover:text-red-500"><Trash2 size={14} /></button>
                  )}
                </div>
              </div>
              <input value={c.heading} onChange={(e) => updateClause(i, "heading", e.target.value)} placeholder="Clause heading" className="mb-2 w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm" />
              <textarea value={c.content} onChange={(e) => updateClause(i, "content", e.target.value)} rows={4} placeholder="Clause body — the specific requirement" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
            </div>
          ))}
          <button onClick={addClause} className="flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-900">
            <Plus size={14} /> Add clause
          </button>
          <div className="flex gap-2 pt-2">
            <button onClick={() => setStep(1)} className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">Back</button>
            <button onClick={() => setStep(3)} className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800">Next: Review</button>
          </div>
        </div>
      )}

      {/* Step 3: Review */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="rounded-lg border border-neutral-200 bg-white p-4">
            <h3 className="font-medium">{details.title || "Untitled policy"}</h3>
            <p className="mt-1 text-sm text-neutral-600">{details.rule_statement || "No statement"}</p>
            {details.rule_rationale && <p className="mt-1 text-sm text-neutral-400 italic">{details.rule_rationale}</p>}
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-neutral-100 px-2 py-0.5">{techDomains.find(d => d.id === details.tech_domain_id)?.name ?? "No domain"}</span>
              {details.subdomain && <span className="rounded-full bg-neutral-100 px-2 py-0.5">{details.subdomain}</span>}
              <span className={`rounded-full px-2 py-0.5 ${details.rule_severity === "blocking" ? "bg-red-50 text-red-700" : details.rule_severity === "advisory" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}`}>{details.rule_severity}</span>
              <span className="rounded-full bg-neutral-100 px-2 py-0.5">{details.layer}</span>
              {details.mandatory && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">Mandatory</span>}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium">{clauses.filter((c) => c.heading || c.content).length} Clauses</h3>
            <div className="flex gap-3 text-xs">
              {Object.entries(severityCount).map(([sev, count]) => (
                <span key={sev} className={`rounded-full px-2 py-0.5 ${SEVERITY_COLORS[sev as Severity] || ""}`}>
                  {count} {sev}
                </span>
              ))}
            </div>
            <div className="mt-3 space-y-2">
              {clauses.filter((c) => c.heading || c.content).map((c, i) => (
                <div key={i} className={`rounded-md border-l-4 p-3 text-sm ${c.severity === "blocking" ? "border-red-500 bg-red-50/30" : c.severity === "advisory" ? "border-blue-500 bg-blue-50/30" : "border-amber-500 bg-amber-50/30"}`}>
                  <div className="font-medium">{c.heading}</div>
                  <div className="mt-1 text-neutral-600">{c.content}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={() => setStep(2)} className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">Back</button>
            <button onClick={() => handleSave("draft")} disabled={saving} className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50">
              {saving ? "Saving..." : "Save Draft"}
            </button>
            <button onClick={() => handleSave("active")} disabled={saving} className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-50">
              {saving ? "Publishing..." : "Publish"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
