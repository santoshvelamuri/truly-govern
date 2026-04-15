"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, Bell } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import NotificationPanel from "@/components/truly-govern/shared/NotificationPanel";

const BREADCRUMB_MAP: Record<string, string> = {
  govern: "Govern",
  advisor: "Advisor",
  policies: "Policy library",
  patterns: "Pattern library",
  reviews: "Design reviews",
  decisions: "Decision requests",
  arb: "ARB backlog",
  adrs: "ADR library",
  settings: "Organisation",
  new: "New",
};

export default function TGTopbar() {
  const pathname = usePathname();
  const router = useRouter();
  const segments = pathname.split("/").filter(Boolean);
  const crumbs = segments.map((seg) => BREADCRUMB_MAP[seg] || seg);

  const [unreadCount, setUnreadCount] = useState(0);
  const [showPanel, setShowPanel] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const fetchUnreadCount = useCallback(async () => {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) return;
    try {
      const res = await fetch("/api/truly-govern/notifications/unread-count", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      setUnreadCount(json.count ?? 0);
    } catch {
      // Silently fail — badge just won't update
    }
  }, []);

  // Fetch current user info
  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserEmail(user.email ?? null);
      const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
      setUserName(profile?.full_name || null);
    }
    loadUser();
  }, []);

  // Fetch on mount + poll every 60s
  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 60000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  // Refresh count when panel closes
  useEffect(() => {
    if (!showPanel) fetchUnreadCount();
  }, [showPanel, fetchUnreadCount]);

  // Close panel on outside click
  useEffect(() => {
    if (!showPanel) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowPanel(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showPanel]);

  function handleNavigate(url: string) {
    setShowPanel(false);
    router.push(`/truly-govern${url}`);
  }

  return (
    <header className="relative flex h-12 shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-6">
      <nav className="flex items-center gap-1 text-sm text-neutral-500">
        {crumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-neutral-300">/</span>}
            <span className={i === crumbs.length - 1 ? "text-neutral-900 font-medium" : ""}>
              {crumb}
            </span>
          </span>
        ))}
      </nav>

      <div className="flex items-center gap-3">
        {(userName || userEmail) && (
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-900 text-xs font-medium text-white">
              {(userName || userEmail || "?").charAt(0).toUpperCase()}
            </div>
            <span className="text-sm text-neutral-600">{userName || userEmail}</span>
          </div>
        )}

        <button className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600">
          <Search size={16} />
        </button>

        {/* Bell with badge */}
        <div className="relative" ref={panelRef}>
          <button
            onClick={() => setShowPanel(!showPanel)}
            className={`rounded-md p-1.5 transition-colors ${showPanel ? "bg-neutral-100 text-neutral-700" : "text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"}`}
          >
            <Bell size={16} />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {showPanel && (
            <NotificationPanel
              onClose={() => setShowPanel(false)}
              onNavigate={handleNavigate}
            />
          )}
        </div>
      </div>
    </header>
  );
}
