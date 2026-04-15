"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ArrowLeft, Loader2, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { PATTERN_CLAUSE_TYPE_LABELS, SEVERITY_COLORS } from "@/lib/truly-govern/constants";
import type { GovernanceView } from "@/lib/truly-govern/governance-views";

interface PatternData { id: string; name: string; problem: string; solution: string; when_to_use: string | null; when_not_to_use: string | null; completeness_score: number | null; status: string; created_by: string }
interface ClauseData { id: string; clause_type: string; title: string; description: string; policy_clause_id: string | null; severity: string | null }
interface ChecklistItem { question: string; severity: string }

interface PatternReviewWorkspaceProps { patternId: string; onNavigate: (view: GovernanceView) => void }

const CLAUSE_TYPE_COLORS: Record<string, string> = { constraint: "bg-red-50 text-red-700", guidance: "bg-blue-50 text-blue-700", variant: "bg-purple-50 text-purple-700" };

export default function PatternReviewWorkspace({ patternId, onNavigate }: PatternReviewWorkspaceProps) {
  const [pattern, setPattern] = useState<PatternData | null>(null);
  const [clauses, setClauses] = useState<ClauseData[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingChecklist, setLoadingChecklist] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [notes, setNotes] = useState("");
  const [showModal, setShowModal] = useState<"approve" | "changes" | "reject" | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUserId(user?.id ?? null);
    const [patRes, clauseRes] = await Promise.all([
      supabase.from("architecture_patterns").select("*").eq("id", patternId).single(),
      fetch(`/api/truly-govern/patterns/clauses?pattern_id=${patternId}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
    ]);
    setPattern(patRes.data);
    setClauses(clauseRes.data ?? []);
    setLoading(false);

    // Load AI checklist
    const checkRes = await fetch("/api/truly-govern/patterns/review-checklist", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ pattern_id: patternId }),
    });
    const checkJson = await checkRes.json();
    setChecklist(checkJson.items ?? []);
    setLoadingChecklist(false);
  }, [patternId]);

  useEffect(() => { load(); }, [load]);

  async function handleAction(action: "approve" | "request_changes" | "reject") {
    setActionLoading(true);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    await fetch("/api/truly-govern/patterns/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ pattern_id: patternId, action, notes: notes || undefined }),
    });
    setActionLoading(false);
    setShowModal(null);
    onNavigate({ page: "patterns-detail", id: patternId });
  }

  if (loading) return <div className="flex items-center gap-2 text-sm text-neutral-500"><Loader2 size={16} className="animate-spin" /> Loading...</div>;
  if (!pattern) return <div className="text-sm text-neutral-500">Pattern not found.</div>;

  const isOwnPattern = currentUserId === pattern.created_by;

  return (
    <div className="max-w-6xl">
      <button onClick={() => onNavigate({ page: "patterns-detail", id: patternId })} className="mb-4 flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700"><ArrowLeft size={14} /> Back to pattern</button>
      <h1 className="text-xl font-semibold mb-4">Review: {pattern.name}</h1>

      <div className="flex gap-6">
        {/* Left: Pattern content */}
        <div className="flex-[3] space-y-4">
          <div className="rounded-lg border border-neutral-200 bg-white p-4">
            <h3 className="text-xs font-semibold uppercase text-neutral-400 mb-1">Problem</h3>
            <p className="text-sm text-neutral-700">{pattern.problem}</p>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-white p-4">
            <h3 className="text-xs font-semibold uppercase text-neutral-400 mb-1">Solution</h3>
            <p className="text-sm text-neutral-600">{pattern.solution}</p>
          </div>
          {pattern.when_to_use && <div className="rounded-lg border border-neutral-200 bg-white p-4"><h3 className="text-xs font-semibold uppercase text-neutral-400 mb-1">When to Use</h3><p className="text-sm text-neutral-600">{pattern.when_to_use}</p></div>}
          {pattern.when_not_to_use && <div className="rounded-lg border border-neutral-200 bg-white p-4"><h3 className="text-xs font-semibold uppercase text-neutral-400 mb-1">When NOT to Use</h3><p className="text-sm text-neutral-600">{pattern.when_not_to_use}</p></div>}

          <h3 className="text-xs font-semibold uppercase text-neutral-400">Clauses ({clauses.length})</h3>
          <div className="space-y-2">
            {clauses.map((c) => (
              <div key={c.id} className="rounded-lg border border-neutral-200 bg-white p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${CLAUSE_TYPE_COLORS[c.clause_type] ?? "bg-neutral-100"}`}>{PATTERN_CLAUSE_TYPE_LABELS[c.clause_type as keyof typeof PATTERN_CLAUSE_TYPE_LABELS]}</span>
                  {c.severity && <span className={`rounded-full px-2 py-0.5 text-[10px] ${SEVERITY_COLORS[c.severity as keyof typeof SEVERITY_COLORS] ?? ""}`}>{c.severity}</span>}
                  <span className="text-sm font-medium">{c.title}</span>
                  {c.policy_clause_id && <span className="text-[10px] text-blue-600">linked</span>}
                </div>
                <p className="text-xs text-neutral-600 ml-1">{c.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Reviewer panel */}
        <div className="flex-[2] space-y-4">
          <div className="rounded-lg border border-neutral-200 bg-white p-4">
            <h3 className="text-xs font-semibold uppercase text-neutral-400 mb-2">Completeness</h3>
            <div className={`text-lg font-bold ${(pattern.completeness_score ?? 0) >= 60 ? "text-emerald-600" : "text-amber-600"}`}>{pattern.completeness_score ?? 0}%</div>
          </div>

          <div className="rounded-lg border border-neutral-200 bg-white p-4">
            <h3 className="text-xs font-semibold uppercase text-neutral-400 mb-2">AI Reviewer Checklist</h3>
            {loadingChecklist ? (
              <div className="flex items-center gap-2 text-xs text-neutral-500"><Loader2 size={12} className="animate-spin" /> Generating...</div>
            ) : (
              <div className="space-y-2">
                {checklist.map((item, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    {item.severity === "critical" ? <XCircle size={12} className="mt-0.5 text-red-500 shrink-0" /> : item.severity === "warning" ? <AlertTriangle size={12} className="mt-0.5 text-amber-500 shrink-0" /> : <CheckCircle size={12} className="mt-0.5 text-blue-500 shrink-0" />}
                    <span className="text-neutral-700">{item.question}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          {isOwnPattern ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-700">You authored this pattern — you cannot review it.</div>
          ) : pattern.status === "in_review" ? (
            <div className="space-y-2">
              <button onClick={() => { setShowModal("approve"); setNotes(""); }} className="w-full rounded-md bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700">Approve</button>
              <button onClick={() => { setShowModal("changes"); setNotes(""); }} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50">Request Changes</button>
              <button onClick={() => { setShowModal("reject"); setNotes(""); }} className="w-full rounded-md border border-red-300 px-3 py-2 text-sm text-red-600 hover:bg-red-50">Reject</button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Action modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold mb-3">{showModal === "approve" ? "Approve Pattern" : showModal === "changes" ? "Request Changes" : "Reject Pattern"}</h3>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm mb-3" placeholder={showModal === "approve" ? "Optional reviewer note..." : "Required — explain what needs to change..."} />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowModal(null)} className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">Cancel</button>
              <button onClick={() => handleAction(showModal === "changes" ? "request_changes" : showModal)} disabled={actionLoading || (showModal !== "approve" && !notes.trim())} className={`rounded-md px-4 py-2 text-sm text-white disabled:opacity-50 ${showModal === "approve" ? "bg-emerald-600 hover:bg-emerald-700" : showModal === "reject" ? "bg-red-600 hover:bg-red-700" : "bg-neutral-900 hover:bg-neutral-800"}`}>
                {actionLoading ? "Processing..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
