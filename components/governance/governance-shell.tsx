"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  MessageSquare,
  Shield,
  ClipboardCheck,
  GitBranch,
  Calendar,
  FileText,
  Settings,
  Table,
  CheckCircle,
  Layers,
  AlertTriangle,
  Bell,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { TG_NAV_ITEMS } from "@/lib/truly-govern/constants";
import type { GovernanceView } from "@/lib/truly-govern/governance-views";
import NotificationPanel from "@/components/truly-govern/shared/NotificationPanel";
import PoliciesWorkspace from "@/components/truly-govern/policies/PoliciesWorkspace";
import PolicyDetailWorkspace from "@/components/truly-govern/policies/PolicyDetailWorkspace";
import NewPolicyWorkspace from "@/components/truly-govern/policies/NewPolicyWorkspace";
import SettingsWorkspace from "@/components/truly-govern/settings/SettingsWorkspace";
import AdvisorWorkspace from "@/components/truly-govern/advisor/AdvisorWorkspace";
import ReviewsWorkspace from "@/components/truly-govern/reviews/ReviewsWorkspace";
import NewReviewWorkspace from "@/components/truly-govern/reviews/NewReviewWorkspace";
import ReviewWorkbench from "@/components/truly-govern/reviews/ReviewWorkbench";
import AdrsWorkspace from "@/components/truly-govern/adrs/AdrsWorkspace";
import NewAdrWorkspace from "@/components/truly-govern/adrs/NewAdrWorkspace";
import AdrDetailWorkspace from "@/components/truly-govern/adrs/AdrDetailWorkspace";
import DecisionsWorkspace from "@/components/truly-govern/decisions/DecisionsWorkspace";
import NewDecisionWorkspace from "@/components/truly-govern/decisions/NewDecisionWorkspace";
import DecisionDetailWorkspace from "@/components/truly-govern/decisions/DecisionDetailWorkspace";
import ArbBacklogWorkspace from "@/components/truly-govern/decisions/ArbBacklogWorkspace";
import ArbMeetingDetail from "@/components/truly-govern/decisions/ArbMeetingDetail";
import BoardDetailWorkspace from "@/components/truly-govern/decisions/BoardDetailWorkspace";
import PatternsWorkspace from "@/components/truly-govern/patterns/PatternsWorkspace";
import NewPatternWorkspace from "@/components/truly-govern/patterns/NewPatternWorkspace";
import PatternDetailWorkspace from "@/components/truly-govern/patterns/PatternDetailWorkspace";
import PatternReviewWorkspace from "@/components/truly-govern/patterns/PatternReviewWorkspace";
import DeviationRegister from "@/components/truly-govern/deviations/DeviationRegister";
import { StandardsWorkspace } from "@/components/governance/standards-workspace";
import { ComplianceWorkspace } from "@/components/governance/compliance-workspace";

const ICON_MAP: Record<string, React.ComponentType<{ size?: number }>> = {
  MessageSquare,
  Shield,
  Layers,
  AlertTriangle,
  ClipboardCheck,
  GitBranch,
  Calendar,
  FileText,
  Settings,
  Table,
  CheckCircle,
};

/** Maps a nav item href to its GovernanceView page value */
function hrefToPage(href: string): GovernanceView["page"] {
  const map: Record<string, GovernanceView["page"]> = {
    "/govern/advisor": "advisor",
    "/govern/policies": "policies",
    "/govern/patterns": "patterns",
    "/govern/deviations": "deviations",
    "/govern/reviews": "reviews",
    "/govern/decisions": "decisions",
    "/govern/arb": "arb",
    "/govern/adrs": "adrs",
    "/govern/settings": "settings",
  };
  return map[href] ?? "advisor";
}

/** Checks if a nav item is active for the current view */
function isNavActive(href: string, view: GovernanceView): boolean {
  const navPage = hrefToPage(href);
  if (view.page === "policies-new" || view.page === "policies-detail") {
    return navPage === "policies";
  }
  if (view.page === "patterns-new" || view.page === "patterns-detail" || view.page === "patterns-review") {
    return navPage === "patterns";
  }
  if (view.page === "deviations-detail" || view.page === "exceptions" || view.page === "exceptions-new" || view.page === "exceptions-detail") {
    return navPage === "deviations";
  }
  if (view.page === "reviews-new" || view.page === "reviews-detail") {
    return navPage === "reviews";
  }
  if (view.page === "adrs-new" || view.page === "adrs-detail" || view.page === "adrs-new-supersede") {
    return navPage === "adrs";
  }
  if (view.page === "decisions-new" || view.page === "decisions-detail") {
    return navPage === "decisions";
  }
  if (view.page === "arb-detail" || view.page === "arb-board-detail") {
    return navPage === "arb";
  }
  return navPage === view.page;
}

export function GovernanceShell() {
  const [view, setView] = useState<GovernanceView>({ page: "policies" });
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  const fetchUnreadCount = useCallback(async () => {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) return;
    try {
      const res = await fetch("/api/truly-govern/notifications/unread-count", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      setUnreadCount(json.count ?? 0);
    } catch { /* silently fail */ }
  }, []);

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 60000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  useEffect(() => {
    if (!showNotifications) { fetchUnreadCount(); return; }
    function handleClick(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setShowNotifications(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showNotifications, fetchUnreadCount]);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar */}
      <aside className="flex h-full w-[220px] shrink-0 flex-col border-r border-border bg-white">
        <div className="flex items-center justify-between px-4 py-4">
          <span className="text-sm font-semibold text-neutral-900">Governance</span>
          <div className="relative" ref={bellRef}>
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className={`rounded-md p-1.5 transition-colors ${showNotifications ? "bg-neutral-100 text-neutral-700" : "text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"}`}
            >
              <Bell size={15} />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
            {showNotifications && (
              <div className="absolute left-0 top-full z-50 mt-1">
                <NotificationPanel
                  onClose={() => setShowNotifications(false)}
                  onNavigate={(url) => {
                    setShowNotifications(false);
                    // Parse the governance URL and set the view
                    const match = url.match(/\/govern\/(\w+)(?:\/(.+))?/);
                    if (match) {
                      const page = match[1];
                      const id = match[2];
                      if (id) {
                        setView({ page: `${page}-detail`, id } as GovernanceView);
                      } else {
                        setView({ page } as GovernanceView);
                      }
                    }
                  }}
                />
              </div>
            )}
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2">
          {TG_NAV_ITEMS.map((section) => (
            <div key={section.section} className="mb-3">
              <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                {section.section}
              </div>
              {section.items.map((item) => {
                const Icon = ICON_MAP[item.icon];
                const active = isNavActive(item.href, view);
                return (
                  <button
                    key={item.href}
                    type="button"
                    onClick={() => setView({ page: hrefToPage(item.href) } as GovernanceView)}
                    className={`flex h-9 w-full items-center gap-2 rounded-md px-2 text-sm transition-colors ${
                      active
                        ? "border-l-2 border-neutral-900 bg-neutral-100 font-medium text-neutral-900"
                        : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
                    }`}
                  >
                    {Icon && <Icon size={16} />}
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}

          {/* Legacy items hidden — Standards and Compliance still accessible via direct view state */}
        </nav>
      </aside>

      {/* Content area */}
      <main className={`flex-1 overflow-hidden ${view.page === "advisor" ? "" : "overflow-y-auto p-6"}`}>
        {view.page === "advisor" && (
          <AdvisorWorkspace onNavigate={setView} />
        )}
        {view.page === "policies" && (
          <PoliciesWorkspace onNavigate={setView} />
        )}
        {view.page === "policies-new" && (
          <NewPolicyWorkspace onNavigate={setView} />
        )}
        {view.page === "policies-detail" && (
          <PolicyDetailWorkspace policyId={view.id} onNavigate={setView} />
        )}
        {view.page === "patterns" && (
          <PatternsWorkspace onNavigate={setView} />
        )}
        {view.page === "patterns-new" && (
          <NewPatternWorkspace onNavigate={setView} />
        )}
        {view.page === "patterns-detail" && (
          <PatternDetailWorkspace patternId={view.id} onNavigate={setView} />
        )}
        {view.page === "patterns-review" && (
          <PatternReviewWorkspace patternId={view.id} onNavigate={setView} />
        )}
        {view.page === "deviations" && (
          <DeviationRegister onNavigate={setView} />
        )}
        {view.page === "reviews" && (
          <ReviewsWorkspace onNavigate={setView} />
        )}
        {view.page === "reviews-new" && (
          <NewReviewWorkspace onNavigate={setView} />
        )}
        {view.page === "reviews-edit" && (
          <NewReviewWorkspace onNavigate={setView} editReviewId={view.id} />
        )}
        {view.page === "reviews-detail" && (
          <ReviewWorkbench reviewId={view.id} onNavigate={setView} />
        )}
        {view.page === "decisions" && (
          <DecisionsWorkspace onNavigate={setView} />
        )}
        {view.page === "decisions-new" && (
          <NewDecisionWorkspace onNavigate={setView} />
        )}
        {view.page === "decisions-detail" && (
          <DecisionDetailWorkspace requestId={view.id} onNavigate={setView} />
        )}
        {view.page === "arb" && (
          <ArbBacklogWorkspace onNavigate={setView} />
        )}
        {view.page === "arb-board-detail" && (
          <BoardDetailWorkspace boardId={view.boardId} onNavigate={setView} />
        )}
        {view.page === "arb-detail" && (
          <ArbMeetingDetail meetingId={view.id} onNavigate={setView} />
        )}
        {view.page === "adrs" && (
          <AdrsWorkspace onNavigate={setView} />
        )}
        {view.page === "adrs-new" && (
          <NewAdrWorkspace onNavigate={setView} />
        )}
        {view.page === "adrs-new-supersede" && (
          <NewAdrWorkspace onNavigate={setView} prefillSupersedes={view.supersedeId} prefillContext="(Superseding a previous ADR — update the context and decision below)" />
        )}
        {view.page === "adrs-detail" && (
          <AdrDetailWorkspace adrId={view.id} onNavigate={setView} />
        )}
        {view.page === "settings" && (
          <SettingsWorkspace />
        )}
        {view.page === "standards" && (
          <StandardsWorkspace />
        )}
        {view.page === "compliance" && (
          <ComplianceWorkspace />
        )}
      </main>
    </div>
  );
}
