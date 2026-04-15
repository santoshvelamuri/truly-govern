"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import PoliciesWorkspace from "@/components/truly-govern/policies/PoliciesWorkspace";
import type { GovernanceView } from "@/lib/truly-govern/governance-views";

export default function PoliciesPage() {
  const router = useRouter();

  const onNavigate = useCallback((view: GovernanceView) => {
    if (view.page === "policies-new") {
      router.push("/truly-govern/govern/policies/new");
    } else if (view.page === "policies-detail") {
      router.push(`/truly-govern/govern/policies/${view.id}`);
    }
  }, [router]);

  return <PoliciesWorkspace onNavigate={onNavigate} />;
}
