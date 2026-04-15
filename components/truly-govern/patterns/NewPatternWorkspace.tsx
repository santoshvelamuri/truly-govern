"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ArrowLeft, Plus, Trash2, Loader2, CheckCircle, AlertTriangle, Sparkles } from "lucide-react";
import type { GovernanceView } from "@/lib/truly-govern/governance-views";

interface DomainOption { id: string; name: string }
interface PolicyClauseOption { id: string; heading: string; severity: string; policy_title: string }
interface ClauseDraft { _key: string; clause_type: "constraint" | "guidance" | "variant"; title: string; description: string; policy_clause_id: string; severity: string }
interface CompletenessResult { score: number; covered: { id: string; heading: string }[]; uncovered: { id: string; heading: string }[]; total: number }

interface NewPatternWorkspaceProps { onNavigate: (view: GovernanceView) => void }

const inputClass = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none";

export default function NewPatternWorkspace({ onNavigate }: NewPatternWorkspaceProps) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [domains, setDomains] = useState<DomainOption[]>([]);
  const [policyClauses, setPolicyClauses] = useState<PolicyClauseOption[]>([]);

  // Step 1 state
  const [name, setName] = useState("");
  const [problem, setProblem] = useState("");
  const [solution, setSolution] = useState("");
  const [whenToUse, setWhenToUse] = useState("");
  const [whenNotToUse, setWhenNotToUse] = useState("");
  const [domainId, setDomainId] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [knownUses, setKnownUses] = useState<string[]>([]);
  const [useInput, setUseInput] = useState("");

  // Step 2 state
  const [clauses, setClauses] = useState<ClauseDraft[]>([{ _key: "c0", clause_type: "constraint", title: "", description: "", policy_clause_id: "", severity: "" }]);

  // Step 3 state
  const [completeness, setCompleteness] = useState<CompletenessResult | null>(null);
  const [checkingCompleteness, setCheckingCompleteness] = useState(false);
  const [patternId, setPatternId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
      if (!profile) return;
      const [domRes, clauseRes] = await Promise.all([
        supabase.from("capability_domains").select("id, name").eq("org_id", profile.org_id).eq("archived", false).order("name"),
        supabase.from("policy_clauses").select("id, heading, severity, policy_id").eq("org_id", profile.org_id).order("heading"),
      ]);
      setDomains(domRes.data ?? []);
      // Enrich with policy title
      const policyIds = [...new Set((clauseRes.data ?? []).map((c: { policy_id: string }) => c.policy_id))];
      const { data: policies } = await supabase.from("standard_policies").select("id, title, policy_id").in("id", policyIds);
      const policyMap = new Map((policies ?? []).map((p: { id: string; title: string; policy_id: string }) => [p.id, p.title || p.policy_id]));
      setPolicyClauses((clauseRes.data ?? []).map((c: { id: string; heading: string; severity: string; policy_id: string }) => ({
        id: c.id, heading: c.heading, severity: c.severity, policy_title: policyMap.get(c.policy_id) ?? "",
      })));
    }
    load();
  }, []);

  function addTag(list: string[], setList: (v: string[]) => void, input: string, setInput: (v: string) => void) {
    const tag = input.trim();
    if (tag && !list.includes(tag)) { setList([...list, tag]); setInput(""); }
  }

  function addClause() {
    setClauses([...clauses, { _key: `c${Date.now()}`, clause_type: "guidance", title: "", description: "", policy_clause_id: "", severity: "" }]);
  }

  function updateClause(i: number, updates: Partial<ClauseDraft>) {
    setClauses(clauses.map((c, idx) => idx === i ? { ...c, ...updates } : c));
  }

  function removeClause(i: number) {
    setClauses(clauses.filter((_, idx) => idx !== i));
  }

  async function saveDraftAndCheck() {
    setSaving(true);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

    let id = patternId;
    if (!id) {
      const res = await fetch("/api/truly-govern/patterns", {
        method: "POST", headers,
        body: JSON.stringify({ name, problem, solution, forces: "", consequences: "", when_to_use: whenToUse, when_not_to_use: whenNotToUse, domain_id: domainId || null, known_uses: knownUses }),
      });
      const json = await res.json();
      id = json.data?.id;
      if (id) setPatternId(id);
    } else {
      await fetch("/api/truly-govern/patterns", {
        method: "PATCH", headers,
        body: JSON.stringify({ id, name, problem, solution, when_to_use: whenToUse, when_not_to_use: whenNotToUse, domain_id: domainId || null, known_uses: knownUses }),
      });
    }

    if (id) {
      // Delete existing clauses and re-create
      const { data: existing } = await fetch(`/api/truly-govern/patterns/clauses?pattern_id=${id}`, { headers }).then(r => r.json());
      for (const ec of existing ?? []) {
        await fetch("/api/truly-govern/patterns/clauses", { method: "DELETE", headers, body: JSON.stringify({ id: ec.id }) });
      }
      for (let i = 0; i < clauses.length; i++) {
        const c = clauses[i];
        if (!c.title.trim()) continue;
        await fetch("/api/truly-govern/patterns/clauses", {
          method: "POST", headers,
          body: JSON.stringify({ pattern_id: id, clause_type: c.clause_type, title: c.title, description: c.description, policy_clause_id: c.policy_clause_id || null, severity: c.severity || null, clause_number: i }),
        });
      }

      // Check completeness
      setCheckingCompleteness(true);
      const compRes = await fetch("/api/truly-govern/patterns/completeness", {
        method: "POST", headers,
        body: JSON.stringify({ pattern_id: id, domain_id: domainId || null }),
      });
      const comp = await compRes.json();
      setCompleteness(comp);

      // Update score on pattern
      await fetch("/api/truly-govern/patterns", {
        method: "PATCH", headers,
        body: JSON.stringify({ id, completeness_score: comp.score }),
      });
      setCheckingCompleteness(false);
    }
    setSaving(false);
  }

  async function handleSubmit() {
    if (!patternId || !completeness || completeness.score < 60) return;
    setSaving(true);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    await fetch("/api/truly-govern/patterns/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ pattern_id: patternId }),
    });
    setSaving(false);
    onNavigate({ page: "patterns-detail", id: patternId });
  }

  const canProceedStep1 = name && problem && solution && whenToUse && whenNotToUse;
  const hasConstraint = clauses.some((c) => c.clause_type === "constraint" && c.policy_clause_id);

  return (
    <div className="max-w-3xl">
      <button onClick={() => onNavigate({ page: "patterns" })} className="mb-4 flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700">
        <ArrowLeft size={14} /> Back to patterns
      </button>
      <h1 className="text-2xl font-semibold mb-6">Author a New Pattern</h1>

      <div className="mt-4 mb-6 flex gap-3 text-sm">
        {["Overview", "Clauses", "Review"].map((label, i) => (
          <button key={label} onClick={() => setStep(i + 1)} className={`rounded-full px-3 py-1 ${step === i + 1 ? "bg-neutral-900 text-white" : step > i + 1 ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-600"}`}>
            {i + 1}. {label}
          </button>
        ))}
      </div>

      {/* Step 1 — Overview */}
      {step === 1 && (
        <div className="space-y-4">
          <div><label className="mb-1 block text-sm font-medium">Title *</label><input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Present tense, specific. e.g. 'Event-driven microservice with transactional outbox'" /></div>
          <div><label className="mb-1 block text-sm font-medium">Problem *</label><textarea value={problem} onChange={(e) => setProblem(e.target.value)} rows={4} className={inputClass} placeholder="The recurring problem this pattern solves" /></div>
          <div><label className="mb-1 block text-sm font-medium">Solution Overview *</label><textarea value={solution} onChange={(e) => setSolution(e.target.value)} rows={5} className={inputClass} placeholder="High-level description of the approach" /></div>
          <div><label className="mb-1 block text-sm font-medium">When to Use *</label><textarea value={whenToUse} onChange={(e) => setWhenToUse(e.target.value)} rows={3} className={inputClass} placeholder="Conditions under which this is the right choice" /></div>
          <div><label className="mb-1 block text-sm font-medium">When NOT to Use *</label><textarea value={whenNotToUse} onChange={(e) => setWhenNotToUse(e.target.value)} rows={3} className={inputClass} placeholder="Anti-conditions — prevents misapplication" /></div>
          <div><label className="mb-1 block text-sm font-medium">Domain</label>
            <select value={domainId} onChange={(e) => setDomainId(e.target.value)} className={inputClass}>
              <option value="">Cross-domain (applies everywhere)</option>
              {domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div><label className="mb-1 block text-sm font-medium">Tags</label>
            <div className="mb-2 flex flex-wrap gap-1">{tags.map((t) => <span key={t} className="flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs">{t} <button onClick={() => setTags(tags.filter((x) => x !== t))} className="text-neutral-400">&times;</button></span>)}</div>
            <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag(tags, setTags, tagInput, setTagInput))} onBlur={() => addTag(tags, setTags, tagInput, setTagInput)} className={inputClass} placeholder="Type and press Enter" />
          </div>
          <div><label className="mb-1 block text-sm font-medium">Known Uses</label>
            <div className="mb-2 flex flex-wrap gap-1">{knownUses.map((u) => <span key={u} className="flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs">{u} <button onClick={() => setKnownUses(knownUses.filter((x) => x !== u))} className="text-neutral-400">&times;</button></span>)}</div>
            <input value={useInput} onChange={(e) => setUseInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag(knownUses, setKnownUses, useInput, setUseInput))} onBlur={() => addTag(knownUses, setKnownUses, useInput, setUseInput)} className={inputClass} placeholder="Services/projects using this pattern" />
          </div>
          <button onClick={() => setStep(2)} disabled={!canProceedStep1} className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-40">Next: Clauses</button>
        </div>
      )}

      {/* Step 2 — Clauses */}
      {step === 2 && (
        <div className="space-y-4">
          <p className="text-sm text-neutral-500">Add constraint, guidance, and variant clauses. Constraint clauses must link to a policy clause.</p>
          {clauses.map((c, i) => (
            <div key={c._key} className="rounded-lg border border-neutral-200 bg-white p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex gap-1">
                  {(["constraint", "guidance", "variant"] as const).map((t) => (
                    <button key={t} onClick={() => updateClause(i, { clause_type: t })} className={`rounded-md border px-2.5 py-1 text-xs capitalize ${c.clause_type === t ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 hover:bg-neutral-50"}`}>{t}</button>
                  ))}
                </div>
                {clauses.length > 1 && <button onClick={() => removeClause(i)} className="text-neutral-400 hover:text-red-500"><Trash2 size={14} /></button>}
              </div>
              <input value={c.title} onChange={(e) => updateClause(i, { title: e.target.value })} className={inputClass} placeholder="Clause title" />
              <textarea value={c.description} onChange={(e) => updateClause(i, { description: e.target.value })} rows={3} className={inputClass} placeholder="Clause description" />
              {c.clause_type === "constraint" && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-500">Linked Policy Clause *</label>
                  <select value={c.policy_clause_id} onChange={(e) => {
                    const pc = policyClauses.find((p) => p.id === e.target.value);
                    updateClause(i, { policy_clause_id: e.target.value, severity: pc?.severity ?? "" });
                  }} className={inputClass}>
                    <option value="">Select policy clause</option>
                    {policyClauses.map((pc) => <option key={pc.id} value={pc.id}>[{pc.severity}] {pc.heading} — {pc.policy_title}</option>)}
                  </select>
                </div>
              )}
            </div>
          ))}
          <button onClick={addClause} className="flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-900"><Plus size={14} /> Add clause</button>
          <div className="flex gap-2 pt-2">
            <button onClick={() => setStep(1)} className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">Back</button>
            <button onClick={() => { saveDraftAndCheck(); setStep(3); }} disabled={!hasConstraint} className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-40">Next: Review</button>
          </div>
          {!hasConstraint && <p className="text-xs text-amber-600">At least 1 constraint clause with a linked policy clause is required.</p>}
        </div>
      )}

      {/* Step 3 — Completeness & Submit */}
      {step === 3 && (
        <div className="space-y-4">
          {(saving || checkingCompleteness) ? (
            <div className="flex items-center gap-2 text-sm text-neutral-500"><Loader2 size={16} className="animate-spin" /> Saving and checking completeness...</div>
          ) : completeness ? (
            <>
              <div className={`flex items-center gap-3 rounded-lg border p-4 ${completeness.score >= 60 ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
                {completeness.score >= 60 ? <CheckCircle size={20} className="text-emerald-600" /> : <AlertTriangle size={20} className="text-amber-600" />}
                <div>
                  <div className={`text-sm font-semibold ${completeness.score >= 60 ? "text-emerald-700" : "text-amber-700"}`}>
                    Completeness: {completeness.score}% ({completeness.covered.length}/{completeness.total} mandatory clauses covered)
                  </div>
                  {completeness.score < 60 && <div className="mt-1 text-xs text-amber-600">Pattern coverage must be at least 60% to submit for review.</div>}
                </div>
              </div>

              {completeness.covered.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-emerald-600">Covered ({completeness.covered.length})</h3>
                  <div className="space-y-1">{completeness.covered.map((c) => <div key={c.id} className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle size={12} /> {c.heading}</div>)}</div>
                </div>
              )}

              {completeness.uncovered.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-600">Not Addressed ({completeness.uncovered.length})</h3>
                  <div className="space-y-1">{completeness.uncovered.map((c) => <div key={c.id} className="flex items-center gap-2 text-sm text-amber-700"><AlertTriangle size={12} /> {c.heading}</div>)}</div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button onClick={() => setStep(2)} className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">Back</button>
                <button onClick={() => saveDraftAndCheck()} disabled={saving} className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50">
                  {saving ? "Saving..." : "Save Draft"}
                </button>
                <button onClick={handleSubmit} disabled={saving || completeness.score < 60} className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-50">
                  {saving ? "Submitting..." : "Submit for Review"}
                </button>
              </div>
            </>
          ) : (
            <div className="text-sm text-neutral-500">Click &quot;Next: Review&quot; from Step 2 to check completeness.</div>
          )}
        </div>
      )}
    </div>
  );
}
