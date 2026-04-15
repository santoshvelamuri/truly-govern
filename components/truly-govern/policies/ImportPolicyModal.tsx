"use client";

import { useState, useEffect, useRef } from "react";
import { X, AlertTriangle, Loader2, Upload, FileText, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { SEVERITY_COLORS } from "@/lib/truly-govern/constants";
import type { Severity } from "@/lib/truly-govern/types";
import ImportPreviewTable, { type PreviewPolicy } from "./ImportPreviewTable";

interface TechDomainOption { id: string; name: string }

interface Props {
  onClose: () => void;
  onImported: (policyId: string) => void;
}

type Step = "input" | "extracting" | "single-preview" | "multi-preview";

interface StructuredPreview {
  policy_id: string;
  title: string;
  rule_statement: string;
  rule_rationale: string;
  rule_severity: string;
  domain: string;
  tech_domain_id: string | null;
  subdomain: string;
  tags: string[];
  clauses: Array<{ heading: string; content: string; severity: string }>;
  full_content: string;
  source_url: string;
  source_document: string;
}

export default function ImportPolicyModal({ onClose, onImported }: Props) {
  const [step, setStep] = useState<Step>("input");
  const [tab, setTab] = useState<"url" | "paste" | "file">("url");
  const [url, setUrl] = useState("");
  const [confluenceToken, setConfluenceToken] = useState("");
  const [pastedContent, setPastedContent] = useState("");
  const [title, setTitle] = useState("");
  const [techDomainId, setTechDomainId] = useState("");
  const [techDomains, setTechDomains] = useState<TechDomainOption[]>([]);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);

  // File upload
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Preview state
  const [structuredPreview, setStructuredPreview] = useState<StructuredPreview | null>(null);
  const [multiPolicies, setMultiPolicies] = useState<PreviewPolicy[]>([]);
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    async function loadDomains() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
      if (!profile) return;
      const { data } = await supabase.from("technology_domains").select("id, name").eq("org_id", profile.org_id).eq("archived", false).order("sort_order");
      setTechDomains(data ?? []);
    }
    loadDomains();
  }, []);

  async function getToken() {
    return (await supabase.auth.getSession()).data.session?.access_token;
  }

  // Helpers for structured preview editing
  function updateField<K extends keyof StructuredPreview>(field: K, value: StructuredPreview[K]) {
    setStructuredPreview((prev) => prev ? { ...prev, [field]: value } : prev);
  }

  function addClause() {
    setStructuredPreview((prev) => prev ? {
      ...prev,
      clauses: [...prev.clauses, { heading: "", content: "", severity: "warning" }],
    } : prev);
  }

  function removeClause(i: number) {
    setStructuredPreview((prev) => prev ? {
      ...prev,
      clauses: prev.clauses.filter((_, idx) => idx !== i),
    } : prev);
  }

  function updateClause(i: number, field: "heading" | "content" | "severity", value: string) {
    setStructuredPreview((prev) => {
      if (!prev) return prev;
      const clauses = [...prev.clauses];
      clauses[i] = { ...clauses[i], [field]: value };
      return { ...prev, clauses };
    });
  }

  function addTag() {
    const tag = tagInput.trim();
    if (tag && structuredPreview && !structuredPreview.tags.includes(tag)) {
      updateField("tags", [...structuredPreview.tags, tag]);
      setTagInput("");
    }
  }

  function removeTag(tag: string) {
    if (structuredPreview) {
      updateField("tags", structuredPreview.tags.filter((t) => t !== tag));
    }
  }

  // Merge multiple AI-extracted policies into a single StructuredPreview
  function mergeToSinglePolicy(
    policies: PreviewPolicy[],
    rawTitle: string,
    sourceUrl: string,
    fullContent: string,
  ): StructuredPreview {
    const first = policies[0];
    const allClauses = policies.flatMap((p) => p.clauses ?? []);
    return {
      policy_id: `IMP-${Date.now().toString(36).toUpperCase()}`,
      title: rawTitle || first.rule_statement?.slice(0, 80) || "Imported policy",
      rule_statement: first.rule_statement || "",
      rule_rationale: first.rule_rationale || "",
      rule_severity: first.rule_severity || "warning",
      domain: first.domain || "",
      tech_domain_id: first.tech_domain_id ?? null,
      subdomain: first.subdomain || "",
      tags: [...new Set(policies.flatMap((p) => p.tags ?? []))],
      clauses: allClauses,
      full_content: fullContent,
      source_url: sourceUrl,
      source_document: sourceUrl || "pasted",
    };
  }

  // Step 1 → Extract & Preview (URL/paste) — two-phase: fetch content then AI extraction
  async function handlePreviewUrlPaste() {
    setError("");
    setStep("extracting");
    const token = await getToken();

    // Phase 1: Fetch/parse content via import endpoint
    const payload = tab === "url"
      ? { url, title: title || undefined, confluence_token: confluenceToken || undefined, tech_domain_id: techDomainId || undefined, preview: true }
      : { content: pastedContent, title: title || "Imported document", tech_domain_id: techDomainId || undefined, preview: true };

    let rawTitle = "";
    let fullContent = "";
    let sourceUrl = "";

    try {
      const res = await fetch("/api/truly-govern/import", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Preview failed");
        setStep("input");
        return;
      }
      rawTitle = json.data.title || "";
      fullContent = json.data.full_content || "";
      sourceUrl = json.data.source_url || "";
    } catch {
      setError("Failed to fetch content");
      setStep("input");
      return;
    }

    // Phase 2: Send through AI extraction
    const blob = new Blob([fullContent], { type: "text/plain" });
    const formData = new FormData();
    formData.append("file", blob, `${rawTitle || "imported"}.txt`);
    formData.append("preview", "true");

    try {
      const res = await fetch("/api/standard-policies/extract", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const json = await res.json();

      if (res.ok && json.policies?.length) {
        // Merge AI results into a single structured preview
        const merged = mergeToSinglePolicy(json.policies, rawTitle, sourceUrl, fullContent);
        setStructuredPreview(merged);
      } else {
        // Fallback: no AI results — show raw content with no clauses
        setStructuredPreview({
          policy_id: `IMP-${Date.now().toString(36).toUpperCase()}`,
          title: rawTitle || "Imported document",
          rule_statement: fullContent.slice(0, 10000),
          rule_rationale: "",
          rule_severity: "warning",
          domain: "",
          tech_domain_id: techDomainId || null,
          subdomain: "",
          tags: [],
          clauses: [],
          full_content: fullContent,
          source_url: sourceUrl,
          source_document: sourceUrl || "pasted",
        });
        setError("AI could not extract structured clauses. You can add them manually.");
      }
      setStep("single-preview");
    } catch {
      // Fallback on AI failure
      setStructuredPreview({
        policy_id: `IMP-${Date.now().toString(36).toUpperCase()}`,
        title: rawTitle || "Imported document",
        rule_statement: fullContent.slice(0, 10000),
        rule_rationale: "",
        rule_severity: "warning",
        domain: "",
        tech_domain_id: techDomainId || null,
        subdomain: "",
        tags: [],
        clauses: [],
        full_content: fullContent,
        source_url: sourceUrl,
        source_document: sourceUrl || "pasted",
      });
      setError("AI extraction failed. You can edit the policy manually.");
      setStep("single-preview");
    }
  }

  // Step 1 → Extract & Preview (file upload)
  async function handlePreviewFile() {
    if (!selectedFile) return;
    setError("");
    setStep("extracting");
    const token = await getToken();

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("preview", "true");

    try {
      const res = await fetch("/api/standard-policies/extract", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Extraction failed");
        setStep("input");
        return;
      }

      if (!json.policies?.length) {
        setError("No standards could be extracted from the document");
        setStep("input");
        return;
      }

      const withTitles = json.policies.map((p: PreviewPolicy) => ({
        ...p,
        title: p.title || p.policy_id,
      }));
      setMultiPolicies(withTitles);
      setStep("multi-preview");
    } catch {
      setError("Extraction failed");
      setStep("input");
    }
  }

  // Single policy: "Import Policy" — save via extract/confirm with clauses
  async function handleImportSingle() {
    if (!structuredPreview) return;
    setImporting(true);
    setError("");
    const token = await getToken();

    const policyPayload = {
      policy_id: structuredPreview.policy_id,
      domain: structuredPreview.domain,
      tech_domain_id: structuredPreview.tech_domain_id,
      subdomain: structuredPreview.subdomain,
      tags: structuredPreview.tags,
      rule_statement: structuredPreview.rule_statement,
      rule_rationale: structuredPreview.rule_rationale,
      rule_severity: structuredPreview.rule_severity,
      remediation_hint: structuredPreview.rule_statement,
      source_document: structuredPreview.source_document,
      clauses: structuredPreview.clauses,
    };

    try {
      const res = await fetch("/api/standard-policies/extract/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ policies: [policyPayload] }),
      });
      const json = await res.json();
      setImporting(false);
      if (!res.ok) {
        setError(json.error || "Import failed");
        return;
      }
      onImported("");
    } catch {
      setImporting(false);
      setError("Import failed");
    }
  }

  // Single policy: "Extract individual standards" → send to AI extraction → multi preview
  async function handleExtractStandards() {
    if (!structuredPreview) return;
    setStep("extracting");
    setError("");
    const token = await getToken();

    const blob = new Blob([structuredPreview.full_content], { type: "text/plain" });
    const formData = new FormData();
    formData.append("file", blob, `${structuredPreview.title || "imported"}.txt`);
    formData.append("preview", "true");

    try {
      const res = await fetch("/api/standard-policies/extract", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Extraction failed");
        setStep("single-preview");
        return;
      }

      if (!json.policies?.length) {
        setError("No individual standards could be extracted");
        setStep("single-preview");
        return;
      }

      const withTitles = json.policies.map((p: PreviewPolicy) => ({
        ...p,
        title: p.title || p.policy_id,
      }));
      setMultiPolicies(withTitles);
      setStep("multi-preview");
    } catch {
      setError("Extraction failed");
      setStep("single-preview");
    }
  }

  // Multi-policy confirm
  async function handleConfirmMulti(selectedPolicies: PreviewPolicy[]) {
    setImporting(true);
    setError("");
    const token = await getToken();

    try {
      const res = await fetch("/api/standard-policies/extract/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ policies: selectedPolicies }),
      });
      const json = await res.json();
      setImporting(false);
      if (!res.ok) {
        setError(json.error || "Import failed");
        return;
      }
      onImported("");
    } catch {
      setImporting(false);
      setError("Import failed");
    }
  }

  const canSubmit = tab === "url" ? !!url : tab === "paste" ? !!pastedContent : !!selectedFile;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className={`w-full rounded-xl bg-white shadow-xl ${step === "multi-preview" || step === "single-preview" ? "max-w-3xl" : "max-w-lg"}`}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
          <h2 className="text-lg font-semibold">
            {step === "input" && "Import Policy Document"}
            {step === "extracting" && "Extracting..."}
            {step === "single-preview" && "Review Import"}
            {step === "multi-preview" && "Review Extracted Policies"}
          </h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600"><X size={18} /></button>
        </div>

        <div className="px-6 py-4">
          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

          {/* Step: Input */}
          {step === "input" && (
            <>
              <div className="mb-4 flex rounded-lg bg-amber-50 p-3 text-xs text-amber-700">
                <AlertTriangle size={14} className="mr-2 mt-0.5 shrink-0" />
                Content will be extracted and previewed before import. You can review and edit before confirming.
              </div>

              {/* Tabs */}
              <div className="mb-4 flex gap-1 rounded-lg bg-neutral-100 p-1">
                <button onClick={() => setTab("url")} className={`flex-1 rounded-md px-3 py-1.5 text-sm ${tab === "url" ? "bg-white font-medium shadow-sm" : "text-neutral-500"}`}>From URL</button>
                <button onClick={() => setTab("paste")} className={`flex-1 rounded-md px-3 py-1.5 text-sm ${tab === "paste" ? "bg-white font-medium shadow-sm" : "text-neutral-500"}`}>Paste</button>
                <button onClick={() => setTab("file")} className={`flex-1 rounded-md px-3 py-1.5 text-sm ${tab === "file" ? "bg-white font-medium shadow-sm" : "text-neutral-500"}`}>Upload File</button>
              </div>

              <div className="space-y-3">
                {tab === "url" && (
                  <>
                    <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://confluence.example.com/page/..." className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
                    <input value={confluenceToken} onChange={(e) => setConfluenceToken(e.target.value)} placeholder="Confluence token (optional, for private pages)" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
                  </>
                )}
                {tab === "paste" && (
                  <textarea value={pastedContent} onChange={(e) => setPastedContent(e.target.value)} rows={8} placeholder="Paste the policy document content here..." className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
                )}
                {tab === "file" && (
                  <div
                    className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-neutral-300 p-8 text-center hover:border-neutral-400 cursor-pointer"
                    onClick={() => fileRef.current?.click()}
                  >
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".pdf,.txt,.csv,.json,.md,.doc,.docx"
                      className="hidden"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                    />
                    {selectedFile ? (
                      <div className="flex items-center gap-2 text-sm">
                        <FileText size={16} className="text-neutral-500" />
                        <span className="font-medium">{selectedFile.name}</span>
                        <span className="text-neutral-400">({(selectedFile.size / 1024).toFixed(0)} KB)</span>
                      </div>
                    ) : (
                      <>
                        <Upload size={24} className="mb-2 text-neutral-400" />
                        <p className="text-sm text-neutral-500">Click to upload PDF, TXT, CSV, JSON, or Markdown</p>
                      </>
                    )}
                  </div>
                )}

                {tab !== "file" && (
                  <>
                    <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title override (optional)" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
                    <select value={techDomainId} onChange={(e) => setTechDomainId(e.target.value)} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm">
                      <option value="">Technology domain (optional)</option>
                      {techDomains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </>
                )}
              </div>
            </>
          )}

          {/* Step: Extracting */}
          {step === "extracting" && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 size={32} className="mb-4 animate-spin text-neutral-400" />
              <p className="text-sm font-medium text-neutral-700">AI is extracting and structuring policies...</p>
              <p className="mt-1 text-xs text-neutral-400">This may take a moment for large documents</p>
            </div>
          )}

          {/* Step: Single Preview — AI-enhanced structured form */}
          {step === "single-preview" && structuredPreview && (
            <div className="max-h-[500px] space-y-4 overflow-y-auto pr-1">
              {/* Title */}
              <div>
                <label className="mb-1 block text-sm font-medium">Title</label>
                <input
                  value={structuredPreview.title}
                  onChange={(e) => updateField("title", e.target.value)}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  placeholder="Policy title"
                />
              </div>

              {/* Statement */}
              <div>
                <label className="mb-1 block text-sm font-medium">Statement</label>
                <textarea
                  value={structuredPreview.rule_statement}
                  onChange={(e) => updateField("rule_statement", e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  placeholder="The policy requirement — what must be done or not done"
                />
              </div>

              {/* Rationale */}
              <div>
                <label className="mb-1 block text-sm font-medium">Rationale</label>
                <textarea
                  value={structuredPreview.rule_rationale}
                  onChange={(e) => updateField("rule_rationale", e.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  placeholder="Why this policy exists — the risk or compliance driver"
                />
              </div>

              {/* Domain + Severity */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium">Technology Domain</label>
                  <select
                    value={structuredPreview.tech_domain_id ?? ""}
                    onChange={(e) => {
                      const domainId = e.target.value || null;
                      const domainName = techDomains.find((d) => d.id === domainId)?.name ?? "";
                      updateField("tech_domain_id", domainId);
                      updateField("domain", domainName);
                    }}
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  >
                    <option value="">Select domain</option>
                    {techDomains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Severity</label>
                  <select
                    value={structuredPreview.rule_severity}
                    onChange={(e) => updateField("rule_severity", e.target.value)}
                    className={`w-full rounded-md border border-neutral-300 px-3 py-2 text-sm ${SEVERITY_COLORS[structuredPreview.rule_severity as Severity] || ""}`}
                  >
                    <option value="blocking">Blocking</option>
                    <option value="warning">Warning</option>
                    <option value="advisory">Advisory</option>
                  </select>
                </div>
              </div>

              {/* Subdomain */}
              <div>
                <label className="mb-1 block text-sm font-medium">Subdomain</label>
                <input
                  value={structuredPreview.subdomain}
                  onChange={(e) => updateField("subdomain", e.target.value)}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  placeholder="e.g. access-control, encryption"
                />
              </div>

              {/* Tags */}
              <div>
                <label className="mb-1 block text-sm font-medium">Tags</label>
                <div className="flex flex-wrap gap-1 mb-2">
                  {structuredPreview.tags.map((t) => (
                    <span key={t} className="flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs">
                      {t}
                      <button onClick={() => removeTag(t)} className="text-neutral-400 hover:text-neutral-600">&times;</button>
                    </span>
                  ))}
                </div>
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  placeholder="Type and press Enter"
                />
              </div>

              {/* Clauses */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-medium">
                    Clauses ({structuredPreview.clauses.length})
                  </label>
                  <button onClick={addClause} className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-700">
                    <Plus size={12} /> Add clause
                  </button>
                </div>
                <div className="space-y-2">
                  {structuredPreview.clauses.map((c, i) => (
                    <div key={i} className="rounded-lg border border-neutral-200 bg-white p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-medium text-neutral-500">Clause {i + 1}</span>
                        <div className="flex items-center gap-2">
                          <select
                            value={c.severity}
                            onChange={(e) => updateClause(i, "severity", e.target.value)}
                            className={`rounded-full border-0 px-2 py-0.5 text-xs ${SEVERITY_COLORS[c.severity as Severity] || "bg-neutral-100"}`}
                          >
                            <option value="blocking">Blocking</option>
                            <option value="warning">Warning</option>
                            <option value="advisory">Advisory</option>
                          </select>
                          <button onClick={() => removeClause(i)} className="text-neutral-400 hover:text-red-500">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                      <input
                        value={c.heading}
                        onChange={(e) => updateClause(i, "heading", e.target.value)}
                        placeholder="Clause heading"
                        className="mb-1.5 w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
                      />
                      <textarea
                        value={c.content}
                        onChange={(e) => updateClause(i, "content", e.target.value)}
                        rows={3}
                        placeholder="Clause body — the specific requirement"
                        className="w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
                      />
                    </div>
                  ))}
                  {structuredPreview.clauses.length === 0 && (
                    <p className="text-xs text-neutral-400 italic">No clauses yet. Click &quot;Add clause&quot; to add specific requirements.</p>
                  )}
                </div>
              </div>

              {/* Source info */}
              {structuredPreview.source_url && (
                <p className="text-xs text-neutral-400">Source: {structuredPreview.source_url}</p>
              )}
            </div>
          )}

          {/* Step: Multi Preview */}
          {step === "multi-preview" && (
            <ImportPreviewTable
              policies={multiPolicies}
              onConfirm={handleConfirmMulti}
              onCancel={() => {
                setStep("input");
                setMultiPolicies([]);
              }}
              loading={importing}
            />
          )}
        </div>

        {/* Footer — only for input and single-preview steps */}
        {step === "input" && (
          <div className="flex justify-end gap-2 border-t border-neutral-200 px-6 py-4">
            <button onClick={onClose} className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">Cancel</button>
            <button
              onClick={tab === "file" ? handlePreviewFile : handlePreviewUrlPaste}
              disabled={!canSubmit}
              className="flex items-center gap-2 rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              Extract & Preview
            </button>
          </div>
        )}

        {step === "single-preview" && (
          <div className="flex justify-between border-t border-neutral-200 px-6 py-4">
            <button
              onClick={() => { setStep("input"); setStructuredPreview(null); setError(""); }}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
            >
              Back
            </button>
            <div className="flex gap-2">
              <button
                onClick={handleExtractStandards}
                className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
              >
                Extract Individual Standards
              </button>
              <button
                onClick={handleImportSingle}
                disabled={importing}
                className="flex items-center gap-2 rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {importing && <Loader2 size={14} className="animate-spin" />}
                {importing ? "Importing..." : "Import Policy"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
