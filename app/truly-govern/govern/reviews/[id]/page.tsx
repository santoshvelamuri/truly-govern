"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback } from "react";
import ReviewWorkbench from "@/components/truly-govern/reviews/ReviewWorkbench";
import type { GovernanceView } from "@/lib/truly-govern/governance-views";

export default function ReviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const onNavigate = useCallback((view: GovernanceView) => {
    if (view.page === "reviews") {
      router.push("/truly-govern/govern/reviews");
    } else if (view.page === "reviews-detail") {
      router.push(`/truly-govern/govern/reviews/${view.id}`);
    }
  }, [router]);

  return <ReviewWorkbench reviewId={id} onNavigate={onNavigate} />;
}
