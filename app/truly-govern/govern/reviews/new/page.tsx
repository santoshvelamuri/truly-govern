"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import NewReviewWorkspace from "@/components/truly-govern/reviews/NewReviewWorkspace";
import type { GovernanceView } from "@/lib/truly-govern/governance-views";

export default function NewReviewPage() {
  const router = useRouter();

  const onNavigate = useCallback((view: GovernanceView) => {
    if (view.page === "reviews") {
      router.push("/truly-govern/govern/reviews");
    } else if (view.page === "reviews-detail") {
      router.push(`/truly-govern/govern/reviews/${view.id}`);
    }
  }, [router]);

  return <NewReviewWorkspace onNavigate={onNavigate} />;
}
