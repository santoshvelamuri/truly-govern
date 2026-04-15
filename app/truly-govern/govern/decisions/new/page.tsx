"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import NewDecisionWorkspace from "@/components/truly-govern/decisions/NewDecisionWorkspace";
import type { GovernanceView } from "@/lib/truly-govern/governance-views";

export default function NewDecisionPage() {
  const router = useRouter();
  const onNavigate = useCallback((view: GovernanceView) => {
    if (view.page === "decisions") router.push("/truly-govern/govern/decisions");
    else if (view.page === "decisions-detail") router.push(`/truly-govern/govern/decisions/${view.id}`);
  }, [router]);
  return <NewDecisionWorkspace onNavigate={onNavigate} />;
}
