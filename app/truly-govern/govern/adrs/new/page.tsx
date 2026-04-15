"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import NewAdrWorkspace from "@/components/truly-govern/adrs/NewAdrWorkspace";
import type { GovernanceView } from "@/lib/truly-govern/governance-views";

export default function NewAdrPage() {
  const router = useRouter();

  const onNavigate = useCallback((view: GovernanceView) => {
    if (view.page === "adrs") {
      router.push("/truly-govern/govern/adrs");
    } else if (view.page === "adrs-detail") {
      router.push(`/truly-govern/govern/adrs/${view.id}`);
    }
  }, [router]);

  return <NewAdrWorkspace onNavigate={onNavigate} />;
}
