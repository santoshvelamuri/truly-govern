"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import ReviewsWorkspace from "@/components/truly-govern/reviews/ReviewsWorkspace";
import type { GovernanceView } from "@/lib/truly-govern/governance-views";

export default function ReviewsPage() {
  const router = useRouter();

  const onNavigate = useCallback((view: GovernanceView) => {
    if (view.page === "reviews-new") {
      router.push("/truly-govern/govern/reviews/new");
    } else if (view.page === "reviews-detail") {
      router.push(`/truly-govern/govern/reviews/${view.id}`);
    }
  }, [router]);

  return <ReviewsWorkspace onNavigate={onNavigate} />;
}
