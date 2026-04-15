"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback } from "react";
import PolicyDetailWorkspace from "@/components/truly-govern/policies/PolicyDetailWorkspace";
import type { GovernanceView } from "@/lib/truly-govern/governance-views";

export default function PolicyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const onNavigate = useCallback((view: GovernanceView) => {
    if (view.page === "policies") {
      router.push("/truly-govern/govern/policies");
    } else if (view.page === "policies-detail") {
      router.push(`/truly-govern/govern/policies/${view.id}`);
    }
  }, [router]);

  return <PolicyDetailWorkspace policyId={id} onNavigate={onNavigate} />;
}
