"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import NewPolicyWorkspace from "@/components/truly-govern/policies/NewPolicyWorkspace";
import type { GovernanceView } from "@/lib/truly-govern/governance-views";

export default function NewPolicyPage() {
  const router = useRouter();

  const onNavigate = useCallback((view: GovernanceView) => {
    if (view.page === "policies") {
      router.push("/truly-govern/govern/policies");
    } else if (view.page === "policies-detail") {
      router.push(`/truly-govern/govern/policies/${view.id}`);
    }
  }, [router]);

  return <NewPolicyWorkspace onNavigate={onNavigate} />;
}
