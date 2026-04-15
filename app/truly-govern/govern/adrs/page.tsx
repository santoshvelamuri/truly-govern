"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import AdrsWorkspace from "@/components/truly-govern/adrs/AdrsWorkspace";
import type { GovernanceView } from "@/lib/truly-govern/governance-views";

export default function AdrsPage() {
  const router = useRouter();

  const onNavigate = useCallback((view: GovernanceView) => {
    if (view.page === "adrs-new") {
      router.push("/truly-govern/govern/adrs/new");
    } else if (view.page === "adrs-detail") {
      router.push(`/truly-govern/govern/adrs/${view.id}`);
    }
  }, [router]);

  return <AdrsWorkspace onNavigate={onNavigate} />;
}
