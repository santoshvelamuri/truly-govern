"use client";
import { useParams, useRouter } from "next/navigation";
import { useCallback } from "react";
import PatternDetailWorkspace from "@/components/truly-govern/patterns/PatternDetailWorkspace";
import type { GovernanceView } from "@/lib/truly-govern/governance-views";

export default function PatternDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const onNavigate = useCallback((view: GovernanceView) => {
    if (view.page === "patterns") router.push("/truly-govern/govern/patterns");
    else if (view.page === "patterns-detail") router.push(`/truly-govern/govern/patterns/${view.id}`);
    else if (view.page === "patterns-review") router.push(`/truly-govern/govern/patterns/${view.id}/review`);
    else if (view.page === "patterns-new") router.push("/truly-govern/govern/patterns/new");
  }, [router]);
  return <PatternDetailWorkspace patternId={id} onNavigate={onNavigate} />;
}
