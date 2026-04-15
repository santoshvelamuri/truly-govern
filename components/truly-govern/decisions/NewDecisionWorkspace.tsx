"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ArrowLeft, Plus, Trash2, CheckCircle, Loader2 } from "lucide-react";
import type { GovernanceView } from "@/lib/truly-govern/governance-views";

interface DomainOption { id: string; name: string }
interface BoardOption { id: string; name: string; scope: string; scope_type: string }
interface BoardGroups { domain_boards: BoardOption[]; topic_boards: BoardOption[]; enterprise_boards: BoardOption[] }

interface NewDecisionWorkspaceProps {
  onNavigate: (view: GovernanceView) => void;
}

const inputClass = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none";

const DECISION_TYPES = [
  { value: "buy_build", label: "Buy vs Build" },
  { value: "technology_adoption", label: "Technology Adoption" },
  { value: "vendor_selection", label: "Vendor Selection" },
  { value: "architecture_pattern", label: "Architecture Pattern" },
  { value: "security_exception", label: "Security Exception" },
  { value: "cross_domain", label: "Cross-Domain" },
  { value: "strategic_principle", label: "Strategic Principle" },
];

const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;

interface OptionDraft { label: string; description: string }

export default function NewDecisionWorkspace({ onNavigate }: NewDecisionWorkspaceProps) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [domains, setDomains] = useState<DomainOption[]>([]);

  // Step 1
  const [title, setTitle] = useState("");
  const [decisionType, setDecisionType] = useState("");
  const [problemStatement, setProblemStatement] = useState("");
  const [riskLevel, setRiskLevel] = useState("");
  const [domainId, setDomainId] = useState("");
  const [desiredBy, setDesiredBy] = useState("");

  // Step 2
  const [options, setOptions] = useState<OptionDraft[]>([{ label: "", description: "" }]);

  // Step 3 — Board assignment
  const [boardGroups, setBoardGroups] = useState<BoardGroups | null>(null);
  const [selectedBoardId, setSelectedBoardId] = useState("");
  const [loadingBoards, setLoadingBoards] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
      if (!profile) return;
      const { data } = await supabase.from("capability_domains").select("id, name").eq("org_id", profile.org_id).eq("archived", false).order("name");
      setDomains(data ?? []);
    }
    load();
  }, []);

  async function loadBoardsForRequest() {
    setLoadingBoards(true);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const params = new URLSearchParams();
    if (domainId) params.set("domain_id", domainId);
    if (decisionType) params.set("decision_type", decisionType);
    const res = await fetch(`/api/truly-govern/boards/for-request?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    setBoardGroups(json);
    setLoadingBoards(false);
  }

  function addOption() {
    if (options.length < 5) setOptions([...options, { label: "", description: "" }]);
  }

  function removeOption(i: number) {
    setOptions(options.filter((_, idx) => idx !== i));
  }

  function updateOption(i: number, field: keyof OptionDraft, value: string) {
    setOptions(options.map((o, idx) => idx === i ? { ...o, [field]: value } : o));
  }

  async function handleSubmit(asSubmitted: boolean) {
    if (!title || !decisionType || !problemStatement || !riskLevel) return;
    setSaving(true);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

    const validOptions = options.filter((o) => o.label.trim() && o.description.trim());
    const customFields: Record<string, unknown> = {};
    if (desiredBy) customFields.desired_decision_by = desiredBy;

    const res = await fetch("/api/truly-govern/decisions", {
      method: "POST",
      headers,
      body: JSON.stringify({
        title,
        type: decisionType,
        problem_statement: problemStatement,
        risk_level: riskLevel,
        domain_id: domainId || null,
        resolved_arb_board_id: selectedBoardId || null,
        custom_fields: customFields,
        options: validOptions,
        status: asSubmitted ? "submitted" : "draft",
      }),
    });

    const json = await res.json();
    setSaving(false);
    if (json.data?.id) {
      onNavigate({ page: "decisions-detail", id: json.data.id });
    }
  }

  const canProceed = title && decisionType && problemStatement && riskLevel;

  return (
    <div className="max-w-3xl">
      <button onClick={() => onNavigate({ page: "decisions" })} className="mb-4 flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700">
        <ArrowLeft size={14} /> Back to decisions
      </button>

      <h1 className="text-2xl font-semibold mb-6">New Decision Request</h1>

      {/* Step indicators */}
      <div className="mt-4 mb-6 flex gap-3 text-sm">
        {["Context", "Options", "Board", "Submit"].map((label, i) => (
          <button key={label} onClick={() => setStep(i + 1)} className={`rounded-full px-3 py-1 ${step === i + 1 ? "bg-neutral-900 text-white" : step > i + 1 ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-600"}`}>
            {i + 1}. {label}
          </button>
        ))}
      </div>

      {/* Step 1 — Context */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Title *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="e.g. Select messaging platform for event-driven architecture" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Decision Type *</label>
            <select value={decisionType} onChange={(e) => setDecisionType(e.target.value)} className={inputClass}>
              <option value="">Select type</option>
              {DECISION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Problem Statement *</label>
            <textarea value={problemStatement} onChange={(e) => setProblemStatement(e.target.value)} rows={6} className={inputClass} placeholder="What decision needs to be made and why?" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">Risk Level *</label>
            <div className="flex gap-3">
              {RISK_LEVELS.map((r) => (
                <button key={r} onClick={() => setRiskLevel(r)} className={`rounded-md border px-4 py-2 text-sm capitalize ${riskLevel === r ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 hover:bg-neutral-50"}`}>
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Domain</label>
              <select value={domainId} onChange={(e) => setDomainId(e.target.value)} className={inputClass}>
                <option value="">None</option>
                {domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Decision Needed By</label>
              <input type="date" value={desiredBy} onChange={(e) => setDesiredBy(e.target.value)} className={inputClass} />
            </div>
          </div>
          <button onClick={() => setStep(2)} disabled={!canProceed} className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-40">
            Next: Options
          </button>
        </div>
      )}

      {/* Step 2 — Options */}
      {step === 2 && (
        <div className="space-y-4">
          <p className="text-sm text-neutral-500">Define 1-5 options to evaluate. You can skip if you don&apos;t have options yet.</p>
          {options.map((opt, i) => (
            <div key={i} className="rounded-lg border border-neutral-200 bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-neutral-600">Option {i + 1}</span>
                {options.length > 1 && (
                  <button onClick={() => removeOption(i)} className="text-neutral-400 hover:text-red-500"><Trash2 size={14} /></button>
                )}
              </div>
              <input value={opt.label} onChange={(e) => updateOption(i, "label", e.target.value)} className={`${inputClass} mb-2`} placeholder="Option name" />
              <textarea value={opt.description} onChange={(e) => updateOption(i, "description", e.target.value)} rows={3} className={inputClass} placeholder="Describe this option" />
            </div>
          ))}
          {options.length < 5 && (
            <button onClick={addOption} className="flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-900">
              <Plus size={14} /> Add another option
            </button>
          )}
          <div className="flex gap-2">
            <button onClick={() => setStep(1)} className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">Back</button>
            <button onClick={() => { loadBoardsForRequest(); setStep(3); }} className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800">Next: Board Assignment</button>
            <button onClick={() => { setOptions([]); loadBoardsForRequest(); setStep(3); }} className="rounded-md border border-neutral-300 px-4 py-2 text-sm text-neutral-500 hover:bg-neutral-50">Skip — no options yet</button>
          </div>
        </div>
      )}

      {/* Step 3 — Board Assignment */}
      {step === 3 && (
        <div className="space-y-4">
          <p className="text-sm text-neutral-500">Select the ARB board that should review this decision.</p>

          {loadingBoards ? (
            <div className="flex items-center gap-2 text-sm text-neutral-500"><Loader2 size={16} className="animate-spin" /> Loading boards...</div>
          ) : boardGroups ? (
            <div className="space-y-3">
              {boardGroups.domain_boards.length > 0 && (
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-blue-600">Domain Boards</div>
                  <div className="space-y-1">
                    {boardGroups.domain_boards.map((b) => (
                      <button key={b.id} onClick={() => setSelectedBoardId(b.id)} className={`w-full rounded-lg border p-3 text-left text-sm ${selectedBoardId === b.id ? "border-neutral-900 bg-neutral-50 ring-1 ring-neutral-900" : "border-neutral-200 hover:bg-neutral-50"}`}>
                        <span className="font-medium">{b.name}</span>
                        <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700">Domain-scoped</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {boardGroups.topic_boards.length > 0 && (
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-purple-600">Topic Boards</div>
                  <div className="space-y-1">
                    {boardGroups.topic_boards.map((b) => (
                      <button key={b.id} onClick={() => setSelectedBoardId(b.id)} className={`w-full rounded-lg border p-3 text-left text-sm ${selectedBoardId === b.id ? "border-neutral-900 bg-neutral-50 ring-1 ring-neutral-900" : "border-neutral-200 hover:bg-neutral-50"}`}>
                        <span className="font-medium">{b.name}</span>
                        <span className="ml-2 rounded bg-purple-50 px-1.5 py-0.5 text-[10px] text-purple-700">Topic-scoped</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {boardGroups.enterprise_boards.length > 0 && (
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-amber-600">Enterprise ARB</div>
                  <div className="space-y-1">
                    {boardGroups.enterprise_boards.map((b) => (
                      <button key={b.id} onClick={() => setSelectedBoardId(b.id)} className={`w-full rounded-lg border p-3 text-left text-sm ${selectedBoardId === b.id ? "border-neutral-900 bg-neutral-50 ring-1 ring-neutral-900" : "border-neutral-200 hover:bg-neutral-50"}`}>
                        <span className="font-medium">{b.name}</span>
                        <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">Always available</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {boardGroups.domain_boards.length === 0 && boardGroups.topic_boards.length === 0 && boardGroups.enterprise_boards.length === 0 && (
                <div className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
                  No boards available. Ask an admin to create ARB boards in Settings.
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-neutral-400">Select domain and decision type in Step 1 to see available boards.</div>
          )}

          <p className="text-xs text-neutral-400">Not sure? Choose the most specific board. The chair can reassign after submission.</p>

          <div className="flex gap-2">
            <button onClick={() => setStep(2)} className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">Back</button>
            <button onClick={() => setStep(4)} disabled={!selectedBoardId} className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-40">
              Next: Review
            </button>
          </div>
        </div>
      )}

      {/* Step 4 — Submit */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="rounded-lg border border-neutral-200 bg-white p-4 space-y-3">
            <div><div className="text-xs font-medium uppercase text-neutral-400">Title</div><div className="text-sm font-semibold">{title}</div></div>
            <div className="grid grid-cols-3 gap-3">
              <div><div className="text-xs font-medium uppercase text-neutral-400">Type</div><div className="text-sm">{DECISION_TYPES.find((t) => t.value === decisionType)?.label}</div></div>
              <div><div className="text-xs font-medium uppercase text-neutral-400">Risk</div><div className="text-sm capitalize">{riskLevel}</div></div>
              <div><div className="text-xs font-medium uppercase text-neutral-400">Needed By</div><div className="text-sm">{desiredBy || "—"}</div></div>
            </div>
            <div><div className="text-xs font-medium uppercase text-neutral-400">Problem</div><div className="text-sm text-neutral-600 mt-1">{problemStatement}</div></div>
            {options.filter((o) => o.label).length > 0 && (
              <div>
                <div className="text-xs font-medium uppercase text-neutral-400 mb-2">Options ({options.filter((o) => o.label).length})</div>
                {options.filter((o) => o.label).map((o, i) => (
                  <div key={i} className="ml-2 mb-1 text-sm"><span className="font-medium">{o.label}</span>: {o.description}</div>
                ))}
              </div>
            )}
            {selectedBoardId && boardGroups && (
              <div>
                <div className="text-xs font-medium uppercase text-neutral-400">Assigned Board</div>
                <div className="text-sm font-medium mt-1">
                  {[...boardGroups.domain_boards, ...boardGroups.topic_boards, ...boardGroups.enterprise_boards].find((b) => b.id === selectedBoardId)?.name ?? selectedBoardId}
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button onClick={() => setStep(3)} className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">Back</button>
            <button onClick={() => handleSubmit(false)} disabled={saving} className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50">
              {saving ? "Saving..." : "Save Draft"}
            </button>
            <button onClick={() => handleSubmit(true)} disabled={saving || !canProceed || !selectedBoardId} className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-50">
              {saving ? "Submitting..." : "Submit for Review"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
