"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback } from "react";
import BoardDetailWorkspace from "@/components/truly-govern/decisions/BoardDetailWorkspace";
import type { GovernanceView } from "@/lib/truly-govern/governance-views";

export default function BoardDetailPage() {
  const { board_id } = useParams<{ board_id: string }>();
  const router = useRouter();
  const onNavigate = useCallback((view: GovernanceView) => {
    if (view.page === "arb") router.push("/truly-govern/govern/arb");
    else if (view.page === "arb-detail") router.push(`/truly-govern/govern/arb/${view.id}`);
    else if (view.page === "arb-board-detail") router.push(`/truly-govern/govern/arb/boards/${view.boardId}`);
  }, [router]);
  return <BoardDetailWorkspace boardId={board_id} onNavigate={onNavigate} />;
}
