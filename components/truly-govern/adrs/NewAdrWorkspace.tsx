"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import type { GovernanceView } from "@/lib/truly-govern/governance-views";

interface DomainOption { id: string; name: string }
interface TechDomainOption { id: string; name: string }
interface ReviewOption { id: string; title: string }

interface NewAdrWorkspaceProps {
  onNavigate: (view: GovernanceView) => void;
  prefillContext?: string;
  prefillSupersedes?: string;
}

const inputClass = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none";

export default function NewAdrWorkspace({ onNavigate, prefillContext, prefillSupersedes }: NewAdrWorkspaceProps) {
  const [saving, setSaving] = useState(false);
  const [domains, setDomains] = useState<DomainOption[]>([]);
  const [techDomains, setTechDomains] = useState<TechDomainOption[]>([]);
  const [reviews, setReviews] = useState<ReviewOption[]>([]);

  const [title, setTitle] = useState("");
  const [context, setContext] = useState(prefillContext ?? "");
  const [decision, setDecision] = useState("");
  const [rationale, setRationale] = useState("");
  const [alternatives, setAlternatives] = useState("");
  const [consequences, setConsequences] = useState("");
  const [domainId, setDomainId] = useState("");
  const [techDomainId, setTechDomainId] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [reviewId, setReviewId] = useState("");
  const [status, setStatus] = useState<"proposed" | "accepted">("proposed");
  const [suggestingRationale, setSuggestingRationale] = useState(false);
  const [hasSuggested, setHasSuggested] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
      if (!profile) return;
      const orgId = profile.org_id;

      const [domRes, techDomRes, revRes] = await Promise.all([
        supabase.from("capability_domains").select("id, name").eq("org_id", orgId).eq("archived", false).order("name"),
        supabase.from("technology_domains").select("id, name").eq("org_id", orgId).eq("archived", false).order("sort_order"),
        supabase.from("reviews").select("id, title").eq("org_id", orgId).order("created_at", { ascending: false }).limit(20),
      ]);
      setDomains(domRes.data ?? []);
      setTechDomains(techDomRes.data ?? []);
      setReviews(revRes.data ?? []);
    }
    load();
  }, []);

  function addTag() {
    const tag = tagInput.trim();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setTagInput("");
    }
  }

  async function suggestRationale() {
    setSuggestingRationale(true);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const res = await fetch("/api/truly-govern/adrs/suggest-rationale", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ context, decision, alternatives: alternatives || undefined }),
    });
    const json = await res.json();
    if (json.rationale) {
      setRationale(json.rationale);
      setHasSuggested(true);
    }
    setSuggestingRationale(false);
  }

  async function handleSave() {
    if (!title || !decision || !rationale) return;
    setSaving(true);
    const token = (await supabase.auth.getSession()).data.session?.access_token;

    const customFields: Record<string, unknown> = {};
    if (reviewId) customFields.review_id = reviewId;
    if (techDomainId) customFields.tech_domain_id = techDomainId;
    if (prefillContext) customFields.supersede_context = true;

    const res = await fetch("/api/truly-govern/adrs", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title,
        decision,
        rationale,
        alternatives: alternatives || null,
        consequences: consequences || null,
        domain_id: domainId || null,
        tags,
        status,
        custom_fields: customFields,
        superseded_by: null,
      }),
    });

    const json = await res.json();
    setSaving(false);

    if (json.data?.id) {
      // If superseding an old ADR, mark it as superseded
      if (prefillSupersedes) {
        await fetch("/api/truly-govern/adrs", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ id: prefillSupersedes, status: "superseded", superseded_by: json.data.id }),
        });
      }
      onNavigate({ page: "adrs-detail", id: json.data.id });
    }
  }

  const canSave = title && decision && rationale;
  const canSuggest = context.length > 20 && decision.length > 10;

  return (
    <div className="max-w-3xl">
      <button onClick={() => onNavigate({ page: "adrs" })} className="mb-4 flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700">
        <ArrowLeft size={14} /> Back to ADR library
      </button>

      <h1 className="text-2xl font-semibold mb-6">Record a Decision</h1>

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Title *</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="Short, present-tense title (e.g. Use Kafka for event streaming)" />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Context *</label>
          <textarea value={context} onChange={(e) => setContext(e.target.value)} rows={6} className={inputClass} placeholder="What is the situation that requires a decision?" />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Decision *</label>
          <textarea value={decision} onChange={(e) => setDecision(e.target.value)} rows={4} className={inputClass} placeholder="The decision that was made. Start with a verb." />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-sm font-medium">Rationale *</label>
            {canSuggest && (
              <button onClick={suggestRationale} disabled={suggestingRationale} className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-50">
                {suggestingRationale ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                {suggestingRationale ? "Generating..." : hasSuggested ? "Regenerate suggestion" : "Suggest rationale"}
              </button>
            )}
          </div>
          <textarea value={rationale} onChange={(e) => setRationale(e.target.value)} rows={6} className={inputClass} placeholder="Why was this decision made? What were the constraints?" />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Alternatives Considered</label>
          <textarea value={alternatives} onChange={(e) => setAlternatives(e.target.value)} rows={4} className={inputClass} placeholder="What else was considered and why rejected? (optional)" />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Consequences</label>
          <textarea value={consequences} onChange={(e) => setConsequences(e.target.value)} rows={4} className={inputClass} placeholder="What becomes easier or harder as a result? (optional)" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Business Domain</label>
            <select value={domainId} onChange={(e) => setDomainId(e.target.value)} className={inputClass}>
              <option value="">None</option>
              {domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Technology Domain</label>
            <select value={techDomainId} onChange={(e) => setTechDomainId(e.target.value)} className={inputClass}>
              <option value="">None</option>
              {techDomains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Related Review</label>
          <select value={reviewId} onChange={(e) => setReviewId(e.target.value)} className={inputClass}>
            <option value="">None</option>
            {reviews.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Tags</label>
          <div className="mb-2 flex flex-wrap gap-1">
            {tags.map((t) => (
              <span key={t} className="flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs">
                {t} <button onClick={() => setTags(tags.filter((x) => x !== t))} className="text-neutral-400 hover:text-neutral-600">&times;</button>
              </span>
            ))}
          </div>
          <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())} onBlur={addTag} className={inputClass} placeholder="Type and press Enter" />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">Status</label>
          <div className="flex gap-3">
            {(["proposed", "accepted"] as const).map((s) => (
              <button key={s} onClick={() => setStatus(s)} className={`rounded-md border px-4 py-2 text-sm capitalize ${status === s ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 hover:bg-neutral-50"}`}>
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={handleSave} disabled={saving || !canSave} className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-50">
            {saving ? "Saving..." : "Save ADR"}
          </button>
        </div>
      </div>
    </div>
  );
}
