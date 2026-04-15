"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ArrowLeft, Loader2, Download, ArrowRightLeft, CheckCircle, AlertTriangle, Pencil, Save, X } from "lucide-react";
import { ADR_STATUS_LABELS } from "@/lib/truly-govern/constants";
import type { GovernanceView } from "@/lib/truly-govern/governance-views";

interface AdrData {
  id: string;
  title: string;
  status: string;
  ingestion_status: string;
  decision: string;
  rationale: string;
  alternatives: string | null;
  constraints: string | null;
  consequences: string | null;
  domain_id: string | null;
  tags: string[];
  superseded_by: string | null;
  custom_fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface DomainOption { id: string; name: string }

interface AdrDetailWorkspaceProps {
  adrId: string;
  onNavigate: (view: GovernanceView) => void;
}

const STATUS_COLORS: Record<string, string> = {
  proposed: "bg-blue-50 text-blue-700",
  accepted: "bg-emerald-50 text-emerald-700",
  deprecated: "bg-neutral-100 text-neutral-500",
  superseded: "bg-amber-50 text-amber-700",
};

const inputClass = "w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:border-neutral-500 focus:outline-none";

export default function AdrDetailWorkspace({ adrId, onNavigate }: AdrDetailWorkspaceProps) {
  const [adr, setAdr] = useState<AdrData | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [supersededByTitle, setSupersededByTitle] = useState<string | null>(null);
  const [domainName, setDomainName] = useState<string | null>(null);
  const [techDomainName, setTechDomainName] = useState<string | null>(null);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<AdrData | null>(null);
  const [draftTechDomainId, setDraftTechDomainId] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [domains, setDomains] = useState<DomainOption[]>([]);
  const [techDomains, setTechDomains] = useState<DomainOption[]>([]);

  const load = useCallback(async () => {
    const { data } = await supabase.from("adrs").select("*").eq("id", adrId).single();
    setAdr(data);
    setLoading(false);

    if (data?.superseded_by) {
      const { data: successor } = await supabase.from("adrs").select("title").eq("id", data.superseded_by).single();
      setSupersededByTitle(successor?.title ?? null);
    }
    if (data?.domain_id) {
      const { data: dom } = await supabase.from("capability_domains").select("name").eq("id", data.domain_id).single();
      setDomainName(dom?.name ?? null);
    }
    const techDomId = data?.custom_fields?.tech_domain_id;
    if (techDomId) {
      const { data: td } = await supabase.from("technology_domains").select("name").eq("id", techDomId).single();
      setTechDomainName(td?.name ?? null);
    } else {
      setTechDomainName(null);
    }
  }, [adrId]);

  useEffect(() => { load(); }, [load]);

  // Load domains for edit dropdowns
  useEffect(() => {
    async function loadDomains() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
      if (!profile) return;
      const [domRes, techRes] = await Promise.all([
        supabase.from("capability_domains").select("id, name").eq("org_id", profile.org_id).eq("archived", false).order("name"),
        supabase.from("technology_domains").select("id, name").eq("org_id", profile.org_id).eq("archived", false).order("sort_order"),
      ]);
      setDomains(domRes.data ?? []);
      setTechDomains(techRes.data ?? []);
    }
    loadDomains();
  }, []);

  // Poll for ingestion status while processing
  useEffect(() => {
    if (!adr || adr.ingestion_status !== "processing") return;
    const interval = setInterval(async () => {
      const { data } = await supabase.from("adrs").select("ingestion_status").eq("id", adrId).single();
      if (data && data.ingestion_status !== "processing") {
        setAdr((prev) => prev ? { ...prev, ingestion_status: data.ingestion_status } : prev);
        clearInterval(interval);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [adr?.ingestion_status, adrId]);

  // ── Edit mode functions ────────────────────────────────────────────────

  function enterEditMode() {
    if (!adr) return;
    setDraft({ ...adr });
    setDraftTechDomainId((adr.custom_fields?.tech_domain_id as string) ?? "");
    setTagInput("");
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
    setDraft(null);
    setTagInput("");
  }

  function updateDraft(updates: Partial<AdrData>) {
    setDraft((prev) => prev ? { ...prev, ...updates } : prev);
  }

  function addTag() {
    if (!draft) return;
    const tag = tagInput.trim();
    if (tag && !draft.tags.includes(tag)) {
      updateDraft({ tags: [...draft.tags, tag] });
      setTagInput("");
    }
  }

  function removeTag(tag: string) {
    if (!draft) return;
    updateDraft({ tags: draft.tags.filter((t) => t !== tag) });
  }

  async function saveEdit() {
    if (!draft) return;
    setSaving(true);
    const token = (await supabase.auth.getSession()).data.session?.access_token;

    const customFields = { ...draft.custom_fields };
    if (draftTechDomainId) {
      customFields.tech_domain_id = draftTechDomainId;
    } else {
      delete customFields.tech_domain_id;
    }

    await fetch("/api/truly-govern/adrs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        id: adrId,
        title: draft.title,
        decision: draft.decision,
        rationale: draft.rationale,
        alternatives: draft.alternatives || null,
        constraints: draft.constraints || null,
        consequences: draft.consequences || null,
        domain_id: draft.domain_id || null,
        tags: draft.tags,
        custom_fields: customFields,
      }),
    });

    await load();
    setIsEditing(false);
    setDraft(null);
    setSaving(false);
  }

  // ── Status + ingestion functions ───────────────────────────────────────

  async function updateStatus(newStatus: string) {
    setUpdating(true);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    await fetch("/api/truly-govern/adrs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: adrId, status: newStatus }),
    });
    await load();
    setUpdating(false);
  }

  async function retriggerIngestion() {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    await fetch("/api/truly-govern/adrs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: adrId, status: "accepted" }),
    });
    setAdr((prev) => prev ? { ...prev, ingestion_status: "processing" } : prev);
  }

  function exportMarkdown() {
    if (!adr) return;
    const lines = [
      `# ${adr.title}`,
      "",
      `**Date:** ${new Date(adr.created_at).toLocaleDateString()}`,
      `**Status:** ${ADR_STATUS_LABELS[adr.status as keyof typeof ADR_STATUS_LABELS] ?? adr.status}`,
      domainName ? `**Business Domain:** ${domainName}` : null,
      techDomainName ? `**Technology Domain:** ${techDomainName}` : null,
      adr.tags.length > 0 ? `**Tags:** ${adr.tags.join(", ")}` : null,
      "",
      "## Decision",
      "",
      adr.decision,
      "",
      "## Rationale",
      "",
      adr.rationale,
    ].filter((l): l is string => l !== null);

    if (adr.alternatives) lines.push("", "## Alternatives Considered", "", adr.alternatives);
    if (adr.consequences) lines.push("", "## Consequences", "", adr.consequences);
    if (adr.constraints) lines.push("", "## Constraints", "", adr.constraints);

    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${adr.title.replace(/[^a-zA-Z0-9-_ ]/g, "").replace(/\s+/g, "-").toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Render ─────────────────────────────────────────────────────────────

  if (loading) return <div className="flex items-center gap-2 text-sm text-neutral-500"><Loader2 size={16} className="animate-spin" /> Loading...</div>;
  if (!adr) return <div className="text-sm text-neutral-500">ADR not found.</div>;

  const statusLabel = ADR_STATUS_LABELS[adr.status as keyof typeof ADR_STATUS_LABELS] ?? adr.status;
  const canEdit = adr.status === "proposed" || adr.status === "accepted";

  return (
    <div className="max-w-3xl">
      <button onClick={() => onNavigate({ page: "adrs" })} className="mb-4 flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700">
        <ArrowLeft size={14} /> Back to ADR library
      </button>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            {isEditing ? (
              <input value={draft?.title ?? ""} onChange={(e) => updateDraft({ title: e.target.value })} className={`${inputClass} text-xl font-semibold`} placeholder="ADR title" />
            ) : (
              <h1 className="text-2xl font-semibold">{adr.title}</h1>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className={`rounded-full px-2 py-0.5 ${STATUS_COLORS[adr.status] ?? "bg-neutral-100"}`}>{statusLabel}</span>
              {!isEditing && domainName && <span className="rounded-full bg-neutral-100 px-2 py-0.5">{domainName}</span>}
              {!isEditing && techDomainName && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">{techDomainName}</span>}
              {!isEditing && adr.tags.map((t) => <span key={t} className="rounded-full bg-neutral-50 px-2 py-0.5 text-neutral-500">{t}</span>)}
              <span className="text-neutral-400">{new Date(adr.created_at).toLocaleDateString()}</span>
            </div>
          </div>

          <div className="ml-4 flex items-center gap-2">
            {isEditing ? (
              <>
                <button onClick={saveEdit} disabled={saving} className="flex items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-800 disabled:opacity-50">
                  <Save size={14} /> {saving ? "Saving..." : "Save"}
                </button>
                <button onClick={cancelEdit} disabled={saving} className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50">
                  <X size={14} /> Cancel
                </button>
              </>
            ) : (
              <>
                {adr.status === "proposed" && (
                  <button onClick={() => updateStatus("accepted")} disabled={updating} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-50">Accept</button>
                )}
                {adr.status === "accepted" && (
                  <>
                    <button onClick={() => updateStatus("deprecated")} disabled={updating} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50 disabled:opacity-50">Deprecate</button>
                    <button onClick={() => onNavigate({ page: "adrs-new-supersede", supersedeId: adr.id })} className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50">
                      <ArrowRightLeft size={14} /> Supersede
                    </button>
                  </>
                )}
                {canEdit && (
                  <button onClick={enterEditMode} className="rounded-md border border-neutral-300 p-1.5 text-neutral-400 hover:bg-neutral-50 hover:text-neutral-600">
                    <Pencil size={14} />
                  </button>
                )}
                <button onClick={exportMarkdown} className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50">
                  <Download size={14} /> Export MD
                </button>
              </>
            )}
          </div>
        </div>

        {/* Ingestion status */}
        {!isEditing && (
          <div className="mt-3 flex items-center gap-2 text-xs">
            {adr.ingestion_status === "processing" ? (
              <span className="flex items-center gap-1 text-amber-600"><Loader2 size={12} className="animate-spin" /> Embedding...</span>
            ) : adr.ingestion_status === "complete" ? (
              <span className="flex items-center gap-1 text-emerald-600"><CheckCircle size={12} /> Embedded — searchable by Advisor</span>
            ) : adr.ingestion_status === "failed" ? (
              <span className="flex items-center gap-1 text-red-600">
                <AlertTriangle size={12} /> Embedding failed —{" "}
                <button onClick={() => retriggerIngestion()} className="underline">retry</button>
              </span>
            ) : adr.status === "accepted" ? (
              <button onClick={() => retriggerIngestion()} className="text-blue-600 underline">Trigger embedding</button>
            ) : null}
          </div>
        )}

        {/* Supersession chain */}
        {!isEditing && adr.superseded_by && supersededByTitle ? (
          <div className="mt-3 flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
            <ArrowRightLeft size={14} />
            <span>Superseded by:</span>
            <button onClick={() => onNavigate({ page: "adrs-detail", id: adr.superseded_by! })} className="font-medium underline">
              {supersededByTitle}
            </button>
          </div>
        ) : null}

        {/* Related review */}
        {!isEditing && adr.custom_fields.review_id ? (
          <div className="mt-2 text-xs text-neutral-500">
            <span>Related review: </span>
            <button onClick={() => onNavigate({ page: "reviews-detail", id: adr.custom_fields.review_id as string })} className="text-blue-600 underline">
              View review
            </button>
          </div>
        ) : null}
      </div>

      {/* Edit mode: metadata fields */}
      {isEditing && draft && (
        <div className="mb-6 grid grid-cols-2 gap-3 rounded-lg border border-neutral-200 bg-white p-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">Business Domain</label>
            <select value={draft.domain_id ?? ""} onChange={(e) => updateDraft({ domain_id: e.target.value || null })} className={inputClass}>
              <option value="">None</option>
              {domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">Technology Domain</label>
            <select value={draftTechDomainId} onChange={(e) => setDraftTechDomainId(e.target.value)} className={inputClass}>
              <option value="">None</option>
              {techDomains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-medium text-neutral-500">Tags</label>
            <div className="mb-2 flex flex-wrap gap-1">
              {draft.tags.map((t) => (
                <span key={t} className="flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs">
                  {t} <button onClick={() => removeTag(t)} className="text-neutral-400 hover:text-neutral-600">&times;</button>
                </span>
              ))}
            </div>
            <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())} onBlur={addTag} className={inputClass} placeholder="Type and press Enter" />
          </div>
        </div>
      )}

      {/* Nygard sections */}
      <div className="space-y-6">
        <EditableSection title="Decision" isEditing={isEditing} value={draft?.decision ?? ""} onChange={(v) => updateDraft({ decision: v })} rows={4}>
          <p className="text-sm text-neutral-700 font-medium leading-relaxed">{adr.decision}</p>
        </EditableSection>

        <EditableSection title="Rationale" isEditing={isEditing} value={draft?.rationale ?? ""} onChange={(v) => updateDraft({ rationale: v })} rows={6}>
          <p className="text-sm text-neutral-600 leading-relaxed">{adr.rationale}</p>
        </EditableSection>

        <EditableSection title="Alternatives Considered" isEditing={isEditing} value={draft?.alternatives ?? ""} onChange={(v) => updateDraft({ alternatives: v })} rows={4} showWhenEmpty={isEditing}>
          {adr.alternatives ? <p className="text-sm text-neutral-600 leading-relaxed">{adr.alternatives}</p> : null}
        </EditableSection>

        <EditableSection title="Consequences" isEditing={isEditing} value={draft?.consequences ?? ""} onChange={(v) => updateDraft({ consequences: v })} rows={4} showWhenEmpty={isEditing}>
          {adr.consequences ? <p className="text-sm text-neutral-600 leading-relaxed">{adr.consequences}</p> : null}
        </EditableSection>

        <EditableSection title="Constraints" isEditing={isEditing} value={draft?.constraints ?? ""} onChange={(v) => updateDraft({ constraints: v })} rows={4} showWhenEmpty={isEditing}>
          {adr.constraints ? <p className="text-sm text-neutral-600 leading-relaxed">{adr.constraints}</p> : null}
        </EditableSection>
      </div>
    </div>
  );
}

function EditableSection({
  title, isEditing, value, onChange, rows = 4, showWhenEmpty = false, children,
}: {
  title: string;
  isEditing: boolean;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  showWhenEmpty?: boolean;
  children: React.ReactNode;
}) {
  if (!isEditing && !children && !showWhenEmpty) return null;

  return (
    <div>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">{title}</h2>
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        {isEditing ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={rows}
            className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:border-neutral-500 focus:outline-none"
            placeholder={`Enter ${title.toLowerCase()}...`}
          />
        ) : (
          children
        )}
      </div>
    </div>
  );
}
