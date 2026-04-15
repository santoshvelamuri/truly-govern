"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { getAccessToken } from "@/lib/utils";
import { getOrgId } from "@/lib/getOrgId";
import { useToast } from "@/hooks/useToast";
import { useCurrentUser } from "@/hooks/useCurrentUser";

type Role = "owner" | "admin" | "member" | "viewer";

interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: Role;
  org_id: string;
  created_at: string;
}

const ROLES: Role[] = ["owner", "admin", "member", "viewer"];

const ROLE_STYLES: Record<Role, string> = {
  owner:  "border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-700 dark:bg-purple-950/40 dark:text-purple-300",
  admin:  "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  member: "border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-600 dark:bg-slate-800/40 dark:text-slate-400",
  viewer: "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-500",
};

interface InviteFormData {
  email: string;
  full_name: string;
  role: Role;
}

export function UsersTab() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState<InviteFormData>({ email: "", full_name: "", role: "member" });
  const [inviting, setInviting] = useState(false);
  const { toast, showToast, setToast } = useToast();
  const { isAdmin } = useCurrentUser();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const token = await getAccessToken();
      if (!token) { setLoading(false); return; }
      const res = await fetch("/api/profiles", { headers: { Authorization: `Bearer ${token}` } });
      const { data, error } = await res.json();
      if (cancelled) return;
      if (error) { showToast(error, "error"); setLoading(false); return; }
      setProfiles(data ?? []);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  async function updateProfile(id: string, patch: { full_name?: string; role?: Role }) {
    const token = await getAccessToken();
    if (!token) { showToast("Not authenticated.", "error"); return; }
    const profile = profiles.find((p) => p.id === id);
    if (!profile) return;
    const updated = { ...profile, ...patch };
    setProfiles((prev) => prev.map((p) => (p.id === id ? updated : p)));
    const res = await fetch("/api/profiles", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id, full_name: updated.full_name, role: updated.role }),
    });
    const { error } = await res.json();
    if (error) {
      showToast(error, "error");
      setProfiles((prev) => prev.map((p) => (p.id === id ? profile : p)));
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    const token = await getAccessToken();
    if (!token) { showToast("Not authenticated.", "error"); setInviting(false); return; }
    let orgId: string;
    try { orgId = await getOrgId(); } catch {
      showToast("Could not resolve org.", "error"); setInviting(false); return;
    }
    const res = await fetch("/api/profiles/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...inviteForm, org_id: orgId }),
    });
    const { error, userId } = await res.json();
    setInviting(false);
    if (error) { showToast(error, "error"); return; }
    // Optimistically add to list
    setProfiles((prev) => [
      ...prev,
      { id: userId, full_name: inviteForm.full_name || null, avatar_url: null, role: inviteForm.role, org_id: orgId, created_at: new Date().toISOString() },
    ]);
    setInviteForm({ email: "", full_name: "", role: "member" });
    setInviteOpen(false);
    showToast("Invitation sent", "success");
  }

  const inputCls = "w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground/40 focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20";
  const labelCls = "mb-1 block text-xs font-medium text-muted-foreground";

  return (
    <div className="relative flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{profiles.length} user{profiles.length !== 1 ? "s" : ""}</span>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-brand-primary/90"
            >
              <Plus className="h-3.5 w-3.5" />
              Invite User
            </button>
          )}
        </div>

        {/* Table */}
        {loading ? (
          <p className="py-8 text-center text-xs text-muted-foreground">Loading…</p>
        ) : profiles.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">No users found.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border/60 bg-surface-elevated">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-muted/30">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Name</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Role</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {profiles.map((profile) => (
                  <tr key={profile.id} className="group hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        defaultValue={profile.full_name ?? ""}
                        onBlur={(e) => {
                          if (e.target.value !== (profile.full_name ?? "")) {
                            updateProfile(profile.id, { full_name: e.target.value || undefined });
                          }
                        }}
                        placeholder="—"
                        className="w-full bg-transparent text-sm text-foreground placeholder:text-foreground/30 focus:outline-none"
                      />
                    </td>
                    <td className="px-4 py-3">
                      {isAdmin ? (
                        <select
                          value={profile.role}
                          onChange={(e) => updateProfile(profile.id, { role: e.target.value as Role })}
                          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold focus:outline-none ${ROLE_STYLES[profile.role]}`}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${ROLE_STYLES[profile.role]}`}>
                          {profile.role.charAt(0).toUpperCase() + profile.role.slice(1)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(profile.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invite Modal */}
      {inviteOpen && (
        <>
          <div className="fixed inset-0 z-20 bg-black/20 backdrop-blur-[1px]" onClick={() => setInviteOpen(false)} />
          <div className="fixed left-1/2 top-1/2 z-30 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border/60 bg-surface-elevated p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Invite User</h3>
              <button type="button" onClick={() => setInviteOpen(false)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className={labelCls}>Email <span className="text-red-400">*</span></label>
                <input
                  type="email"
                  required
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
                  className={inputCls}
                  placeholder="user@example.com"
                />
              </div>
              <div>
                <label className={labelCls}>Full Name</label>
                <input
                  type="text"
                  value={inviteForm.full_name}
                  onChange={(e) => setInviteForm((f) => ({ ...f, full_name: e.target.value }))}
                  className={inputCls}
                  placeholder="Jane Smith"
                />
              </div>
              <div>
                <label className={labelCls}>Role</label>
                <select
                  value={inviteForm.role}
                  onChange={(e) => setInviteForm((f) => ({ ...f, role: e.target.value as Role }))}
                  className={inputCls}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setInviteOpen(false)}
                  className="rounded-lg border border-border/60 px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviting}
                  className="rounded-lg bg-brand-primary px-4 py-2 text-xs font-semibold text-white hover:bg-brand-primary/90 disabled:opacity-60"
                >
                  {inviting ? "Sending…" : "Send Invite"}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

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
