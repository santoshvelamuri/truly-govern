"use client";

import { Pencil, Save, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";

import type { StandardPolicy } from "@/types/standard-policy";

interface StandardsPropertiesProps {
  policy: StandardPolicy | null;
  onUpdate: (id: string, updates: Partial<StandardPolicy>) => void;
  onDelete: (id: string) => void;
  techDomainNames?: string[];
}

const STATUS_OPTIONS: StandardPolicy["status"][] = ["draft", "in_review", "approved", "active", "deprecated"];
const SEVERITY_OPTIONS: StandardPolicy["rule_severity"][] = ["blocking", "warning", "advisory"];

const fieldInputClass =
  "rounded-md border border-border/70 bg-background px-2 py-1.5 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30";
const fieldViewClass =
  "rounded-md border border-border/50 bg-surface-subtle px-2 py-1.5 text-sm";

function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium">
      {label}
      {children}
    </label>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="mt-2 border-b border-border/50 pb-1 text-[10px] font-semibold uppercase tracking-wider text-foreground/50">
      {title}
    </div>
  );
}

export function StandardsProperties({ policy, onUpdate, onDelete, techDomainNames = [] }: StandardsPropertiesProps) {
  const { isAdmin } = useCurrentUser();
  const [isEditMode, setIsEditMode] = useState(false);
  const [draft, setDraft] = useState<StandardPolicy | null>(null);

  if (!policy) {
    return (
      <div className="rounded-lg border border-border/60 bg-background px-3 py-10 text-center shadow-sm">
        <p className="text-sm font-medium text-muted-foreground">No policy selected</p>
        <p className="text-xs text-muted-foreground">Select a policy from the table.</p>
      </div>
    );
  }

  function enterEdit() {
    setDraft({ ...policy! });
    setIsEditMode(true);
  }

  function cancelEdit() {
    setDraft(null);
    setIsEditMode(false);
  }

  function saveEdit() {
    if (!draft) return;
    onUpdate(policy!.id, { ...draft });
    setDraft(null);
    setIsEditMode(false);
  }

  function confirmDelete() {
    const ok = window.confirm(`Delete policy "${policy!.policy_id}"?`);
    if (ok) onDelete(policy!.id);
  }

  function updateDraft(updates: Partial<StandardPolicy>) {
    setDraft((prev) => (prev ? { ...prev, ...updates } : prev));
  }

  const values = isEditMode && draft ? draft : policy;

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground/50">Policy</span>
          <h2 className="mt-0.5 font-mono text-sm font-semibold leading-snug text-foreground">{policy.policy_id}</h2>
        </div>
        {!isEditMode ? (
          <div className="flex shrink-0 items-center gap-1">
            <button onClick={enterEdit} className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:border-brand-primary hover:text-brand-primary">
              <Pencil className="h-3 w-3" /> Edit
            </button>
            {isAdmin && (
            <button onClick={confirmDelete} className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:border-destructive hover:text-destructive">
              <Trash2 className="h-3 w-3" /> Delete
            </button>
            )}
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-1">
            <button onClick={saveEdit} className="inline-flex items-center gap-1 rounded-md bg-brand-primary px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-brand-primary/90">
              <Save className="h-3 w-3" /> Save
            </button>
            <button onClick={cancelEdit} className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:border-destructive hover:text-destructive">
              <X className="h-3 w-3" /> Cancel
            </button>
          </div>
        )}
      </div>

      {/* Fields */}
      <div className="grid grid-cols-1 gap-3 rounded-lg border border-border/60 bg-background p-3 shadow-sm">

        <div className="grid grid-cols-2 gap-2">
          <PropRow label="Status">
            {isEditMode ? (
              <select value={values.status} onChange={(e) => updateDraft({ status: e.target.value as StandardPolicy["status"] })} className={fieldInputClass}>
                {STATUS_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            ) : <p className={fieldViewClass}>{values.status}</p>}
          </PropRow>
          <PropRow label="Version">
            {isEditMode ? (
              <input value={values.version} onChange={(e) => updateDraft({ version: e.target.value })} className={fieldInputClass} />
            ) : <p className={fieldViewClass}>{values.version}</p>}
          </PropRow>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <PropRow label="Domain">
            {isEditMode ? (
              <select value={values.domain} onChange={(e) => updateDraft({ domain: e.target.value })} className={fieldInputClass}>
                {techDomainNames.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            ) : <p className={fieldViewClass}>{values.domain}</p>}
          </PropRow>
          <PropRow label="Subdomain">
            {isEditMode ? (
              <input value={values.subdomain} onChange={(e) => updateDraft({ subdomain: e.target.value })} className={fieldInputClass} />
            ) : <p className={fieldViewClass}>{values.subdomain}</p>}
          </PropRow>
        </div>

        <SectionHeader title="Rule" />

        <PropRow label="Statement">
          {isEditMode ? (
            <textarea value={values.rule_statement} rows={3} onChange={(e) => updateDraft({ rule_statement: e.target.value })} className={`${fieldInputClass} resize-none`} />
          ) : <p className={`${fieldViewClass} min-h-[3rem] whitespace-pre-wrap`}>{values.rule_statement}</p>}
        </PropRow>

        <PropRow label="Rationale">
          {isEditMode ? (
            <textarea value={values.rule_rationale} rows={3} onChange={(e) => updateDraft({ rule_rationale: e.target.value })} className={`${fieldInputClass} resize-none`} />
          ) : <p className={`${fieldViewClass} min-h-[3rem] whitespace-pre-wrap`}>{values.rule_rationale}</p>}
        </PropRow>

        <PropRow label="Severity">
          {isEditMode ? (
            <select value={values.rule_severity} onChange={(e) => updateDraft({ rule_severity: e.target.value as StandardPolicy["rule_severity"] })} className={fieldInputClass}>
              {SEVERITY_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          ) : <p className={fieldViewClass}>{values.rule_severity}</p>}
        </PropRow>

        <SectionHeader title="Remediation" />

        <PropRow label="Hint">
          {isEditMode ? (
            <textarea value={values.remediation_hint} rows={2} onChange={(e) => updateDraft({ remediation_hint: e.target.value })} className={`${fieldInputClass} resize-none`} />
          ) : <p className={`${fieldViewClass} whitespace-pre-wrap`}>{values.remediation_hint}</p>}
        </PropRow>

        <PropRow label="Docs URL">
          {isEditMode ? (
            <input value={values.remediation_docs_url ?? ""} onChange={(e) => updateDraft({ remediation_docs_url: e.target.value })} className={fieldInputClass} placeholder="https://…" />
          ) : values.remediation_docs_url ? (
            <a href={values.remediation_docs_url} target="_blank" rel="noreferrer" className={`${fieldViewClass} truncate text-brand-primary underline underline-offset-2`}>{values.remediation_docs_url}</a>
          ) : <p className={fieldViewClass}>—</p>}
        </PropRow>

        <SectionHeader title="Provenance" />

        <PropRow label="Source Document">
          <p className={fieldViewClass}>{values.source_document ?? "—"}</p>
        </PropRow>

        <PropRow label="Source Section">
          <p className={fieldViewClass}>{values.source_section ?? "—"}</p>
        </PropRow>

        <PropRow label="Confidence">
          <p className={fieldViewClass}>{values.provenance?.confidence != null ? `${Math.round(values.provenance.confidence * 100)}%` : "—"}</p>
        </PropRow>

        <SectionHeader title="Lifecycle" />

        <div className="grid grid-cols-2 gap-2">
          <PropRow label="Approved By">
            {isEditMode ? (
              <input value={values.approved_by ?? ""} onChange={(e) => updateDraft({ approved_by: e.target.value })} className={fieldInputClass} />
            ) : <p className={fieldViewClass}>{values.approved_by ?? "—"}</p>}
          </PropRow>
          <PropRow label="Review Date">
            {isEditMode ? (
              <input type="date" value={values.review_date ?? ""} onChange={(e) => updateDraft({ review_date: e.target.value })} className={fieldInputClass} />
            ) : <p className={fieldViewClass}>{values.review_date ?? "—"}</p>}
          </PropRow>
        </div>

        <PropRow label="Tags">
          <div className={`${fieldViewClass} flex min-h-[2rem] flex-wrap gap-1`}>
            {values.tags.length > 0
              ? values.tags.map((tag) => (
                  <span key={tag} className="rounded bg-brand-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-brand-primary">
                    {tag}
                  </span>
                ))
              : <span className="text-muted-foreground">—</span>}
          </div>
        </PropRow>

      </div>

      {/* Workflow Actions */}
      {!isEditMode && (
        <div className="rounded-lg border border-border/60 bg-background p-3 shadow-sm">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-foreground/50">Workflow</div>
          <div className="flex flex-wrap gap-2">
            {policy.status === "draft" && (
              <button
                onClick={() => onUpdate(policy.id, { status: "in_review" })}
                className="rounded-md bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-600"
              >
                Submit for Review
              </button>
            )}
            {policy.status === "in_review" && (
              <>
                <button
                  onClick={() => onUpdate(policy.id, { status: "approved", approved_at: new Date().toISOString(), approved_by: "architect" })}
                  className="rounded-md bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-cyan-700"
                >
                  Approve
                </button>
                <button
                  onClick={() => onUpdate(policy.id, { status: "draft" })}
                  className="rounded-md border border-border/70 bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  Reject
                </button>
              </>
            )}
            {policy.status === "approved" && (
              <>
                <button
                  onClick={() => onUpdate(policy.id, { status: "active" })}
                  className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-green-700"
                >
                  Activate
                </button>
                <button
                  onClick={() => onUpdate(policy.id, { status: "deprecated" })}
                  className="rounded-md border border-border/70 bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  Deprecate
                </button>
              </>
            )}
            {policy.status === "active" && (
              <button
                onClick={() => onUpdate(policy.id, { status: "deprecated" })}
                className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 dark:border-red-700 dark:bg-red-950/30 dark:text-red-300"
              >
                Deprecate
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
