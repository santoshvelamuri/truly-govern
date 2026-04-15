"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Archive, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useCurrentUser } from "@/hooks/useCurrentUser";

interface Domain {
  id: string;
  name: string;
  description: string | null;
  colour: string;
  archived: boolean;
  sort_order: number;
}

export default function DomainManager({ orgId }: { orgId: string }) {
  const { isAdmin } = useCurrentUser();
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", colour: "blue" });
  const [saving, setSaving] = useState(false);

  const fetchDomains = useCallback(async () => {
    const { data } = await supabase
      .from("capability_domains")
      .select("*")
      .eq("org_id", orgId)
      .eq("archived", false)
      .order("sort_order", { ascending: true });
    setDomains(data ?? []);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { fetchDomains(); }, [fetchDomains]);

  async function handleAdd() {
    if (!form.name.trim()) return;
    setSaving(true);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    await fetch("/api/truly-govern/domains", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: form.name, description: form.description || null, color: form.colour }),
    });
    setForm({ name: "", description: "", colour: "blue" });
    setShowAdd(false);
    setSaving(false);
    fetchDomains();
  }

  async function handleUpdate(id: string) {
    setSaving(true);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    await fetch("/api/truly-govern/domains", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id, name: form.name, description: form.description || null, color: form.colour }),
    });
    setEditingId(null);
    setSaving(false);
    fetchDomains();
  }

  async function handleArchive(id: string) {
    if (!confirm("Archiving a domain will not delete policies — they become unassigned. Continue?")) return;
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    await fetch("/api/truly-govern/domains", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id, archived: true }),
    });
    fetchDomains();
  }

  if (loading) return <div className="flex items-center gap-2 text-sm text-neutral-500"><Loader2 size={16} className="animate-spin" /> Loading domains…</div>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Domains</h2>
        <button onClick={() => { setShowAdd(true); setForm({ name: "", description: "", colour: "blue" }); }} className="flex items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-800">
          <Plus size={14} /> Add domain
        </button>
      </div>

      {domains.length === 0 && !showAdd && (
        <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
          No domains yet. Start by creating your first domain, such as &quot;Security&quot; or &quot;Data&quot;.
        </div>
      )}

      {showAdd && (
        <div className="mb-3 rounded-lg border border-neutral-200 bg-white p-4">
          <div className="flex flex-col gap-2">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Domain name" className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm" autoFocus />
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description (optional)" className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm" />
            <div className="flex items-center gap-2">
              <label className="text-xs text-neutral-500">Colour:</label>
              <select value={form.colour} onChange={(e) => setForm({ ...form, colour: e.target.value })} className="rounded-md border border-neutral-300 px-2 py-1 text-sm">
                {["blue", "green", "red", "amber", "purple", "pink", "teal", "indigo"].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={handleAdd} disabled={saving} className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-800 disabled:opacity-50">
                {saving ? "Saving…" : "Create"}
              </button>
              <button onClick={() => setShowAdd(false)} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-1">
        {domains.map((d) => (
          <div key={d.id} className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3">
            {editingId === d.id ? (
              <div className="flex flex-1 flex-col gap-2">
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm" />
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm" />
                <div className="flex gap-2">
                  <button onClick={() => handleUpdate(d.id)} disabled={saving} className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-800 disabled:opacity-50">Save</button>
                  <button onClick={() => setEditingId(null)} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <span className="text-sm font-medium">{d.name}</span>
                  {d.description && <span className="ml-2 text-sm text-neutral-500">{d.description}</span>}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => { setEditingId(d.id); setForm({ name: d.name, description: d.description ?? "", colour: d.colour }); }} className="rounded p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600">
                    <Pencil size={14} />
                  </button>
                  {isAdmin && (
                  <button onClick={() => handleArchive(d.id)} className="rounded p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600">
                    <Archive size={14} />
                  </button>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
