"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Search, Upload } from "lucide-react";

import { supabase } from "@/lib/supabaseClient";
import { getOrgId } from "@/lib/getOrgId";
import { getAccessToken } from "@/lib/utils";
import { useToast } from "@/hooks/useToast";
import { mapDbRowToStandardPolicy, mapStandardPolicyToDbPayload } from "@/lib/standardPolicyAdapter";
import { StandardsTable } from "@/components/governance/standards-table";
import { StandardsProperties } from "@/components/governance/standards-properties";
import { UploadStandardsModal } from "@/components/governance/upload-standards-modal";
import type { StandardPolicy } from "@/types/standard-policy";

interface TechDomainOption { id: string; name: string }

const STATUS_OPTIONS = ["all", "draft", "in_review", "approved", "active", "deprecated"];
const SEVERITY_OPTIONS = ["all", "blocking", "warning", "advisory"];

export function StandardsWorkspace() {
  const [policies, setPolicies] = useState<StandardPolicy[]>([]);
  const [techDomains, setTechDomains] = useState<TechDomainOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [domainFilter, setDomainFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [isPropertiesCollapsed, setIsPropertiesCollapsed] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  const { toast, showToast, setToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      let orgId: string;
      try {
        orgId = await getOrgId();
      } catch {
        setLoading(false);
        return;
      }
      const [{ data: rows, error }, { data: tdRows }] = await Promise.all([
        supabase
          .from("standard_policies")
          .select("*")
          .eq("org_id", orgId)
          .order("policy_id", { ascending: true }),
        supabase
          .from("technology_domains")
          .select("id, name")
          .eq("org_id", orgId)
          .eq("archived", false)
          .order("sort_order"),
      ]);
      if (cancelled) return;
      if (error) {
        console.error("[standards] load error", error);
        setLoading(false);
        return;
      }
      setPolicies((rows ?? []).map(mapDbRowToStandardPolicy));
      setTechDomains(tdRows ?? []);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const filtered = policies.filter((p) => {
    if (domainFilter !== "all" && p.domain !== domainFilter) return false;
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (severityFilter !== "all" && p.rule_severity !== severityFilter) return false;
    return true;
  });

  async function updatePolicy(id: string, updates: Partial<StandardPolicy>) {
    const accessToken = await getAccessToken();
    if (!accessToken) { showToast("Not authenticated.", "error"); return; }

    setPolicies((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));

    try {
      const dbPayload = mapStandardPolicyToDbPayload({ id, ...updates });
      const res = await fetch("/api/standard-policies", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(dbPayload),
      });
      const { error } = await res.json();
      if (error) { showToast(error, "error"); return; }
      showToast("Policy saved", "success");
    } catch {
      showToast("Network error. Please try again.", "error");
    }
  }

  async function deletePolicy(id: string) {
    const accessToken = await getAccessToken();
    if (!accessToken) { showToast("Not authenticated.", "error"); return; }
    try {
      const res = await fetch(`/api/standard-policies?id=${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const { error } = await res.json();
      if (error) { showToast(error, "error"); return; }
    } catch {
      showToast("Network error. Please try again.", "error");
      return;
    }
    setPolicies((prev) => prev.filter((p) => p.id !== id));
    setSelectedId((prev) => (prev === id ? null : prev));
    showToast("Policy deleted", "success");
  }

  function toggleCheck(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(ids: string[]) {
    setCheckedIds((prev) => {
      const allChecked = ids.every((id) => prev.has(id));
      if (allChecked) return new Set();
      return new Set(ids);
    });
  }

  async function bulkUpdateStatus(newStatus: string) {
    const accessToken = await getAccessToken();
    if (!accessToken) { showToast("Not authenticated.", "error"); return; }
    const ids = Array.from(checkedIds);
    const now = new Date().toISOString();
    for (const id of ids) {
      const updates: Record<string, unknown> = { id, status: newStatus };
      if (newStatus === "approved") {
        updates.approved_at = now;
        updates.approved_by = "architect";
      }
      try {
        await fetch("/api/standard-policies", {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify(updates),
        });
      } catch { /* continue */ }
    }
    setPolicies((prev) =>
      prev.map((p) =>
        checkedIds.has(p.id)
          ? { ...p, status: newStatus as StandardPolicy["status"], ...(newStatus === "approved" ? { approved_at: now, approved_by: "architect" } : {}) }
          : p,
      ),
    );
    setCheckedIds(new Set());
    showToast(`${ids.length} policies updated to ${newStatus}`, "success");
  }

  const selectedPolicy = selectedId ? policies.find((p) => p.id === selectedId) ?? null : null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-subtle">
      {/* Toolbar */}
      <div className="shrink-0 border-b border-border/50 bg-surface-elevated px-4 py-2.5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-foreground">Standards</h2>
            <span className="rounded-full border border-border/60 bg-muted/50 px-2.5 py-0.5 text-[11px] font-medium text-foreground/55">
              {filtered.length} of {policies.length}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search policies..."
                className="w-52 rounded-md border border-border/70 bg-background py-1.5 pl-7 pr-2 text-xs shadow-sm transition-colors focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30 sm:w-56"
              />
            </div>

            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <span>Domain</span>
              <select
                value={domainFilter}
                onChange={(e) => setDomainFilter(e.target.value)}
                className="rounded-md border border-border/70 bg-background px-2 py-1 text-xs text-foreground shadow-sm transition-colors focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
              >
                <option value="all">All</option>
                {techDomains.map((td) => (
                  <option key={td.id} value={td.name}>{td.name}</option>
                ))}
              </select>
            </label>

            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <span>Status</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-md border border-border/70 bg-background px-2 py-1 text-xs text-foreground shadow-sm transition-colors focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt === "all" ? "All" : opt}</option>
                ))}
              </select>
            </label>

            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <span>Severity</span>
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="rounded-md border border-border/70 bg-background px-2 py-1 text-xs text-foreground shadow-sm transition-colors focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
              >
                {SEVERITY_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt === "all" ? "All" : opt}</option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={() => setUploadModalOpen(true)}
              className="inline-flex items-center gap-1 rounded-md border border-brand-primary/35 bg-brand-primary/5 px-2.5 py-1 text-xs font-semibold text-brand-primary transition-colors hover:bg-brand-primary/10"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload Standards
            </button>
          </div>
        </div>
      </div>

      {/* Bulk action bar */}
      {checkedIds.size > 0 && (
        <div className="shrink-0 border-b border-border/50 bg-brand-primary/5 px-4 py-2">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-brand-primary">{checkedIds.size} selected</span>
            <button type="button" onClick={() => bulkUpdateStatus("in_review")} className="rounded-md bg-blue-500 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-600">Submit for Review</button>
            <button type="button" onClick={() => bulkUpdateStatus("approved")} className="rounded-md bg-cyan-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-cyan-700">Approve</button>
            <button type="button" onClick={() => bulkUpdateStatus("active")} className="rounded-md bg-green-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-green-700">Activate</button>
            <button type="button" onClick={() => setCheckedIds(new Set())} className="text-xs text-muted-foreground underline hover:text-foreground">Clear</button>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Main — Table */}
        <main className="flex-1 overflow-hidden p-2 sm:p-3">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-xs text-muted-foreground">Loading...</p>
            </div>
          ) : (
            <StandardsTable
              policies={filtered}
              selectedId={selectedId}
              searchQuery={searchQuery}
              checkedIds={checkedIds}
              onSelect={setSelectedId}
              onToggleCheck={toggleCheck}
              onToggleAll={toggleAll}
            />
          )}
        </main>

        {/* Right — Properties Panel */}
        {!isPropertiesCollapsed ? (
          <aside className="w-80 shrink-0 overflow-y-auto border-l border-border/60 bg-surface-elevated p-4 shadow-[-8px_0_16px_-12px_rgba(15,23,42,0.25)]">
            <div className="mb-2 flex justify-start">
              <button
                type="button"
                aria-label="Collapse properties panel"
                onClick={() => setIsPropertiesCollapsed(true)}
                className="rounded-md border border-border/60 bg-background p-1 text-muted-foreground transition-colors hover:border-brand-primary hover:text-brand-primary"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <StandardsProperties
              key={selectedPolicy?.id ?? "empty"}
              policy={selectedPolicy}
              onUpdate={updatePolicy}
              onDelete={deletePolicy}
              techDomainNames={techDomains.map(td => td.name)}
            />
          </aside>
        ) : (
          <aside className="w-10 shrink-0 border-l border-border/60 bg-surface-elevated p-1">
            <button
              type="button"
              aria-label="Expand properties panel"
              onClick={() => setIsPropertiesCollapsed(false)}
              className="mt-2 rounded-md border border-border/60 bg-background p-1 text-muted-foreground transition-colors hover:border-brand-primary hover:text-brand-primary"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </aside>
        )}
      </div>

      {/* Upload Modal */}
      {uploadModalOpen && (
        <UploadStandardsModal
          onClose={() => setUploadModalOpen(false)}
          onImported={(count) => {
            setUploadModalOpen(false);
            showToast(`${count} policies extracted and imported`, "success");
            // Reload policies
            (async () => {
              try {
                const orgId = await getOrgId();
                const { data: rows } = await supabase
                  .from("standard_policies")
                  .select("*")
                  .eq("org_id", orgId)
                  .order("policy_id", { ascending: true });
                setPolicies((rows ?? []).map(mapDbRowToStandardPolicy));
              } catch { /* ignore */ }
            })();
          }}
        />
      )}

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
