"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ArrowLeft, AlertTriangle, CheckCircle } from "lucide-react";
import type { GovernanceView } from "@/lib/truly-govern/governance-views";

interface DomainOption { id: string; name: string }

interface NewReviewWorkspaceProps {
  onNavigate: (view: GovernanceView) => void;
  editReviewId?: string;
}

const inputClass = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none";

const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
const HOSTING_OPTIONS = ["cloud", "on-premise", "hybrid"] as const;
const CLOUD_PROVIDERS = ["AWS", "Azure", "GCP", "Other"] as const;
const DATA_CLASSIFICATIONS = ["PII", "Financial", "Public", "Internal", "Confidential"] as const;
const REGULATORY_OPTIONS = ["GDPR", "PCI-DSS", "SOX", "HIPAA", "None"] as const;
const AVAILABILITY_TARGETS = ["99%", "99.9%", "99.95%", "99.99%"] as const;

const TOTAL_SECTIONS = 9; // title, desc, domain, risk, tech_stack, hosting, data_class, regulatory, nfrs

export default function NewReviewWorkspace({ onNavigate, editReviewId }: NewReviewWorkspaceProps) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [domains, setDomains] = useState<DomainOption[]>([]);
  const [loadingEdit, setLoadingEdit] = useState(!!editReviewId);

  // Step 1
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [domainId, setDomainId] = useState("");
  const [riskLevel, setRiskLevel] = useState<string>("");
  const [targetGoLive, setTargetGoLive] = useState("");

  // Step 2
  const [techStack, setTechStack] = useState<string[]>([]);
  const [techInput, setTechInput] = useState("");
  const [integrations, setIntegrations] = useState<string[]>([]);
  const [intInput, setIntInput] = useState("");
  const [hosting, setHosting] = useState("");
  const [cloudProvider, setCloudProvider] = useState("");
  const [dataClassification, setDataClassification] = useState<string[]>([]);
  const [regulatoryScope, setRegulatoryScope] = useState<string[]>([]);

  // Step 3
  const [expectedRps, setExpectedRps] = useState("");
  const [availabilityTarget, setAvailabilityTarget] = useState("");
  const [rtoHours, setRtoHours] = useState("");
  const [rpoHours, setRpoHours] = useState("");
  const [dataRetentionYears, setDataRetentionYears] = useState("");
  const [additionalNfrs, setAdditionalNfrs] = useState("");

  useEffect(() => {
    async function loadDomains() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
      if (!profile) return;
      const { data } = await supabase.from("capability_domains").select("id, name").eq("org_id", profile.org_id).eq("archived", false).order("name");
      setDomains(data ?? []);
    }
    loadDomains();
  }, []);

  // Load existing review data when editing
  useEffect(() => {
    if (!editReviewId) return;
    async function loadReview() {
      const { data } = await supabase.from("reviews").select("*").eq("id", editReviewId).single();
      if (!data) { setLoadingEdit(false); return; }
      setTitle(data.title ?? "");
      setDescription(data.description ?? "");
      setDomainId(data.domain_id ?? "");
      setRiskLevel(data.risk_level ?? "");
      setTechStack(data.tech_stack ?? []);
      setIntegrations(data.integrations ?? []);
      setRegulatoryScope(data.regulatory_scope ?? []);
      const cf = (data.custom_fields ?? {}) as Record<string, unknown>;
      setHosting((cf.hosting as string) ?? "");
      setCloudProvider((cf.cloud_provider as string) ?? "");
      setDataClassification((cf.data_classification as string[]) ?? []);
      setTargetGoLive((cf.target_go_live as string) ?? "");
      setExpectedRps(cf.expected_rps != null ? String(cf.expected_rps) : "");
      setAvailabilityTarget((cf.availability_target as string) ?? "");
      setRtoHours(cf.rto_hours != null ? String(cf.rto_hours) : "");
      setRpoHours(cf.rpo_hours != null ? String(cf.rpo_hours) : "");
      setDataRetentionYears(cf.data_retention_years != null ? String(cf.data_retention_years) : "");
      setAdditionalNfrs((cf.additional_nfrs as string) ?? "");
      setLoadingEdit(false);
    }
    loadReview();
  }, [editReviewId]);

  function addTag(list: string[], setList: (v: string[]) => void, input: string, setInput: (v: string) => void) {
    const tag = input.trim();
    if (tag && !list.includes(tag)) {
      setList([...list, tag]);
      setInput("");
    }
  }

  function toggleMulti(list: string[], setList: (v: string[]) => void, value: string) {
    if (list.includes(value)) {
      setList(list.filter((v) => v !== value));
    } else {
      setList([...list, value]);
    }
  }

  function computeCompleteness(): { score: number; warnings: string[] } {
    let filled = 0;
    const warnings: string[] = [];
    if (title) filled++;
    else warnings.push("Title is required");
    if (description) filled++;
    else warnings.push("Description is empty");
    if (domainId) filled++;
    else warnings.push("Domain not selected");
    if (riskLevel) filled++;
    else warnings.push("Risk level not set");
    if (techStack.length > 0) filled++;
    else warnings.push("No tech stack specified");
    if (hosting) filled++;
    else warnings.push("Hosting not specified");
    if (dataClassification.length > 0) filled++;
    else warnings.push("Data classification not set");
    if (regulatoryScope.length > 0) filled++;
    else warnings.push("Regulatory scope not set");
    if (expectedRps || availabilityTarget || rtoHours || additionalNfrs) filled++;
    else warnings.push("No NFRs specified");
    return { score: filled, warnings };
  }

  async function handleSubmit(status: "pending" | "submitted") {
    // Flush any pending tag input before submitting
    if (techInput.trim()) { setTechStack((prev) => prev.includes(techInput.trim()) ? prev : [...prev, techInput.trim()]); setTechInput(""); }
    if (intInput.trim()) { setIntegrations((prev) => prev.includes(intInput.trim()) ? prev : [...prev, intInput.trim()]); setIntInput(""); }
    setSaving(true);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const { score, warnings } = computeCompleteness();
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

    const customFields: Record<string, unknown> = {
      hosting,
      cloud_provider: hosting === "cloud" ? cloudProvider : null,
      data_classification: dataClassification,
      target_go_live: targetGoLive || null,
      expected_rps: expectedRps ? Number(expectedRps) : null,
      availability_target: availabilityTarget || null,
      rto_hours: rtoHours ? Number(rtoHours) : null,
      rpo_hours: rpoHours ? Number(rpoHours) : null,
      data_retention_years: dataRetentionYears ? Number(dataRetentionYears) : null,
      additional_nfrs: additionalNfrs || null,
    };

    const payload = {
      title,
      description,
      domain_id: domainId || null,
      risk_level: riskLevel || null,
      tech_stack: techStack,
      integrations,
      regulatory_scope: regulatoryScope,
      custom_fields: customFields,
      status: "pending",
      completeness_score: Math.round((score / TOTAL_SECTIONS) * 100),
      completeness_warnings: warnings,
    };

    let reviewId = editReviewId;

    if (editReviewId) {
      // Update existing review
      await fetch("/api/truly-govern/reviews", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ id: editReviewId, ...payload }),
      });
    } else {
      // Create new review
      const res = await fetch("/api/truly-govern/reviews", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      reviewId = json.data?.id;
    }

    setSaving(false);

    if (reviewId) {
      // If submitted, trigger checklist generation
      if (status === "submitted") {
        await fetch("/api/truly-govern/reviews/generate", {
          method: "POST",
          headers,
          body: JSON.stringify({ review_id: reviewId }),
        });
      }
      onNavigate({ page: "reviews-detail", id: reviewId });
    }
  }

  const canProceedStep1 = title && description && domainId && riskLevel;
  const { score: completenessScore, warnings: completenessWarnings } = computeCompleteness();
  const completenessPercent = Math.round((completenessScore / TOTAL_SECTIONS) * 100);

  if (loadingEdit) {
    return <div className="flex items-center gap-2 text-sm text-neutral-500"><span className="animate-spin">&#9696;</span> Loading review...</div>;
  }

  return (
    <div className="max-w-3xl">
      <button onClick={() => editReviewId ? onNavigate({ page: "reviews-detail", id: editReviewId }) : onNavigate({ page: "reviews" })} className="mb-4 flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700">
        <ArrowLeft size={14} /> {editReviewId ? "Back to review" : "Back to reviews"}
      </button>

      <h1 className="text-2xl font-semibold">{editReviewId ? "Edit Design Review" : "Submit a Design Review"}</h1>

      {/* Step indicators */}
      <div className="mt-4 mb-6 flex gap-3 text-sm">
        {["Overview", "Technical", "NFRs", "Review"].map((label, i) => (
          <button key={label} onClick={() => setStep(i + 1)} className={`rounded-full px-3 py-1 ${step === i + 1 ? "bg-neutral-900 text-white" : step > i + 1 ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-600"}`}>
            {i + 1}. {label}
          </button>
        ))}
      </div>

      {/* Step 1 — Overview */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Title *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="e.g. Payment service v2 — event-driven redesign" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Description *</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={6} className={inputClass} placeholder="Describe what you are building and why" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Domain *</label>
              <select value={domainId} onChange={(e) => setDomainId(e.target.value)} className={inputClass}>
                <option value="">Select a domain</option>
                {domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Target Go-Live</label>
              <input type="date" value={targetGoLive} onChange={(e) => setTargetGoLive(e.target.value)} className={inputClass} />
            </div>
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
          <button onClick={() => setStep(2)} disabled={!canProceedStep1} className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-40">
            Next: Technical Context
          </button>
        </div>
      )}

      {/* Step 2 — Technical context */}
      {step === 2 && (
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Tech Stack *</label>
            <div className="mb-2 flex flex-wrap gap-1">
              {techStack.map((t) => (
                <span key={t} className="flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs">
                  {t} <button onClick={() => setTechStack(techStack.filter((x) => x !== t))} className="text-neutral-400 hover:text-neutral-600">&times;</button>
                </span>
              ))}
            </div>
            <input value={techInput} onChange={(e) => setTechInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag(techStack, setTechStack, techInput, setTechInput))} onBlur={() => addTag(techStack, setTechStack, techInput, setTechInput)} className={inputClass} placeholder="e.g. Node.js, PostgreSQL, RabbitMQ — press Enter" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Integrations</label>
            <div className="mb-2 flex flex-wrap gap-1">
              {integrations.map((t) => (
                <span key={t} className="flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs">
                  {t} <button onClick={() => setIntegrations(integrations.filter((x) => x !== t))} className="text-neutral-400 hover:text-neutral-600">&times;</button>
                </span>
              ))}
            </div>
            <input value={intInput} onChange={(e) => setIntInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag(integrations, setIntegrations, intInput, setIntInput))} onBlur={() => addTag(integrations, setIntegrations, intInput, setIntInput)} className={inputClass} placeholder="e.g. Salesforce, SAP, Auth0 — press Enter" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">Hosting</label>
            <div className="flex gap-3">
              {HOSTING_OPTIONS.map((h) => (
                <button key={h} onClick={() => setHosting(h)} className={`rounded-md border px-4 py-2 text-sm capitalize ${hosting === h ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 hover:bg-neutral-50"}`}>
                  {h}
                </button>
              ))}
            </div>
          </div>
          {hosting === "cloud" && (
            <div>
              <label className="mb-2 block text-sm font-medium">Cloud Provider</label>
              <div className="flex gap-3">
                {CLOUD_PROVIDERS.map((cp) => (
                  <button key={cp} onClick={() => setCloudProvider(cp)} className={`rounded-md border px-4 py-2 text-sm ${cloudProvider === cp ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 hover:bg-neutral-50"}`}>
                    {cp}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="mb-2 block text-sm font-medium">Data Classification</label>
            <div className="flex flex-wrap gap-2">
              {DATA_CLASSIFICATIONS.map((dc) => (
                <button key={dc} onClick={() => toggleMulti(dataClassification, setDataClassification, dc)} className={`rounded-md border px-3 py-1.5 text-sm ${dataClassification.includes(dc) ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 hover:bg-neutral-50"}`}>
                  {dc}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">Regulatory Scope</label>
            <div className="flex flex-wrap gap-2">
              {REGULATORY_OPTIONS.map((r) => (
                <button key={r} onClick={() => toggleMulti(regulatoryScope, setRegulatoryScope, r)} className={`rounded-md border px-3 py-1.5 text-sm ${regulatoryScope.includes(r) ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 hover:bg-neutral-50"}`}>
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStep(1)} className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">Back</button>
            <button onClick={() => setStep(3)} className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800">Next: NFRs</button>
          </div>
        </div>
      )}

      {/* Step 3 — Non-functional requirements */}
      {step === 3 && (
        <div className="space-y-4">
          <p className="text-sm text-neutral-500">All fields are optional. Blank fields show as &quot;not specified&quot; in the AI checklist.</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Expected RPS (peak)</label>
              <input type="number" value={expectedRps} onChange={(e) => setExpectedRps(e.target.value)} className={inputClass} placeholder="e.g. 500" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Availability Target</label>
              <select value={availabilityTarget} onChange={(e) => setAvailabilityTarget(e.target.value)} className={inputClass}>
                <option value="">Select</option>
                {AVAILABILITY_TARGETS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">RTO (hours)</label>
              <input type="number" value={rtoHours} onChange={(e) => setRtoHours(e.target.value)} className={inputClass} placeholder="e.g. 4" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">RPO (hours)</label>
              <input type="number" value={rpoHours} onChange={(e) => setRpoHours(e.target.value)} className={inputClass} placeholder="e.g. 1" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Data Retention (years)</label>
              <input type="number" value={dataRetentionYears} onChange={(e) => setDataRetentionYears(e.target.value)} className={inputClass} placeholder="e.g. 7" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Additional NFRs</label>
            <textarea value={additionalNfrs} onChange={(e) => setAdditionalNfrs(e.target.value)} rows={3} className={inputClass} placeholder="Any other non-functional requirements..." />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStep(2)} className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">Back</button>
            <button onClick={() => setStep(4)} className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800">Next: Review</button>
          </div>
        </div>
      )}

      {/* Step 4 — Review & submit */}
      {step === 4 && (
        <div className="space-y-4">
          {/* Completeness score */}
          <div className={`flex items-center gap-3 rounded-lg border p-4 ${completenessPercent >= 70 ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
            {completenessPercent >= 70 ? <CheckCircle size={20} className="text-emerald-600" /> : <AlertTriangle size={20} className="text-amber-600" />}
            <div>
              <div className={`text-sm font-semibold ${completenessPercent >= 70 ? "text-emerald-700" : "text-amber-700"}`}>
                {completenessScore}/{TOTAL_SECTIONS} sections complete ({completenessPercent}%)
              </div>
              {completenessPercent < 70 && (
                <div className="mt-1 text-xs text-amber-600">Low completeness may result in a generic checklist</div>
              )}
            </div>
          </div>

          {/* Summary */}
          <div className="rounded-lg border border-neutral-200 bg-white p-4 space-y-3">
            <div>
              <div className="text-xs font-medium uppercase text-neutral-400">Title</div>
              <div className="text-sm font-semibold">{title || "—"}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase text-neutral-400">Description</div>
              <div className="text-sm text-neutral-600">{description || "—"}</div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-xs font-medium uppercase text-neutral-400">Domain</div>
                <div className="text-sm">{domains.find((d) => d.id === domainId)?.name || "—"}</div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase text-neutral-400">Risk Level</div>
                <div className="text-sm capitalize">{riskLevel || "—"}</div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase text-neutral-400">Go-Live</div>
                <div className="text-sm">{targetGoLive || "—"}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs font-medium uppercase text-neutral-400">Tech Stack</div>
                <div className="flex flex-wrap gap-1 mt-1">{techStack.length > 0 ? techStack.map((t) => <span key={t} className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs">{t}</span>) : <span className="text-xs text-neutral-400">—</span>}</div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase text-neutral-400">Integrations</div>
                <div className="flex flex-wrap gap-1 mt-1">{integrations.length > 0 ? integrations.map((t) => <span key={t} className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs">{t}</span>) : <span className="text-xs text-neutral-400">—</span>}</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-xs font-medium uppercase text-neutral-400">Hosting</div>
                <div className="text-sm capitalize">{hosting || "—"}{hosting === "cloud" && cloudProvider ? ` (${cloudProvider})` : ""}</div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase text-neutral-400">Data Classification</div>
                <div className="text-sm">{dataClassification.join(", ") || "—"}</div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase text-neutral-400">Regulatory</div>
                <div className="text-sm">{regulatoryScope.join(", ") || "—"}</div>
              </div>
            </div>
            {(expectedRps || availabilityTarget || rtoHours || rpoHours) && (
              <div className="grid grid-cols-4 gap-3">
                <div><div className="text-xs font-medium uppercase text-neutral-400">RPS</div><div className="text-sm">{expectedRps || "—"}</div></div>
                <div><div className="text-xs font-medium uppercase text-neutral-400">Availability</div><div className="text-sm">{availabilityTarget || "—"}</div></div>
                <div><div className="text-xs font-medium uppercase text-neutral-400">RTO</div><div className="text-sm">{rtoHours ? `${rtoHours}h` : "—"}</div></div>
                <div><div className="text-xs font-medium uppercase text-neutral-400">RPO</div><div className="text-sm">{rpoHours ? `${rpoHours}h` : "—"}</div></div>
              </div>
            )}
          </div>

          {/* Warnings */}
          {completenessWarnings.length > 0 && (
            <div className="text-xs text-neutral-500">
              <div className="font-medium mb-1">Missing:</div>
              <ul className="list-disc pl-4 space-y-0.5">
                {completenessWarnings.map((w) => <li key={w}>{w}</li>)}
              </ul>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={() => setStep(3)} className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">Back</button>
            <button onClick={() => handleSubmit("pending")} disabled={saving} className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50">
              {saving ? "Saving..." : "Save Draft"}
            </button>
            <button onClick={() => handleSubmit("submitted")} disabled={saving || !canProceedStep1} className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-50">
              {saving ? "Generating checklist..." : "Submit for Review"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
