"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Loader2, Calendar, Users } from "lucide-react";
import type { GovernanceView } from "@/lib/truly-govern/governance-views";

interface BoardCard {
  id: string;
  name: string;
  scope: string;
  scope_type: string;
  meeting_cadence: string;
  arb_board_members: { id: string }[];
  pending_count?: number;
}

interface ArbBacklogWorkspaceProps {
  onNavigate: (view: GovernanceView) => void;
}

const SCOPE_BADGES: Record<string, string> = {
  domain_arb: "bg-blue-50 text-blue-700",
  department_arb: "bg-purple-50 text-purple-700",
  enterprise_arb: "bg-amber-50 text-amber-700",
};

const SCOPE_LABELS: Record<string, string> = {
  domain_arb: "Domain", department_arb: "Department", enterprise_arb: "Enterprise",
};

export default function ArbBacklogWorkspace({ onNavigate }: ArbBacklogWorkspaceProps) {
  const [boards, setBoards] = useState<BoardCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
      if (!profile) return;
      const orgId = profile.org_id;

      // Load boards user belongs to
      const { data: memberships } = await supabase
        .from("arb_board_members")
        .select("board_id")
        .eq("user_id", user.id);

      const memberBoardIds = (memberships ?? []).map((m: { board_id: string }) => m.board_id);

      // Load all active boards (show all if user is admin, or filter by membership)
      const { data: allBoards } = await supabase
        .from("arb_boards")
        .select("*, arb_board_members(id)")
        .eq("org_id", orgId)
        .eq("active", true)
        .order("name");

      // Count pending requests per board
      const { data: pendingCounts } = await supabase
        .from("decision_requests")
        .select("resolved_arb_board_id")
        .eq("org_id", orgId)
        .eq("status", "submitted");

      const countMap = new Map<string, number>();
      for (const r of pendingCounts ?? []) {
        if (r.resolved_arb_board_id) {
          countMap.set(r.resolved_arb_board_id, (countMap.get(r.resolved_arb_board_id) ?? 0) + 1);
        }
      }

      const boardsWithCounts = (allBoards ?? []).map((b: BoardCard) => ({
        ...b,
        pending_count: countMap.get(b.id) ?? 0,
      }));

      // Show boards user belongs to, or all if they belong to none (admin view)
      const filtered = memberBoardIds.length > 0
        ? boardsWithCounts.filter((b: BoardCard) => memberBoardIds.includes(b.id))
        : boardsWithCounts;

      setBoards(filtered);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <div className="flex items-center gap-2 text-sm text-neutral-500"><Loader2 size={16} className="animate-spin" /> Loading boards...</div>;

  if (boards.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
        No ARB boards found. Create boards in Settings → ARB Boards.
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-4 text-sm font-semibold">Your ARB Boards</h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {boards.map((b) => (
          <button
            key={b.id}
            onClick={() => onNavigate({ page: "arb-board-detail", boardId: b.id })}
            className="rounded-lg border border-neutral-200 bg-white p-4 text-left transition-colors hover:border-neutral-300 hover:shadow-sm"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-semibold">{b.name}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${SCOPE_BADGES[b.scope] ?? "bg-neutral-100"}`}>
                {SCOPE_LABELS[b.scope]}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-neutral-400 mb-3">
              <span className="rounded bg-neutral-100 px-1.5 py-0.5">{b.scope_type === "domain_scoped" ? "Domain-scoped" : "Topic-scoped"}</span>
              <span className="capitalize">{b.meeting_cadence.replace("_", "-")}</span>
            </div>
            <div className="flex items-center gap-4 text-xs">
              {b.pending_count && b.pending_count > 0 ? (
                <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-amber-700 font-medium">
                  {b.pending_count} pending
                </span>
              ) : (
                <span className="text-neutral-400">No pending</span>
              )}
              <span className="flex items-center gap-1 text-neutral-400">
                <Users size={10} /> {b.arb_board_members?.length ?? 0}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
