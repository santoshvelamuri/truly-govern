"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import DecisionsWorkspace from "@/components/truly-govern/decisions/DecisionsWorkspace";
import type { GovernanceView } from "@/lib/truly-govern/governance-views";

export default function DecisionsPage() {
  const router = useRouter();
  const onNavigate = useCallback((view: GovernanceView) => {
    if (view.page === "decisions-new") router.push("/truly-govern/govern/decisions/new");
    else if (view.page === "decisions-detail") router.push(`/truly-govern/govern/decisions/${view.id}`);
  }, [router]);
  return <DecisionsWorkspace onNavigate={onNavigate} />;
}
