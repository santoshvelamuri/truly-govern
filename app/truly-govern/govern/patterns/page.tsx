"use client";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import PatternsWorkspace from "@/components/truly-govern/patterns/PatternsWorkspace";
import type { GovernanceView } from "@/lib/truly-govern/governance-views";

export default function PatternsPage() {
  const router = useRouter();
  const onNavigate = useCallback((view: GovernanceView) => {
    if (view.page === "patterns-new") router.push("/truly-govern/govern/patterns/new");
    else if (view.page === "patterns-detail") router.push(`/truly-govern/govern/patterns/${view.id}`);
  }, [router]);
  return <PatternsWorkspace onNavigate={onNavigate} />;
}
