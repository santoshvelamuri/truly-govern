"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ArrowLeft, Loader2, CheckCircle, XCircle, AlertTriangle, MinusCircle, ChevronDown, Send, Pencil, UserCheck, X } from "lucide-react";
import { REVIEW_STATUS_LABELS, RISK_COLORS, SEVERITY_COLORS } from "@/lib/truly-govern/constants";
import type { GovernanceView } from "@/lib/truly-govern/governance-views";
import ReviewDecisionModal from "@/components/truly-govern/reviews/ReviewDecisionModal";

interface ReviewData {
  id: string;
  title: string;
  description: string | null;
  domain_id: string | null;
  risk_level: string | null;
  status: string;
  tech_stack: string[];
  integrations: string[];
  regulatory_scope: string[];
  custom_fields: Record<string, unknown>;
  completeness_score: number | null;
  submitted_by: string;
  assigned_reviewer_id: string | null;
  assigned_at: string | null;
  created_at: string;
  updated_at: string;
}

interface OrgMember {
  id: string;
  display_name: string | null;
  email: string | null;
}

interface ReviewItem {
  id: string;
  description: string;
  severity: string;
  status: string;
  is_violation: boolean;
  notes: string | null;
  policy_title: string | null;
  rationale: string | null;
  remediation_hint: string | null;
}

interface ReviewCondition {
  id: string;
  description: string;
  due_date: string;
  completed: boolean;
  completed_at: string | null;
}

interface ReviewWorkbenchProps {
  reviewId: string;
  onNavigate: (view: GovernanceView) => void;
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  open: <MinusCircle size={14} className="text-neutral-400" />,
  passed: <CheckCircle size={14} className="text-emerald-500" />,
  failed: <XCircle size={14} className="text-red-500" />,
  waived: <AlertTriangle size={14} className="text-amber-500" />,
};

type ItemFilter = "all" | "mandatory_fails" | "advisory" | "passed" | "waived";
type DecisionType = "approved" | "approved_with_conditions" | "rejected" | "deferred";

export default function ReviewWorkbench({ reviewId, onNavigate }: ReviewWorkbenchProps) {
  const [review, setReview] = useState<ReviewData | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [conditions, setConditions] = useState<ReviewCondition[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"details" | "checklist" | "conditions">("details");
  const [filter, setFilter] = useState<ItemFilter>("all");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [decisionType, setDecisionType] = useState<DecisionType | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [waiveId, setWaiveId] = useState<string | null>(null);
  const [waiveNotes, setWaiveNotes] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showReviewerPicker, setShowReviewerPicker] = useState(false);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [selectedReviewerId, setSelectedReviewerId] = useState<string | null>(null);
  const [assigningReviewer, setAssigningReviewer] = useState(false);
  const [reviewerName, setReviewerName] = useState<string | null>(null);
  const [delegateMode, setDelegateMode] = useState(false);

  const load = useCallback(async () => {
    const [revRes, itemsRes, condRes] = await Promise.all([
      supabase.from("reviews").select("*").eq("id", reviewId).single(),
      supabase.from("review_items").select("*").eq("review_id", reviewId).order("created_at"),
      supabase.from("review_conditions").select("*").eq("review_id", reviewId).order("created_at"),
    ]);
    setReview(revRes.data);
    setItems(itemsRes.data ?? []);
    setConditions(condRes.data ?? []);
    setLoading(false);
  }, [reviewId]);

  useEffect(() => { load(); }, [load]);

  // Auto-poll while waiting for AI checklist generation
  useEffect(() => {
    if (!review) return;
    const needsPolling = review.status === "submitted" || (review.status === "self_assessment" && items.length === 0);
    if (!needsPolling) return;
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [review?.status, items.length, load, review]);

  // Fetch current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setCurrentUserId(data.user.id);
    });
  }, []);

  // Resolve reviewer display name when review loads
  useEffect(() => {
    if (!review?.assigned_reviewer_id) { setReviewerName(null); return; }
    supabase.from("profiles").select("display_name, email").eq("id", review.assigned_reviewer_id).single()
      .then(({ data }) => setReviewerName(data?.display_name || data?.email || "Assigned reviewer"));
  }, [review?.assigned_reviewer_id]);

  async function updateItemStatus(itemId: string, status: string, notes?: string) {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const body: Record<string, unknown> = { id: itemId, status };
    if (notes !== undefined) body.notes = notes;

    const res = await fetch("/api/truly-govern/reviews/items", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("[updateItemStatus] Failed:", err);
      // Reload from DB to show actual state
      await load();
      return;
    }
    setItems((prev) => prev.map((i) => i.id === itemId ? { ...i, status, notes: notes ?? i.notes } : i));
  }

  async function handleDecision(data: { notes?: string; conditions?: { description: string; due_date: string }[]; reason?: string }) {
    if (!decisionType) return;
    setSaving(true);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

    // Update review status
    const newStatus = decisionType === "approved_with_conditions" ? "approved" : decisionType;
    await fetch("/api/truly-govern/reviews", {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        id: reviewId,
        status: newStatus,
        custom_fields: {
          ...review?.custom_fields,
          decision_notes: data.notes ?? data.reason ?? null,
          decision_type: decisionType,
        },
      }),
    });

    // Create conditions if approving with conditions — owner defaults to design owner (submitted_by)
    if (data.conditions && review) {
      for (const c of data.conditions) {
        await fetch("/api/truly-govern/reviews/conditions", {
          method: "POST",
          headers,
          body: JSON.stringify({ review_id: reviewId, description: c.description, due_date: c.due_date, owner_id: review.submitted_by }),
        });
      }
    }

    setSaving(false);
    setDecisionType(null);
    await load();
  }

  async function handleSubmitForReview() {
    setSubmitting(true);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

    // Update status to submitted
    await fetch("/api/truly-govern/reviews", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ id: reviewId, status: "submitted" }),
    });

    // Trigger AI checklist generation
    await fetch("/api/truly-govern/reviews/generate", {
      method: "POST",
      headers,
      body: JSON.stringify({ review_id: reviewId }),
    });

    setSubmitting(false);
    await load();
  }

  async function openReviewerPicker() {
    // Load org members for the picker
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
    if (!profile) return;
    const { data: members } = await supabase.from("profiles").select("id, full_name").eq("org_id", profile.org_id);
    // Map to OrgMember shape and exclude the submitter (design owner) from reviewer candidates
    const mapped = (members ?? []).map((m: { id: string; full_name: string | null }) => ({
      id: m.id,
      display_name: m.full_name,
      email: null,
    }));
    setOrgMembers(mapped.filter((m) => m.id !== review?.submitted_by));
    setSelectedReviewerId(null);
    setShowReviewerPicker(true);
  }

  async function handleAssignReviewer() {
    if (!selectedReviewerId) return;
    setAssigningReviewer(true);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

    if (delegateMode) {
      // Delegate self-assessment to another org member (no status change)
      await fetch("/api/truly-govern/reviews", {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          id: reviewId,
          custom_fields: { ...review?.custom_fields, assigned_assessor_id: selectedReviewerId },
        }),
      });
    } else {
      // Assign reviewer and transition to in_review
      await fetch("/api/truly-govern/reviews", {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          id: reviewId,
          assigned_reviewer_id: selectedReviewerId,
          assigned_at: new Date().toISOString(),
          status: review?.status === "in_review" ? "in_review" : "in_review",
        }),
      });
    }

    setAssigningReviewer(false);
    setShowReviewerPicker(false);
    setDelegateMode(false);
    await load();
  }

  function handleWaive(itemId: string) {
    setWaiveId(itemId);
    setWaiveNotes("");
  }

  function confirmWaive() {
    if (!waiveId || !waiveNotes.trim()) return;
    updateItemStatus(waiveId, "waived", waiveNotes);
    setWaiveId(null);
    setWaiveNotes("");
  }

  if (loading) return <div className="flex items-center gap-2 text-sm text-neutral-500"><Loader2 size={16} className="animate-spin" /> Loading...</div>;
  if (!review) return <div className="text-sm text-neutral-500">Review not found.</div>;

  // Role-based access
  const isOwner = currentUserId === review.submitted_by;
  const isAssessor = currentUserId === (review.custom_fields.assigned_assessor_id as string | null);
  const isReviewer = currentUserId === review.assigned_reviewer_id;
  const canEditItems =
    (review.status === "self_assessment" && (isOwner || isAssessor)) ||
    (review.status === "in_review" && (isOwner || isAssessor || isReviewer));

  const mandatoryFails = items.filter((i) => i.severity === "blocking" && (i.status === "open" || i.status === "failed")).length;
  const advisoryWarns = items.filter((i) => i.severity !== "blocking" && i.status === "open").length;
  const allMandatoryResolved = items.filter((i) => i.severity === "blocking").every((i) => i.status === "passed" || i.status === "waived");
  const statusLabel = REVIEW_STATUS_LABELS[review.status as keyof typeof REVIEW_STATUS_LABELS] ?? review.status;

  // Group items by category (stored in notes as "Category: X")
  const categorizedItems = items.reduce<Record<string, ReviewItem[]>>((acc, item) => {
    const cat = item.notes?.match(/^Category:\s*(.+)/)?.[1] ?? "General";
    (acc[cat] ??= []).push(item);
    return acc;
  }, {});

  const filteredItems = items.filter((i) => {
    if (filter === "mandatory_fails") return i.severity === "blocking" && (i.status === "open" || i.status === "failed");
    if (filter === "advisory") return i.severity !== "blocking";
    if (filter === "passed") return i.status === "passed";
    if (filter === "waived") return i.status === "waived";
    return true;
  });

  const filteredCategories = Object.entries(categorizedItems).filter(([, catItems]) =>
    catItems.some((i) => filteredItems.includes(i)),
  );

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Back + header */}
      <div className="shrink-0 border-b border-neutral-200 bg-white px-6 py-4">
        <button onClick={() => onNavigate({ page: "reviews" })} className="mb-3 flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700">
          <ArrowLeft size={14} /> Back to reviews
        </button>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold">{review.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className={`rounded-full px-2 py-0.5 ${review.status === "approved" ? "bg-emerald-50 text-emerald-700" : review.status === "rejected" ? "bg-red-50 text-red-700" : review.status === "self_assessment" ? "bg-purple-50 text-purple-700" : "bg-blue-50 text-blue-700"}`}>
                {statusLabel}
              </span>
              {review.risk_level && (
                <span className={`rounded-full px-2 py-0.5 ${RISK_COLORS[review.risk_level as keyof typeof RISK_COLORS] ?? "bg-neutral-100"}`}>
                  {review.risk_level}
                </span>
              )}
              <span className="text-neutral-400">{items.length} items</span>
              {mandatoryFails > 0 && <span className="text-red-600">{mandatoryFails} mandatory fails</span>}
              {advisoryWarns > 0 && <span className="text-amber-600">{advisoryWarns} advisory</span>}
            </div>
          </div>

          {/* Pending — Edit + Submit buttons (owner only) */}
          {review.status === "pending" && isOwner && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => onNavigate({ page: "reviews-edit", id: reviewId })}
                className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
              >
                <Pencil size={14} /> Edit
              </button>
              <button
                onClick={handleSubmitForReview}
                disabled={submitting}
                className="flex items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {submitting ? "Submitting..." : "Submit for Review"}
              </button>
            </div>
          )}

          {/* Submitted — generating indicator */}
          {review.status === "submitted" && (
            <div className="flex items-center gap-2 text-sm text-amber-600">
              <Loader2 size={14} className="animate-spin" /> Generating checklist...
            </div>
          )}

          {/* Self-Assessment — owner/assessor reviews checklist, then assigns reviewer */}
          {review.status === "self_assessment" && (isOwner || isAssessor) && (
            <div className="flex items-center gap-2">
              {isOwner && (
                <button
                  onClick={() => { setDelegateMode(true); openReviewerPicker(); }}
                  className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
                >
                  <Pencil size={14} /> Delegate Assessment
                </button>
              )}
              <button
                onClick={() => { setDelegateMode(false); openReviewerPicker(); }}
                className="flex items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-800"
              >
                <UserCheck size={14} /> Assign Reviewer & Submit
              </button>
            </div>
          )}

          {/* In Review — decision buttons for assigned reviewer only */}
          {review.status === "in_review" && (
            <div className="flex items-center gap-2">
              {reviewerName && (
                <span className="flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-700">
                  <UserCheck size={12} /> {reviewerName}
                </span>
              )}
              {isOwner && (
                <button
                  onClick={() => { setDelegateMode(false); openReviewerPicker(); }}
                  className="text-xs text-neutral-400 hover:text-neutral-600 underline"
                >
                  Reassign
                </button>
              )}
              {isReviewer ? (
                <>
                  <button onClick={() => setDecisionType("approved")} disabled={!allMandatoryResolved} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-40" title={allMandatoryResolved ? "" : "Resolve all mandatory items first"}>
                    Approve
                  </button>
                  <button onClick={() => setDecisionType("approved_with_conditions")} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">
                    With Conditions
                  </button>
                  <button onClick={() => setDecisionType("rejected")} className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">
                    Reject
                  </button>
                  <button onClick={() => setDecisionType("deferred")} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-50">
                    Defer
                  </button>
                </>
              ) : (
                <span className="text-xs text-neutral-400 italic">Awaiting reviewer decision</span>
              )}
            </div>
          )}
        </div>

        {/* Read-only banner for non-participants */}
        {!canEditItems && (review.status === "self_assessment" || review.status === "in_review") && (
          <div className="mt-3 flex items-center gap-2 rounded-md bg-neutral-100 px-3 py-2 text-xs text-neutral-500">
            You have read-only access to this review.
          </div>
        )}

        {/* Self-assessment guidance banner */}
        {review.status === "self_assessment" && canEditItems && items.length > 0 && (
          <div className="mt-3 flex items-center gap-2 rounded-md bg-purple-50 px-3 py-2 text-xs text-purple-700">
            <AlertTriangle size={14} /> Review each checklist item (pass, fail, or waive), then assign a reviewer to submit.
          </div>
        )}

        {/* Ready to approve banner */}
        {review.status === "in_review" && allMandatoryResolved && items.length > 0 && (
          <div className="mt-3 flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            <CheckCircle size={14} /> All mandatory items resolved — ready to approve
          </div>
        )}

        {/* Tabs */}
        <div className="mt-4 flex gap-1 border-b border-neutral-200 -mb-px">
          {(["details", "checklist", "conditions"] as const).map((t) => {
            const waiverCount = items.filter((i) => i.status === "waived" || (i.status === "passed" && i.notes && !i.notes.startsWith("Category:"))).length;
            const followUpCount = conditions.length + waiverCount;
            const label = t === "details" ? "Details" : t === "checklist" ? `Checklist (${items.length})` : `Follow-ups (${followUpCount})`;
            return (
              <button key={t} onClick={() => setTab(t)} className={`border-b-2 px-4 py-2 text-sm ${tab === t ? "border-neutral-900 font-medium text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-700"}`}>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6">
        {tab === "checklist" && (
          <div>
            {/* Filter bar */}
            <div className="mb-4 flex gap-2">
              {(["all", "mandatory_fails", "advisory", "passed", "waived"] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1 text-xs ${filter === f ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`}>
                  {f === "all" ? "All" : f === "mandatory_fails" ? "Mandatory Fails" : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>

            {items.length === 0 ? (
              <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
                {review.status === "submitted" || review.status === "self_assessment" ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 size={24} className="animate-spin text-neutral-400" />
                    <div className="font-medium text-neutral-700">AI is generating your compliance checklist...</div>
                    <div className="text-xs text-neutral-400">This usually takes 15-30 seconds. The page will update automatically.</div>
                  </div>
                ) : (
                  "No checklist items yet."
                )}
              </div>
            ) : (
              <div className="space-y-6">
                {filteredCategories.map(([category, catItems]) => {
                  const visibleItems = catItems.filter((i) => filteredItems.includes(i));
                  if (visibleItems.length === 0) return null;
                  return (
                    <div key={category}>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">{category}</h3>
                      <div className="space-y-1.5">
                        {visibleItems.map((item) => (
                          <div key={item.id} className={`rounded-lg border bg-white ${item.is_violation ? "border-red-200" : "border-neutral-200"}`}>
                            <div className="flex items-center gap-3 px-4 py-3">
                              {STATUS_ICONS[item.status]}
                              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${SEVERITY_COLORS[item.severity as keyof typeof SEVERITY_COLORS] ?? ""}`}>
                                {item.severity}
                              </span>
                              <span className="flex-1 text-sm">{item.description}</span>
                              {/* Action buttons — only for participants */}
                              {canEditItems && (
                                <div className="flex items-center gap-1 shrink-0">
                                  {item.status !== "open" && (
                                    <button onClick={() => updateItemStatus(item.id, "open")} className="rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100">Reset</button>
                                  )}
                                  <button onClick={() => updateItemStatus(item.id, "passed")} disabled={item.status === "passed"} className={`rounded px-2 py-1 text-xs ${item.status === "passed" ? "bg-emerald-50 text-emerald-700 font-medium" : "text-emerald-600 hover:bg-emerald-50"}`}>Pass</button>
                                  <button onClick={() => updateItemStatus(item.id, "failed")} disabled={item.status === "failed"} className={`rounded px-2 py-1 text-xs ${item.status === "failed" ? "bg-red-50 text-red-700 font-medium" : "text-red-600 hover:bg-red-50"}`}>Fail</button>
                                  <button onClick={() => handleWaive(item.id)} disabled={item.status === "waived"} className={`rounded px-2 py-1 text-xs ${item.status === "waived" ? "bg-amber-50 text-amber-700 font-medium" : "text-amber-600 hover:bg-amber-50"}`}>Waive</button>
                                </div>
                              )}
                              {/* Expand toggle */}
                              {(item.rationale || item.policy_title) && (
                                <button onClick={() => setExpandedIds((prev) => { const next = new Set(prev); next.has(item.id) ? next.delete(item.id) : next.add(item.id); return next; })} className="text-neutral-400 hover:text-neutral-600">
                                  <ChevronDown size={14} className={`transition-transform ${expandedIds.has(item.id) ? "rotate-180" : ""}`} />
                                </button>
                              )}
                            </div>
                            {/* Expanded details */}
                            {expandedIds.has(item.id) && (
                              <div className="border-t border-neutral-100 px-4 py-3 text-xs text-neutral-500 space-y-1">
                                {item.policy_title && <div><span className="font-medium text-neutral-600">Policy:</span> {item.policy_title}</div>}
                                {item.rationale && <div><span className="font-medium text-neutral-600">Rationale:</span> {item.rationale}</div>}
                                {item.remediation_hint && <div><span className="font-medium text-neutral-600">Remediation:</span> {item.remediation_hint}</div>}
                                {item.notes && !item.notes.startsWith("Category:") && <div><span className="font-medium text-neutral-600">Notes:</span> {item.notes}</div>}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === "details" && (
          <div className="max-w-3xl space-y-4">
            <div className="rounded-lg border border-neutral-200 bg-white p-4 space-y-3">
              <div><div className="text-xs font-medium uppercase text-neutral-400">Description</div><div className="text-sm mt-1">{review.description || "—"}</div></div>
              <div className="grid grid-cols-3 gap-3">
                <div><div className="text-xs font-medium uppercase text-neutral-400">Risk Level</div><div className="text-sm capitalize mt-1">{review.risk_level || "—"}</div></div>
                <div><div className="text-xs font-medium uppercase text-neutral-400">Completeness</div><div className="text-sm mt-1">{review.completeness_score != null ? `${review.completeness_score}%` : "—"}</div></div>
                <div><div className="text-xs font-medium uppercase text-neutral-400">Submitted</div><div className="text-sm mt-1">{new Date(review.created_at).toLocaleDateString()}</div></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><div className="text-xs font-medium uppercase text-neutral-400">Tech Stack</div><div className="flex flex-wrap gap-1 mt-1">{review.tech_stack.map((t) => <span key={t} className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs">{t}</span>)}</div></div>
                <div><div className="text-xs font-medium uppercase text-neutral-400">Integrations</div><div className="flex flex-wrap gap-1 mt-1">{review.integrations.length > 0 ? review.integrations.map((t) => <span key={t} className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs">{t}</span>) : <span className="text-xs text-neutral-400">—</span>}</div></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><div className="text-xs font-medium uppercase text-neutral-400">Regulatory Scope</div><div className="text-sm mt-1">{review.regulatory_scope.join(", ") || "—"}</div></div>
                <div><div className="text-xs font-medium uppercase text-neutral-400">Hosting</div><div className="text-sm mt-1 capitalize">{(review.custom_fields.hosting as string) || "—"}{review.custom_fields.cloud_provider ? ` (${review.custom_fields.cloud_provider})` : ""}</div></div>
              </div>
            </div>
          </div>
        )}

        {tab === "conditions" && (() => {
          const activeWaivers = items.filter((i) => i.status === "waived");
          const resolvedWaivers = items.filter((i) => i.status === "passed" && i.notes && !i.notes.startsWith("Category:"));
          const allWaivers = [...activeWaivers, ...resolvedWaivers];
          const hasFollowUps = conditions.length > 0 || allWaivers.length > 0;

          return (
            <div className="max-w-3xl space-y-6">
              {!hasFollowUps && (
                <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">No follow-ups yet.</div>
              )}

              {/* Conditions section */}
              {conditions.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">Conditions ({conditions.length})</h3>
                  <div className="space-y-2">
                    {conditions.map((c) => (
                      <div key={c.id} className={`flex items-center justify-between rounded-lg border-l-4 border border-neutral-200 bg-white px-4 py-3 ${c.completed ? "border-l-emerald-400" : "border-l-blue-400"}`}>
                        <div>
                          <div className="flex items-center gap-2">
                            <div className={`text-sm ${c.completed ? "line-through text-neutral-400" : ""}`}>{c.description}</div>
                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">Condition</span>
                            {c.completed && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">Completed</span>}
                          </div>
                          <div className="text-xs text-neutral-400 mt-0.5">Due: {new Date(c.due_date).toLocaleDateString()}</div>
                        </div>
                        {!c.completed && (
                          <button
                            onClick={async () => {
                              const token = (await supabase.auth.getSession()).data.session?.access_token;
                              await fetch("/api/truly-govern/reviews/conditions", {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                body: JSON.stringify({ id: c.id, completed: true }),
                              });
                              load();
                            }}
                            className="shrink-0 rounded-md border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-50"
                          >
                            Mark Complete
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Waivers section */}
              {allWaivers.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">Waivers ({allWaivers.length})</h3>
                  <div className="space-y-2">
                    {allWaivers.map((w) => {
                      const isResolved = w.status === "passed";
                      const justification = w.notes && !w.notes.startsWith("Category:") ? w.notes : null;
                      return (
                        <div key={w.id} className={`rounded-lg border-l-4 border border-neutral-200 bg-white px-4 py-3 ${isResolved ? "border-l-emerald-400" : "border-l-amber-400"}`}>
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className={`text-sm ${isResolved ? "line-through text-neutral-400" : ""}`}>{w.description}</span>
                                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">Waiver</span>
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${SEVERITY_COLORS[w.severity as keyof typeof SEVERITY_COLORS] ?? ""}`}>{w.severity}</span>
                                {isResolved && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">Resolved</span>}
                              </div>
                              {w.policy_title && <div className="text-xs text-neutral-400 mt-0.5">Policy: {w.policy_title}</div>}
                              {justification && <div className="text-xs text-neutral-500 mt-1">Reason: {justification}</div>}
                            </div>
                            {!isResolved && (isOwner || isAssessor || isReviewer) && (
                              <button
                                onClick={() => updateItemStatus(w.id, "passed")}
                                className="shrink-0 rounded-md border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-50"
                              >
                                Mark Resolved
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Decision modal */}
      {decisionType && (
        <ReviewDecisionModal type={decisionType} onConfirm={handleDecision} onClose={() => setDecisionType(null)} saving={saving} />
      )}

      {/* Reviewer picker modal */}
      {showReviewerPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
              <h3 className="text-lg font-semibold">{delegateMode ? "Delegate Assessment" : "Assign Reviewer"}</h3>
              <button onClick={() => setShowReviewerPicker(false)} className="text-neutral-400 hover:text-neutral-600"><X size={18} /></button>
            </div>
            <div className="px-6 py-4">
              <p className="mb-3 text-sm text-neutral-500">
                {delegateMode
                  ? "Select a team member to complete the self-assessment on your behalf."
                  : "Select a reviewer to assess your self-assessment and make the final decision."}
              </p>
              <div className="max-h-60 space-y-1 overflow-y-auto">
                {orgMembers.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setSelectedReviewerId(m.id)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                      selectedReviewerId === m.id ? "bg-neutral-900 text-white" : "hover:bg-neutral-50"
                    }`}
                  >
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                      selectedReviewerId === m.id ? "bg-white text-neutral-900" : "bg-neutral-100 text-neutral-600"
                    }`}>
                      {(m.display_name || m.email || "?").charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium">{m.display_name || "No name"}</div>
                      {m.email && <div className={`text-xs ${selectedReviewerId === m.id ? "text-neutral-300" : "text-neutral-400"}`}>{m.email}</div>}
                    </div>
                  </button>
                ))}
                {orgMembers.length === 0 && (
                  <p className="py-4 text-center text-sm text-neutral-400">No other org members found.</p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-neutral-200 px-6 py-4">
              <button onClick={() => setShowReviewerPicker(false)} className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">Cancel</button>
              <button
                onClick={handleAssignReviewer}
                disabled={!selectedReviewerId || assigningReviewer}
                className="flex items-center gap-1.5 rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {assigningReviewer && <Loader2 size={14} className="animate-spin" />}
                {assigningReviewer ? "Assigning..." : delegateMode ? "Delegate" : "Assign & Submit for Review"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Waive justification modal */}
      {waiveId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold mb-3">Waive Justification</h3>
            <textarea value={waiveNotes} onChange={(e) => setWaiveNotes(e.target.value)} rows={3} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm mb-3" placeholder="Explain why this item is being waived..." />
            <div className="flex justify-end gap-2">
              <button onClick={() => setWaiveId(null)} className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">Cancel</button>
              <button onClick={confirmWaive} disabled={!waiveNotes.trim()} className="rounded-md bg-amber-600 px-4 py-2 text-sm text-white hover:bg-amber-700 disabled:opacity-40">Confirm Waive</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
