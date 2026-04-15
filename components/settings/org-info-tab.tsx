"use client";

import { useEffect, useState } from "react";
import { getAccessToken } from "@/lib/utils";
import { useToast } from "@/hooks/useToast";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { X } from "lucide-react";

interface OrgData {
  id: string;
  name: string;
  industry: string;
  slug: string;
  logo_url: string;
  currency: string;
  portfolio_name: string;
}

const CURRENCIES = ["EUR", "USD", "GBP", "SGD", "AUD"];

export function OrgInfoTab() {
  const [org, setOrg] = useState<OrgData | null>(null);
  const [form, setForm] = useState<OrgData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast, showToast, setToast } = useToast();
  const { isAdmin } = useCurrentUser();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const token = await getAccessToken();
      if (!token) { setLoading(false); return; }
      const res = await fetch("/api/organizations", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const { data, error } = await res.json();
      if (cancelled) return;
      if (error) { showToast(error, "error"); setLoading(false); return; }
      setOrg(data);
      setForm(data);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    const token = await getAccessToken();
    if (!token) { showToast("Not authenticated.", "error"); setSaving(false); return; }
    const res = await fetch("/api/organizations", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(form),
    });
    const { error } = await res.json();
    setSaving(false);
    if (error) { showToast(error, "error"); return; }
    setOrg(form);
    showToast("Organisation saved", "success");
  }

  function field(key: keyof OrgData, value: string) {
    setForm((prev) => prev ? { ...prev, [key]: value } : prev);
  }

  const inputCls = "w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground/40 focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20";
  const labelCls = "mb-1 block text-xs font-medium text-muted-foreground";

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-xs text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-xs text-muted-foreground">No organisation data found.</p>
      </div>
    );
  }

  return (
    <div className="relative flex-1 overflow-y-auto p-6">
      <form onSubmit={handleSave} className="mx-auto max-w-lg space-y-5">
        {!isAdmin && (
          <div className="mb-4 rounded-lg bg-neutral-100 p-3 text-xs text-neutral-500">Only administrators can edit organisation settings.</div>
        )}
        <div>
          <label className={labelCls}>Organisation Name <span className="text-red-400">*</span></label>
          <input
            type="text"
            required
            disabled={!isAdmin}
            value={form.name}
            onChange={(e) => field("name", e.target.value)}
            className={inputCls}
            placeholder="Acme Corp"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Industry</label>
            <input
              type="text"
              disabled={!isAdmin}
              value={form.industry ?? ""}
              onChange={(e) => field("industry", e.target.value)}
              className={inputCls}
              placeholder="e.g. Fashion, Retail"
            />
          </div>
          <div>
            <label className={labelCls}>Currency</label>
            <select
              disabled={!isAdmin}
              value={form.currency ?? "EUR"}
              onChange={(e) => field("currency", e.target.value)}
              className={inputCls}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={labelCls}>Slug</label>
          <input
            type="text"
            disabled={!isAdmin}
            value={form.slug ?? ""}
            onChange={(e) => field("slug", e.target.value)}
            className={inputCls}
            placeholder="acme-corp"
          />
        </div>

        <div>
          <label className={labelCls}>Portfolio Name</label>
          <input
            type="text"
            disabled={!isAdmin}
            value={form.portfolio_name ?? ""}
            onChange={(e) => field("portfolio_name", e.target.value)}
            className={inputCls}
            placeholder="e.g. Fashion Application Portfolio"
          />
        </div>

        <div>
          <label className={labelCls}>Logo URL</label>
          <input
            type="text"
            disabled={!isAdmin}
            value={form.logo_url ?? ""}
            onChange={(e) => field("logo_url", e.target.value)}
            className={inputCls}
            placeholder="https://…"
          />
        </div>

        {isAdmin && (
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-brand-primary px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-primary/90 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        )}
      </form>

      {toast && (
        <div
          className={`fixed left-1/2 top-5 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg ${
            toast.type === "success"
              ? "border-green-300 bg-green-50 text-green-900 dark:border-green-700 dark:bg-green-950/40 dark:text-green-100"
              : "border-red-300 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950/40 dark:text-red-100"
          }`}
        >
          <span>{toast.message}</span>
          <button type="button" onClick={() => setToast(null)} className="ml-2 text-xs opacity-60 hover:opacity-100">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
