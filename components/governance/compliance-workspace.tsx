"use client";

import { useState } from "react";
import { Loader2, FileText, GitBranch } from "lucide-react";
import { useToast } from "@/hooks/useToast";

interface ComplianceResult {
  policy_id: string;
  policy_statement: string;
  severity: string;
  status: "compliant" | "non_compliant" | "not_applicable" | "needs_review";
  findings: string;
  evidence: string;
  remediation?: string;
}

interface ComplianceReport {
  summary: { total: number; compliant: number; nonCompliant: number; notApplicable: number; needsReview?: number };
  results: ComplianceResult[];
  timestamp: string;
  standardsCount: number;
}

const STATUS_COLORS: Record<string, string> = {
  compliant: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  non_compliant: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  not_applicable: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  needs_review: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};

const STATUS_LABELS: Record<string, string> = {
  compliant: "Compliant",
  non_compliant: "Non-Compliant",
  not_applicable: "N/A",
  needs_review: "Needs Review",
};

export function ComplianceWorkspace() {
  const [inputType, setInputType] = useState<"document" | "repo">("document");
  const [content, setContent] = useState("");
  const [checking, setChecking] = useState(false);
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const { toast, showToast, setToast } = useToast();

  async function runCheck() {
    if (!content.trim()) { showToast("Please enter content to analyze", "error"); return; }
    setChecking(true);
    setReport(null);

    try {
      const token = (await (await import("@/lib/supabaseClient")).supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch("/api/compliance-check", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type: inputType, content }),
      });
      const data = await res.json();
      if (data.error) {
        showToast(data.error, "error");
      } else {
        setReport(data);
      }
    } catch {
      showToast("Network error. Please try again.", "error");
    } finally {
      setChecking(false);
    }
  }

  const compliancePercent = report?.summary
    ? Math.round((report.summary.compliant / Math.max(report.summary.total - (report.summary.notApplicable ?? 0), 1)) * 100)
    : 0;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-subtle">
      {/* Toolbar */}
      <div className="shrink-0 border-b border-border/50 bg-surface-elevated px-4 py-2.5 shadow-sm">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-foreground">Compliance Check</h2>
          <span className="text-xs text-muted-foreground">Verify code or documents against approved standards</span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Input */}
        <div className="flex w-1/2 flex-col border-r border-border/60 p-4">
          {/* Input type toggle */}
          <div className="mb-3 flex gap-2">
            <button
              type="button"
              onClick={() => setInputType("document")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                inputType === "document"
                  ? "bg-brand-primary text-white"
                  : "border border-border/70 bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              Document / Code
            </button>
            <button
              type="button"
              onClick={() => setInputType("repo")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                inputType === "repo"
                  ? "bg-brand-primary text-white"
                  : "border border-border/70 bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              <GitBranch className="h-3.5 w-3.5" />
              Repository Description
            </button>
          </div>

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={
              inputType === "document"
                ? "Paste your solution document, architecture design, or code here..."
                : "Describe the repository: tech stack, architecture, deployment model, security measures, etc."
            }
            className="flex-1 resize-none rounded-lg border border-border/70 bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
          />

          <button
            type="button"
            disabled={checking || !content.trim()}
            onClick={runCheck}
            className="mt-3 inline-flex items-center justify-center gap-2 rounded-md bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-primary/90 disabled:opacity-50"
          >
            {checking ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              "Run Compliance Check"
            )}
          </button>
        </div>

        {/* Right: Results */}
        <div className="flex w-1/2 flex-col overflow-hidden p-4">
          {!report && !checking && (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <p className="text-sm font-medium text-muted-foreground">No results yet</p>
                <p className="text-xs text-muted-foreground">Paste content and run the compliance check</p>
              </div>
            </div>
          )}

          {checking && (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-brand-primary" />
                <p className="text-sm font-medium text-foreground">Analyzing against approved standards...</p>
                <p className="text-xs text-muted-foreground">This may take a moment</p>
              </div>
            </div>
          )}

          {report && (
            <div className="flex flex-col gap-4 overflow-hidden">
              {/* Summary cards */}
              <div className="grid grid-cols-4 gap-2">
                <div className="rounded-lg border border-border/60 bg-background p-3 text-center">
                  <p className="text-xl font-bold text-foreground">{report.summary.total}</p>
                  <p className="text-[10px] font-medium uppercase text-muted-foreground">Total</p>
                </div>
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-center dark:border-green-800 dark:bg-green-950/30">
                  <p className="text-xl font-bold text-green-700 dark:text-green-300">{report.summary.compliant}</p>
                  <p className="text-[10px] font-medium uppercase text-green-600 dark:text-green-400">Compliant</p>
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center dark:border-red-800 dark:bg-red-950/30">
                  <p className="text-xl font-bold text-red-700 dark:text-red-300">{report.summary.nonCompliant}</p>
                  <p className="text-[10px] font-medium uppercase text-red-600 dark:text-red-400">Non-Compliant</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-background p-3 text-center">
                  <p className="text-xl font-bold text-foreground">{compliancePercent}%</p>
                  <p className="text-[10px] font-medium uppercase text-muted-foreground">Score</p>
                </div>
              </div>

              {/* Results table */}
              <div className="flex-1 overflow-auto rounded-lg border border-border/60">
                <table className="w-full border-collapse text-xs">
                  <thead className="sticky top-0 border-b border-border/70 bg-surface-elevated/95">
                    <tr>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Policy</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Severity</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Findings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.results.map((r, i) => (
                      <tr key={i} className="border-b border-border/40">
                        <td className="whitespace-nowrap px-3 py-2 font-mono font-medium text-foreground">{r.policy_id}</td>
                        <td className="whitespace-nowrap px-3 py-2">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${
                            r.severity === "blocking" ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                            : r.severity === "warning" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                            : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                          }`}>{r.severity}</span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLORS[r.status] ?? ""}`}>
                            {STATUS_LABELS[r.status] ?? r.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-foreground/80">
                          <p className="line-clamp-2">{r.findings}</p>
                          {r.status === "non_compliant" && r.remediation && (
                            <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-400">Fix: {r.remediation}</p>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-[10px] text-muted-foreground">
                Checked {report.standardsCount} standards at {new Date(report.timestamp).toLocaleString()}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed left-1/2 top-5 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg ${
            toast.type === "success"
              ? "border-green-300 bg-green-50 text-green-900 dark:border-green-700 dark:bg-green-950/40 dark:text-green-100"
              : toast.type === "error"
              ? "border-red-300 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950/40 dark:text-red-100"
              : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
          }`}
        >
          <span>{toast.message}</span>
          <button type="button" onClick={() => setToast(null)} className="ml-2 text-xs opacity-60 hover:opacity-100">✕</button>
        </div>
      )}
    </div>
  );
}
