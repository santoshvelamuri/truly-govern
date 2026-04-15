"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Plus, Pencil, Archive, Loader2, Users } from "lucide-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";

interface Board {
  id: string;
  name: string;
  scope: string;
  scope_type: string;
  governed_domain_ids: string[];
  governed_decision_types: string[];
  parent_arb_id: string | null;
  quorum_count: number;
  meeting_cadence: string;
  active: boolean;
  arb_board_members?: { id: string; user_id: string; role: string }[];
}

interface DomainOption { id: string; name: string }

const SCOPE_OPTIONS = [
  { value: "domain_arb", label: "Domain ARB" },
  { value: "department_arb", label: "Department ARB" },
  { value: "enterprise_arb", label: "Enterprise ARB" },
];

const SCOPE_TYPE_OPTIONS = [
  { value: "domain_scoped", label: "Specific domains" },
  { value: "topic_scoped", label: "Specific decision types" },
];

const DECISION_TYPES = [
  "buy_build", "technology_adoption", "vendor_selection",
  "architecture_pattern", "security_exception", "cross_domain", "strategic_principle",
];

const CADENCE_OPTIONS = ["weekly", "biweekly", "monthly", "ad_hoc"];

const inputClass = "w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:border-neutral-500 focus:outline-none";

const SCOPE_BADGES: Record<string, string> = {
  domain_arb: "bg-blue-50 text-blue-700",
  department_arb: "bg-purple-50 text-purple-700",
  enterprise_arb: "bg-amber-50 text-amber-700",
};

export default function BoardManager({ orgId }: { orgId: string }) {
  const { isAdmin } = useCurrentUser();
  const [boards, setBoards] = useState<Board[]>([]);
  const [domains, setDomains] = useState<DomainOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formScope, setFormScope] = useState("domain_arb");
  const [formScopeType, setFormScopeType] = useState("domain_scoped");
  const [formDomainIds, setFormDomainIds] = useState<string[]>([]);
  const [formDecisionTypes, setFormDecisionTypes] = useState<string[]>([]);
  const [formParentId, setFormParentId] = useState("");
  const [formQuorum, setFormQuorum] = useState(3);
  const [formCadence, setFormCadence] = useState("monthly");

  const fetchBoards = useCallback(async () => {
    const [boardRes, domRes] = await Promise.all([
      supabase.from("arb_boards").select("*, arb_board_members(id, user_id, role)").eq("org_id", orgId).order("name"),
      supabase.from("capability_domains").select("id, name").eq("org_id", orgId).eq("archived", false).order("name"),
    ]);
    setBoards(boardRes.data ?? []);
    setDomains(domRes.data ?? []);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { fetchBoards(); }, [fetchBoards]);

  function resetForm() {
    setFormName(""); setFormScope("domain_arb"); setFormScopeType("domain_scoped");
    setFormDomainIds([]); setFormDecisionTypes([]); setFormParentId("");
    setFormQuorum(3); setFormCadence("monthly");
  }

  function startEdit(b: Board) {
    setEditingId(b.id);
    setFormName(b.name);
    setFormScope(b.scope);
    setFormScopeType(b.scope_type);
    setFormDomainIds(b.governed_domain_ids);
    setFormDecisionTypes(b.governed_decision_types);
    setFormParentId(b.parent_arb_id ?? "");
    setFormQuorum(b.quorum_count);
    setFormCadence(b.meeting_cadence);
    setShowForm(true);
  }

  async function handleSave() {
    if (!formName.trim()) return;
    setSaving(true);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

    const body: Record<string, unknown> = {
      name: formName,
      scope: formScope,
      scope_type: formScopeType,
      governed_domain_ids: formScopeType === "domain_scoped" ? formDomainIds : [],
      governed_decision_types: formScopeType === "topic_scoped" ? formDecisionTypes : [],
      parent_arb_id: formParentId || null,
      quorum_count: formQuorum,
      meeting_cadence: formCadence,
    };

    if (editingId) {
      body.id = editingId;
      await fetch("/api/truly-govern/boards", { method: "PATCH", headers, body: JSON.stringify(body) });
    } else {
      await fetch("/api/truly-govern/boards", { method: "POST", headers, body: JSON.stringify(body) });
    }

    setSaving(false);
    setShowForm(false);
    setEditingId(null);
    resetForm();
    fetchBoards();
  }

  async function handleArchive(id: string) {
    if (!confirm("Archive this board? It will no longer appear in the request form.")) return;
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    await fetch("/api/truly-govern/boards", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id }),
    });
    fetchBoards();
  }

  function toggleDomain(id: string) {
    setFormDomainIds((prev) => prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]);
  }

  function toggleDecisionType(t: string) {
    setFormDecisionTypes((prev) => prev.includes(t) ? prev.filter((d) => d !== t) : [...prev, t]);
  }

  const domainMap = new Map(domains.map((d) => [d.id, d.name]));

  if (loading) return <div className="flex items-center gap-2 text-sm text-neutral-500"><Loader2 size={16} className="animate-spin" /> Loading boards...</div>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">ARB Boards</h2>
          <p className="text-xs text-neutral-500">Configure Architecture Review Boards for decision governance.</p>
        </div>
        {isAdmin && (
        <button onClick={() => { resetForm(); setEditingId(null); setShowForm(true); }} className="flex items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-800">
          <Plus size={14} /> Create Board
        </button>
        )}
      </div>

      {/* Board list */}
      {boards.filter((b) => b.active).length === 0 && !showForm && (
        <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
          No ARB boards configured yet. Create your first board to enable decision governance.
        </div>
      )}

      <div className="space-y-2">
        {boards.filter((b) => b.active).map((b) => (
          <div key={b.id} className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{b.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${SCOPE_BADGES[b.scope] ?? "bg-neutral-100"}`}>
                  {SCOPE_OPTIONS.find((s) => s.value === b.scope)?.label}
                </span>
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px]">
                  {b.scope_type === "domain_scoped" ? "Domain-scoped" : "Topic-scoped"}
                </span>
              </div>
              <div className="mt-1 text-xs text-neutral-400">
                {b.scope_type === "domain_scoped"
                  ? `Domains: ${b.governed_domain_ids.map((id) => domainMap.get(id) ?? id).join(", ") || "None"}`
                  : `Types: ${b.governed_decision_types.join(", ") || "None"}`}
                {" · "}{b.arb_board_members?.length ?? 0} members · {b.meeting_cadence}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {isAdmin && (
              <button onClick={() => startEdit(b)} className="rounded p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600">
                <Pencil size={14} />
              </button>
              )}
              {isAdmin && (
              <button onClick={() => handleArchive(b.id)} className="rounded p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600">
                <Archive size={14} />
              </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Hierarchy tree */}
      {boards.filter((b) => b.active).length > 1 && (
        <div className="mt-6">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">Board Hierarchy</h3>
          <div className="rounded-lg border border-neutral-200 bg-white p-4 text-sm">
            {boards.filter((b) => b.active && !b.parent_arb_id).map((root) => (
              <div key={root.id}>
                <div className="font-medium">{root.name} <span className={`ml-1 rounded px-1.5 py-0.5 text-[10px] ${SCOPE_BADGES[root.scope] ?? ""}`}>{SCOPE_OPTIONS.find((s) => s.value === root.scope)?.label}</span></div>
                {boards.filter((b) => b.active && b.parent_arb_id === root.id).map((child) => (
                  <div key={child.id} className="ml-6 mt-1 text-neutral-600">
                    └ {child.name} <span className={`ml-1 rounded px-1.5 py-0.5 text-[10px] ${SCOPE_BADGES[child.scope] ?? ""}`}>{SCOPE_OPTIONS.find((s) => s.value === child.scope)?.label}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create/Edit form */}
      {showForm && (
        <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-4 space-y-3">
          <h3 className="text-sm font-semibold">{editingId ? "Edit Board" : "Create Board"}</h3>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">Name *</label>
            <input value={formName} onChange={(e) => setFormName(e.target.value)} className={inputClass} placeholder="e.g. Security Review Board" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">Scope *</label>
              <select value={formScope} onChange={(e) => setFormScope(e.target.value)} className={inputClass}>
                {SCOPE_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">Scope Type *</label>
              <div className="flex gap-2">
                {SCOPE_TYPE_OPTIONS.map((s) => (
                  <button key={s.value} onClick={() => setFormScopeType(s.value)} className={`flex-1 rounded-md border px-3 py-1.5 text-xs ${formScopeType === s.value ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 hover:bg-neutral-50"}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {formScopeType === "domain_scoped" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">Governed Domains</label>
              <div className="flex flex-wrap gap-2">
                {domains.map((d) => (
                  <button key={d.id} onClick={() => toggleDomain(d.id)} className={`rounded-md border px-3 py-1 text-xs ${formDomainIds.includes(d.id) ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 hover:bg-neutral-50"}`}>
                    {d.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {formScopeType === "topic_scoped" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">Governed Decision Types</label>
              <div className="flex flex-wrap gap-2">
                {DECISION_TYPES.map((t) => (
                  <button key={t} onClick={() => toggleDecisionType(t)} className={`rounded-md border px-3 py-1 text-xs ${formDecisionTypes.includes(t) ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 hover:bg-neutral-50"}`}>
                    {t.replace(/_/g, " ")}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">Parent Board</label>
              <select value={formParentId} onChange={(e) => setFormParentId(e.target.value)} className={inputClass}>
                <option value="">No parent (apex)</option>
                {boards.filter((b) => b.active && b.id !== editingId).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">Quorum</label>
              <input type="number" value={formQuorum} onChange={(e) => setFormQuorum(Number(e.target.value))} className={inputClass} min={1} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">Cadence</label>
              <select value={formCadence} onChange={(e) => setFormCadence(e.target.value)} className={inputClass}>
                {CADENCE_OPTIONS.map((c) => <option key={c} value={c}>{c.replace("_", "-")}</option>)}
              </select>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={handleSave} disabled={saving || !formName.trim()} className="rounded-md bg-neutral-900 px-4 py-1.5 text-sm text-white hover:bg-neutral-800 disabled:opacity-50">
              {saving ? "Saving..." : editingId ? "Update" : "Create"}
            </button>
            <button onClick={() => { setShowForm(false); setEditingId(null); }} className="rounded-md border border-neutral-300 px-4 py-1.5 text-sm hover:bg-neutral-50">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
