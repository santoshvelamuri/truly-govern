"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import AdvisorWorkspace from "@/components/truly-govern/advisor/AdvisorWorkspace";
import type { GovernanceView } from "@/lib/truly-govern/governance-views";

export default function AdvisorPage() {
  const router = useRouter();

  const onNavigate = useCallback((view: GovernanceView) => {
    if (view.page === "policies-detail") {
      router.push(`/truly-govern/govern/policies/${view.id}`);
    } else if (view.page === "policies") {
      router.push("/truly-govern/govern/policies");
    }
  }, [router]);

  return (
    <div className="h-full -m-6">
      <AdvisorWorkspace onNavigate={onNavigate} />
    </div>
  );
}
