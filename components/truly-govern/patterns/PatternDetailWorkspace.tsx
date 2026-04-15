"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ArrowLeft, Loader2, Download, ArrowRightLeft, Pencil } from "lucide-react";
import { PATTERN_STATUS_LABELS, PATTERN_CLAUSE_TYPE_LABELS, SEVERITY_COLORS } from "@/lib/truly-govern/constants";
import type { GovernanceView } from "@/lib/truly-govern/governance-views";

interface PatternData { id: string; name: string; problem: string; solution: string; forces: string; consequences: string; when_to_use: string | null; when_not_to_use: string | null; domain_id: string | null; status: string; completeness_score: number | null; known_uses: string[]; superseded_by: string | null; created_at: string; updated_at: string }
interface ClauseData { id: string; clause_type: string; title: string; description: string; policy_clause_id: string | null; severity: string | null; clause_number: number }

interface PatternDetailWorkspaceProps { patternId: string; onNavigate: (view: GovernanceView) => void }

const STATUS_COLORS: Record<string, string> = { draft: "bg-blue-50 text-blue-700", in_review: "bg-amber-50 text-amber-700", approved: "bg-emerald-50 text-emerald-700", deprecated: "bg-neutral-100 text-neutral-500" };
const CLAUSE_TYPE_COLORS: Record<string, string> = { constraint: "bg-red-50 text-red-700", guidance: "bg-blue-50 text-blue-700", variant: "bg-purple-50 text-purple-700" };

export default function PatternDetailWorkspace({ patternId, onNavigate }: PatternDetailWorkspaceProps) {
  const [pattern, setPattern] = useState<PatternData | null>(null);
  const [clauses, setClauses] = useState<ClauseData[]>([]);
  const [loading, setLoading] = useState(true);
  const [domainName, setDomainName] = useState<string | null>(null);
  const [tab, setTab] = useState<"clauses" | "usage">("clauses");

  const load = useCallback(async () => {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const [patRes, clauseRes] = await Promise.all([
      supabase.from("architecture_patterns").select("*").eq("id", patternId).single(),
      fetch(`/api/truly-govern/patterns/clauses?pattern_id=${patternId}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
    ]);
    setPattern(patRes.data);
    setClauses(clauseRes.data ?? []);
    if (patRes.data?.domain_id) {
      const { data: dom } = await supabase.from("capability_domains").select("name").eq("id", patRes.data.domain_id).single();
      setDomainName(dom?.name ?? null);
    }
    setLoading(false);
  }, [patternId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex items-center gap-2 text-sm text-neutral-500"><Loader2 size={16} className="animate-spin" /> Loading...</div>;
  if (!pattern) return <div className="text-sm text-neutral-500">Pattern not found.</div>;

  const statusLabel = PATTERN_STATUS_LABELS[pattern.status as keyof typeof PATTERN_STATUS_LABELS] ?? pattern.status;

  return (
    <div className="max-w-4xl">
      <button onClick={() => onNavigate({ page: "patterns" })} className="mb-4 flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700"><ArrowLeft size={14} /> Back to patterns</button>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{pattern.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-full px-2 py-0.5 ${STATUS_COLORS[pattern.status] ?? "bg-neutral-100"}`}>{statusLabel}</span>
            <span className="rounded-full bg-neutral-100 px-2 py-0.5">{domainName ?? "Cross-domain"}</span>
            {pattern.completeness_score != null && <span className={`rounded-full px-2 py-0.5 ${pattern.completeness_score >= 60 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{pattern.completeness_score}%</span>}
            <span className="text-neutral-400">{new Date(pattern.created_at).toLocaleDateString()}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {pattern.status === "in_review" && (
            <button onClick={() => onNavigate({ page: "patterns-review", id: patternId })} className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-800">Review</button>
          )}
          {(pattern.status === "draft" || pattern.status === "in_review") && (
            <button onClick={() => onNavigate({ page: "patterns-new" })} className="rounded-md border border-neutral-300 p-1.5 text-neutral-400 hover:bg-neutral-50"><Pencil size={14} /></button>
          )}
        </div>
      </div>

      {/* Nygard-style sections */}
      <div className="space-y-4 mb-6">
        <Section title="Problem"><p className="text-sm text-neutral-700 leading-relaxed">{pattern.problem}</p></Section>
        <Section title="Solution Overview"><p className="text-sm text-neutral-600 leading-relaxed">{pattern.solution}</p></Section>
        {pattern.when_to_use && <Section title="When to Use"><p className="text-sm text-neutral-600 leading-relaxed">{pattern.when_to_use}</p></Section>}
        {pattern.when_not_to_use && <Section title="When NOT to Use"><p className="text-sm text-neutral-600 leading-relaxed">{pattern.when_not_to_use}</p></Section>}
        {pattern.known_uses.length > 0 && <Section title="Known Uses"><div className="flex flex-wrap gap-1">{pattern.known_uses.map((u) => <span key={u} className="rounded bg-neutral-100 px-2 py-0.5 text-xs">{u}</span>)}</div></Section>}
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 border-b border-neutral-200">
        {(["clauses", "usage"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`border-b-2 px-4 py-2 text-sm capitalize ${tab === t ? "border-neutral-900 font-medium text-neutral-900" : "border-transparent text-neutral-500"}`}>
            {t === "clauses" ? `Clauses (${clauses.length})` : "Usage"}
          </button>
        ))}
      </div>

      {tab === "clauses" && (
        <div className="space-y-2">
          {clauses.map((c, i) => (
            <div key={c.id} className="rounded-lg border border-neutral-200 bg-white p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-neutral-400 font-mono">#{i + 1}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${CLAUSE_TYPE_COLORS[c.clause_type] ?? "bg-neutral-100"}`}>
                  {PATTERN_CLAUSE_TYPE_LABELS[c.clause_type as keyof typeof PATTERN_CLAUSE_TYPE_LABELS] ?? c.clause_type}
                </span>
                {c.severity && <span className={`rounded-full px-2 py-0.5 text-[10px] ${SEVERITY_COLORS[c.severity as keyof typeof SEVERITY_COLORS] ?? ""}`}>{c.severity}</span>}
                <span className="text-sm font-medium">{c.title}</span>
              </div>
              <p className="text-sm text-neutral-600 ml-6">{c.description}</p>
              {c.policy_clause_id && <div className="ml-6 mt-1 text-[10px] text-blue-600">Linked to policy clause</div>}
            </div>
          ))}
          {clauses.length === 0 && <div className="text-sm text-neutral-500">No clauses defined.</div>}
        </div>
      )}

      {tab === "usage" && (
        <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
          Usage tracking — shows reviews linked to this pattern. Coming with TG-085.
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">{title}</h2><div className="rounded-lg border border-neutral-200 bg-white p-4">{children}</div></div>;
}
