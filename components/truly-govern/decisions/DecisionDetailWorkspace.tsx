"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ArrowLeft, Loader2, Star, AlertTriangle, CheckCircle, Pencil, Save, X, Plus, Trash2, Sparkles } from "lucide-react";
import { DECISION_STATUS_LABELS, RISK_COLORS } from "@/lib/truly-govern/constants";
import type { GovernanceView } from "@/lib/truly-govern/governance-views";

interface DecisionData {
  id: string;
  title: string;
  type: string;
  problem_statement: string;
  urgency_reason: string | null;
  risk_level: string;
  status: string;
  routing_path: string | null;
  triage_notes: Record<string, unknown> | null;
  precedent_adr_id: string | null;
  custom_fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface OptionData {
  id: string;
  label: string;
  recommendation: string;
  description: string;
  pros: string[];
  cons: string[];
  strategic_fit_score: number | null;
  risk_summary: string | null;
  policy_violations: string[];
  clause_index: number;
}

interface EditOption {
  id?: string;
  _tempKey?: string;
  label: string;
  description: string;
}

interface DecisionDetailWorkspaceProps {
  requestId: string;
  onNavigate: (view: GovernanceView) => void;
}

const TYPE_LABELS: Record<string, string> = {
  buy_build: "Buy vs Build",
  technology_adoption: "Technology Adoption",
  vendor_selection: "Vendor Selection",
  architecture_pattern: "Architecture Pattern",
  security_exception: "Security Exception",
  cross_domain: "Cross-Domain",
  strategic_principle: "Strategic Principle",
};

const DECISION_TYPES = Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }));
const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;

const inputClass = "w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:border-neutral-500 focus:outline-none";

export default function DecisionDetailWorkspace({ requestId, onNavigate }: DecisionDetailWorkspaceProps) {
  const [decision, setDecision] = useState<DecisionData | null>(null);
  const [options, setOptions] = useState<OptionData[]>([]);
  const [loading, setLoading] = useState(true);

  // Triage state
  const [triageRunning, setTriageRunning] = useState(false);

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftType, setDraftType] = useState("");
  const [draftProblem, setDraftProblem] = useState("");
  const [draftRisk, setDraftRisk] = useState("");
  const [editOptions, setEditOptions] = useState<EditOption[]>([]);
  const [deletedOptionIds, setDeletedOptionIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) { setLoading(false); return; }
    const headers = { Authorization: `Bearer ${token}` };

    const [decRes, optRes] = await Promise.all([
      supabase.from("decision_requests").select("*").eq("id", requestId).single(),
      fetch(`/api/truly-govern/decisions/options?request_id=${requestId}`, { headers }).then(r => r.json()),
    ]);
    setDecision(decRes.data);
    setOptions(optRes.data ?? []);
    setLoading(false);
  }, [requestId]);

  useEffect(() => { load(); }, [load]);

  // Poll while triage is running
  useEffect(() => {
    if (!triageRunning) return;
    const startTime = Date.now();
    const interval = setInterval(async () => {
      if (Date.now() - startTime > 90000) {
        clearInterval(interval);
        setTriageRunning(false);
        setDecision((prev) => prev ? { ...prev, triage_notes: { failed: true, error: "Triage timed out. Click Run AI Triage to retry." } as Record<string, unknown> } : prev);
        return;
      }
      const { data } = await supabase.from("decision_requests").select("triage_notes").eq("id", requestId).single();
      if (data?.triage_notes) {
        setTriageRunning(false);
        load();
        clearInterval(interval);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [triageRunning, requestId, load]);

  // ── Edit functions ─────────────────────────────────────────────────────

  function enterEditMode() {
    if (!decision) return;
    setDraftTitle(decision.title);
    setDraftType(decision.type);
    setDraftProblem(decision.problem_statement);
    setDraftRisk(decision.risk_level);
    setEditOptions(options.map((o) => ({ id: o.id, label: o.label, description: o.description })));
    setDeletedOptionIds([]);
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
    setDeletedOptionIds([]);
  }

  function addEditOption() {
    if (editOptions.length < 5) {
      setEditOptions([...editOptions, { _tempKey: `new-${Date.now()}`, label: "", description: "" }]);
    }
  }

  function removeEditOption(i: number) {
    const opt = editOptions[i];
    if (opt.id) setDeletedOptionIds((prev) => [...prev, opt.id!]);
    setEditOptions(editOptions.filter((_, idx) => idx !== i));
  }

  async function saveEdit() {
    if (!decision) return;
    setSaving(true);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

    // Update decision request
    await fetch("/api/truly-govern/decisions", {
      method: "PATCH", headers,
      body: JSON.stringify({
        id: requestId,
        title: draftTitle,
        type: draftType,
        problem_statement: draftProblem,
        risk_level: draftRisk,
      }),
    });

    // Delete removed options
    for (const optId of deletedOptionIds) {
      await fetch("/api/truly-govern/decisions/options", {
        method: "DELETE", headers, body: JSON.stringify({ id: optId }),
      });
    }

    // Update existing / create new options
    for (let i = 0; i < editOptions.length; i++) {
      const opt = editOptions[i];
      if (!opt.label.trim()) continue;
      if (opt.id) {
        await fetch("/api/truly-govern/decisions/options", {
          method: "PATCH", headers,
          body: JSON.stringify({ id: opt.id, label: opt.label, description: opt.description, clause_index: i }),
        });
      } else {
        await fetch("/api/truly-govern/decisions/options", {
          method: "POST", headers,
          body: JSON.stringify({ request_id: requestId, label: opt.label, description: opt.description, clause_index: i }),
        });
      }
    }

    await load();
    setIsEditing(false);
    setSaving(false);
  }

  async function submitRequest() {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    await fetch("/api/truly-govern/decisions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: requestId, status: "submitted" }),
    });
    setDecision((prev) => prev ? { ...prev, status: "submitted" } : prev);
  }

  async function runTriage() {
    setTriageRunning(true);
    // Clear previous failed triage notes
    setDecision((prev) => prev ? { ...prev, triage_notes: null } : prev);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    await fetch("/api/truly-govern/decisions/triage", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ request_id: requestId }),
    });
  }

  if (loading) return <div className="flex items-center gap-2 text-sm text-neutral-500"><Loader2 size={16} className="animate-spin" /> Loading...</div>;
  if (!decision) return <div className="text-sm text-neutral-500">Decision request not found.</div>;

  const statusLabel = DECISION_STATUS_LABELS[decision.status as keyof typeof DECISION_STATUS_LABELS] ?? decision.status;
  const triage = decision.triage_notes as { rationale?: string; summary?: string; recommended_reviewers?: string[]; estimated_complexity?: string; precedent_adr_ids?: string[]; policy_flags?: string[] } | null;
  const canEdit = decision.status === "draft" || decision.status === "submitted";

  return (
    <div className="max-w-4xl">
      <button onClick={() => onNavigate({ page: "decisions" })} className="mb-4 flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700">
        <ArrowLeft size={14} /> Back to decisions
      </button>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            {isEditing ? (
              <input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} className={`${inputClass} text-xl font-semibold`} placeholder="Decision title" />
            ) : (
              <h1 className="text-2xl font-semibold">{decision.title}</h1>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className={`rounded-full px-2 py-0.5 ${decision.status === "decided" ? "bg-emerald-50 text-emerald-700" : decision.status === "in_review" ? "bg-purple-50 text-purple-700" : decision.status === "submitted" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}>
                {statusLabel}
              </span>
              {!isEditing && <span className="rounded-full bg-neutral-100 px-2 py-0.5">{TYPE_LABELS[decision.type] ?? decision.type}</span>}
              {!isEditing && <span className={`rounded-full px-2 py-0.5 capitalize ${RISK_COLORS[decision.risk_level as keyof typeof RISK_COLORS] ?? "bg-neutral-100"}`}>{decision.risk_level}</span>}
              <span className="text-neutral-400">{new Date(decision.created_at).toLocaleDateString()}</span>
            </div>
          </div>

          <div className="ml-4 flex items-center gap-2">
            {isEditing ? (
              <>
                <button onClick={saveEdit} disabled={saving} className="flex items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-800 disabled:opacity-50">
                  <Save size={14} /> {saving ? "Saving..." : "Save"}
                </button>
                <button onClick={cancelEdit} disabled={saving} className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">
                  <X size={14} /> Cancel
                </button>
              </>
            ) : (
              <>
                {decision.status === "draft" && (
                  <button onClick={submitRequest} className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-800">
                    Submit for Review
                  </button>
                )}
                {canEdit && (
                  <button onClick={enterEditMode} className="rounded-md border border-neutral-300 p-1.5 text-neutral-400 hover:bg-neutral-50 hover:text-neutral-600">
                    <Pencil size={14} />
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* AI Triage */}
        {decision.status !== "draft" && !isEditing ? (
          <div className="mt-3">
            {triageRunning ? (
              <div className="flex items-center gap-2 text-sm text-amber-600">
                <Loader2 size={14} className="animate-spin" /> AI triage in progress...
              </div>
            ) : decision.triage_notes && (decision.triage_notes as Record<string, unknown>).failed ? (
              <div className="flex items-center gap-2 text-sm text-red-600">
                <AlertTriangle size={14} />
                <span>Triage failed: {String((decision.triage_notes as Record<string, unknown>).error ?? "Unknown error")}</span>
                <button onClick={runTriage} className="ml-2 rounded-md border border-red-300 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50">Retry</button>
              </div>
            ) : !decision.triage_notes ? (
              <button onClick={runTriage} className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50">
                <Sparkles size={14} /> Run AI Triage
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Edit metadata */}
      {isEditing && (
        <div className="mb-6 grid grid-cols-2 gap-3 rounded-lg border border-neutral-200 bg-white p-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">Decision Type</label>
            <select value={draftType} onChange={(e) => setDraftType(e.target.value)} className={inputClass}>
              {DECISION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">Risk Level</label>
            <div className="flex gap-2">
              {RISK_LEVELS.map((r) => (
                <button key={r} onClick={() => setDraftRisk(r)} className={`flex-1 rounded-md border px-2 py-1.5 text-xs capitalize ${draftRisk === r ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 hover:bg-neutral-50"}`}>
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Problem statement */}
      <div className="mb-6">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">Problem Statement</h2>
        {isEditing ? (
          <textarea value={draftProblem} onChange={(e) => setDraftProblem(e.target.value)} rows={6} className={`${inputClass} rounded-lg`} placeholder="What decision needs to be made and why?" />
        ) : (
          <div className="rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-700 leading-relaxed">{decision.problem_statement}</div>
        )}
      </div>

      {/* Triage results */}
      {triage && !isEditing && (
        <div className="mb-6 rounded-lg border border-purple-200 bg-purple-50 p-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-purple-600">AI Triage Results</h2>
          <div className="text-sm text-purple-900 space-y-2">
            {triage.summary && <div>{triage.summary}</div>}
            {triage.estimated_complexity && <div><span className="font-medium">Complexity:</span> <span className="capitalize">{triage.estimated_complexity}</span></div>}
            {triage.recommended_reviewers && triage.recommended_reviewers.length > 0 && (
              <div><span className="font-medium">Suggested reviewers:</span> {triage.recommended_reviewers.join(", ")}</div>
            )}
            {triage.policy_flags && triage.policy_flags.length > 0 && (
              <div><span className="font-medium">Policy flags:</span> {triage.policy_flags.join(", ")}</div>
            )}
            {triage.precedent_adr_ids && triage.precedent_adr_ids.length > 0 && (
              <div><span className="font-medium">Precedent ADRs:</span> {triage.precedent_adr_ids.length} found</div>
            )}
          </div>
        </div>
      )}

      {/* Options */}
      <div className="mb-6">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Options ({isEditing ? editOptions.length : options.length})
        </h2>

        {isEditing ? (
          <div className="space-y-3">
            {editOptions.map((opt, i) => (
              <div key={opt.id ?? opt._tempKey} className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-neutral-600">Option {i + 1}</span>
                  <button onClick={() => removeEditOption(i)} className="text-neutral-400 hover:text-red-500"><Trash2 size={14} /></button>
                </div>
                <input value={opt.label} onChange={(e) => setEditOptions(editOptions.map((o, idx) => idx === i ? { ...o, label: e.target.value } : o))} className={`${inputClass} mb-2`} placeholder="Option name" />
                <textarea value={opt.description} onChange={(e) => setEditOptions(editOptions.map((o, idx) => idx === i ? { ...o, description: e.target.value } : o))} rows={3} className={inputClass} placeholder="Description" />
              </div>
            ))}
            {editOptions.length < 5 && (
              <button onClick={addEditOption} className="flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-900">
                <Plus size={14} /> Add option
              </button>
            )}
          </div>
        ) : options.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {options.map((opt) => (
              <div key={opt.id} className={`rounded-lg border bg-white p-4 ${opt.recommendation === "recommended" ? "border-emerald-200" : "border-neutral-200"}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-semibold">{opt.label}</span>
                  {opt.recommendation === "recommended" && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700">Recommended</span>}
                  {opt.strategic_fit_score && (
                    <span className="flex items-center gap-0.5 text-[10px] text-amber-600"><Star size={10} /> {opt.strategic_fit_score}/5</span>
                  )}
                </div>
                <p className="text-sm text-neutral-600 mb-3">{opt.description}</p>
                {opt.pros.length > 0 && (
                  <div className="mb-2">
                    <div className="text-[10px] font-medium uppercase text-emerald-600 mb-1">Pros</div>
                    <ul className="text-xs text-neutral-600 space-y-0.5">
                      {opt.pros.map((p, i) => <li key={i} className="flex items-start gap-1"><CheckCircle size={10} className="mt-0.5 text-emerald-500 shrink-0" /> {p}</li>)}
                    </ul>
                  </div>
                )}
                {opt.cons.length > 0 && (
                  <div className="mb-2">
                    <div className="text-[10px] font-medium uppercase text-red-600 mb-1">Cons</div>
                    <ul className="text-xs text-neutral-600 space-y-0.5">
                      {opt.cons.map((c, i) => <li key={i} className="flex items-start gap-1"><AlertTriangle size={10} className="mt-0.5 text-red-500 shrink-0" /> {c}</li>)}
                    </ul>
                  </div>
                )}
                {opt.policy_violations.length > 0 && (
                  <div className="mt-2 rounded bg-red-50 px-2 py-1 text-[10px] text-red-700">
                    Policy violations: {opt.policy_violations.join("; ")}
                  </div>
                )}
                {opt.risk_summary && <div className="mt-2 text-[10px] text-neutral-500">Risk: {opt.risk_summary}</div>}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-neutral-300 p-4 text-center text-sm text-neutral-500">No options defined.</div>
        )}
      </div>
    </div>
  );
}
