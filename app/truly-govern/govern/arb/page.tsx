"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import ArbBacklogWorkspace from "@/components/truly-govern/decisions/ArbBacklogWorkspace";
import type { GovernanceView } from "@/lib/truly-govern/governance-views";

export default function ArbPage() {
  const router = useRouter();
  const onNavigate = useCallback((view: GovernanceView) => {
    if (view.page === "arb-board-detail") router.push(`/truly-govern/govern/arb/boards/${view.boardId}`);
    else if (view.page === "arb-detail") router.push(`/truly-govern/govern/arb/${view.id}`);
    else if (view.page === "decisions-detail") router.push(`/truly-govern/govern/decisions/${view.id}`);
  }, [router]);
  return <ArbBacklogWorkspace onNavigate={onNavigate} />;
}
