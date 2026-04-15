"use client";
import { useParams, useRouter } from "next/navigation";
import { useCallback } from "react";
import PatternReviewWorkspace from "@/components/truly-govern/patterns/PatternReviewWorkspace";
import type { GovernanceView } from "@/lib/truly-govern/governance-views";

export default function PatternReviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const onNavigate = useCallback((view: GovernanceView) => {
    if (view.page === "patterns") router.push("/truly-govern/govern/patterns");
    else if (view.page === "patterns-detail") router.push(`/truly-govern/govern/patterns/${view.id}`);
  }, [router]);
  return <PatternReviewWorkspace patternId={id} onNavigate={onNavigate} />;
}
