"use client";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import NewPatternWorkspace from "@/components/truly-govern/patterns/NewPatternWorkspace";
import type { GovernanceView } from "@/lib/truly-govern/governance-views";

export default function NewPatternPage() {
  const router = useRouter();
  const onNavigate = useCallback((view: GovernanceView) => {
    if (view.page === "patterns") router.push("/truly-govern/govern/patterns");
    else if (view.page === "patterns-detail") router.push(`/truly-govern/govern/patterns/${view.id}`);
  }, [router]);
  return <NewPatternWorkspace onNavigate={onNavigate} />;
}
