"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback } from "react";
import DecisionDetailWorkspace from "@/components/truly-govern/decisions/DecisionDetailWorkspace";
import type { GovernanceView } from "@/lib/truly-govern/governance-views";

export default function DecisionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const onNavigate = useCallback((view: GovernanceView) => {
    if (view.page === "decisions") router.push("/truly-govern/govern/decisions");
    else if (view.page === "decisions-detail") router.push(`/truly-govern/govern/decisions/${view.id}`);
  }, [router]);
  return <DecisionDetailWorkspace requestId={id} onNavigate={onNavigate} />;
}
