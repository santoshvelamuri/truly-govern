"use client";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import DeviationRegister from "@/components/truly-govern/deviations/DeviationRegister";
import type { GovernanceView } from "@/lib/truly-govern/governance-views";

export default function DeviationsPage() {
  const router = useRouter();
  const onNavigate = useCallback((view: GovernanceView) => {
    if (view.page === "deviations-detail") router.push(`/truly-govern/govern/deviations/${view.id}`);
    else if (view.page === "exceptions") router.push("/truly-govern/govern/exceptions");
  }, [router]);
  return <DeviationRegister onNavigate={onNavigate} />;
}
